#!/bin/bash
# recover-failed-stacks.sh - Recover CloudFormation stacks from failed states

set -e

ENVIRONMENT=${ENVIRONMENT:-pipeline}
REGION=${AWS_REGION:-eu-west-1}

echo "🔧 CloudFormation Stack Recovery Tool"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Function to check stack status
check_stack_status() {
    local stack_name=$1
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND"
}

# Function to recover stack from failed state
recover_stack() {
    local stack_name=$1
    local status=$2
    
    echo "🔄 Recovering $stack_name from $status state..."
    
    case $status in
        "UPDATE_ROLLBACK_COMPLETE")
            echo "  Stack is in rollback complete state"
            echo "  This means a previous update failed and was rolled back"
            
            # Special handling for MonitoringInfraStack with resource mismatches
            if [[ "$stack_name" == *"MonitoringInfraStack"* ]]; then
                echo "  🔍 Checking for resource reference mismatches..."
                
                # Check if this is a "resource not found" issue by looking at recent events
                RECENT_ERROR=$(aws cloudformation describe-stack-events \
                    --stack-name "$stack_name" \
                    --query 'StackEvents[?ResourceStatus==`UPDATE_ROLLBACK_COMPLETE`] | [0].ResourceStatusReason' \
                    --output text 2>/dev/null || echo "")
                
                if [[ "$RECENT_ERROR" == *"not found"* ]] || [[ "$RECENT_ERROR" == *"NotFound"* ]]; then
                    echo "  ⚠️ Detected resource reference mismatch (resources were deleted outside CloudFormation)"
                    echo "  🔄 This stack needs to be deleted and recreated"
                    echo "  Deleting stack to clear invalid resource references..."
                    
                    aws cloudformation delete-stack --stack-name "$stack_name" 2>/dev/null || true
                    echo "  Stack deletion initiated - it will be recreated on next deployment"
                    return 0
                else
                    echo "  The stack is in a stable state and ready for a new deployment"
                    echo "  ✅ Stack is ready for deployment"
                fi
            else
                echo "  The stack is in a stable state and ready for a new deployment"
                echo "  ✅ Stack is ready for deployment"
            fi
            ;;
        "UPDATE_ROLLBACK_IN_PROGRESS")
            echo "  Stack is rolling back - waiting for completion..."
            aws cloudformation wait stack-update-complete \
                --stack-name "$stack_name" || {
                echo "  Rollback did not complete successfully"
                return 1
            }
            echo "  Rollback completed"
            ;;
        "UPDATE_ROLLBACK_FAILED")
            echo "  Stack rollback failed - attempting to continue rollback"
            aws cloudformation continue-update-rollback \
                --stack-name "$stack_name" 2>/dev/null || {
                echo "  Cannot recover from UPDATE_ROLLBACK_FAILED - manual intervention required"
                echo "  Suggested actions:"
                echo "    1. Check CloudFormation console for specific errors"
                echo "    2. Fix resource issues manually"
                echo "    3. Use continue-update-rollback with skip-resources if needed"
                return 1
            }
            echo "  Continue rollback initiated"
            ;;
        "CREATE_FAILED"|"DELETE_FAILED")
            echo "  Stack creation/deletion failed - attempting to delete stack"
            aws cloudformation delete-stack --stack-name "$stack_name"
            echo "  Stack deletion initiated"
            ;;
        *)
            echo "  Stack is in $status state - no recovery action needed"
            ;;
    esac
}

# Function to wait for stack to reach stable state
wait_for_stable_state() {
    local stack_name=$1
    local max_attempts=30
    local attempt=1
    
    echo "⏳ Waiting for $stack_name to reach stable state..."
    
    while [ $attempt -le $max_attempts ]; do
        local status=$(check_stack_status "$stack_name")
        
        case $status in
            "CREATE_COMPLETE"|"UPDATE_COMPLETE"|"DELETE_COMPLETE"|"NOT_FOUND")
                echo "  ✅ Stack is in stable state: $status"
                return 0
                ;;
            "CREATE_IN_PROGRESS"|"UPDATE_IN_PROGRESS"|"DELETE_IN_PROGRESS"|"UPDATE_ROLLBACK_IN_PROGRESS")
                echo "  ⏳ Stack is in progress: $status (attempt $attempt/$max_attempts)"
                sleep 30
                ;;
            *)
                echo "  ⚠️ Stack is in potentially problematic state: $status"
                return 1
                ;;
        esac
        
        attempt=$((attempt + 1))
    done
    
    echo "  Timeout waiting for stack to stabilize"
    return 1
}

# Main recovery process
echo "Checking monitoring stack states..."

# Define stacks in dependency order (reverse for deletion)
STACKS=(
    "NetworkingStack-$ENVIRONMENT"
    "VpcPeeringStack-$ENVIRONMENT" 
    "MonitoringInfraStack-$ENVIRONMENT"
    "MonitoringServiceStack-$ENVIRONMENT"
)

# Check all stack states
echo ""
echo "Current stack states:"
for stack in "${STACKS[@]}"; do
    status=$(check_stack_status "$stack")
    echo "  $stack: $status"
done

echo ""
echo "🔧 Starting recovery process..."

# Check for ALB resource conflicts (common cause of MonitoringInfraStack failures)
monitoring_infra_status=$(check_stack_status "MonitoringInfraStack-$ENVIRONMENT")
if [ "$monitoring_infra_status" = "UPDATE_ROLLBACK_COMPLETE" ]; then
    echo ""
    echo "🔍 MonitoringInfraStack failed - checking for ALB resource conflicts..."
    
    # Check if ALB exists outside of CloudFormation
    ALB_EXISTS=$(aws elbv2 describe-load-balancers \
        --names "${ENVIRONMENT}-monitoring-alb" \
        --query 'LoadBalancers[0].LoadBalancerArn' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$ALB_EXISTS" != "NOT_FOUND" ]; then
        echo "  ⚠️ Found orphaned ALB resources that may be blocking deployment"
        echo "  🧹 Running ALB cleanup..."
        
        chmod +x ./scripts/monitoring/cleanup-alb-resources.sh
        ENVIRONMENT=$ENVIRONMENT ./scripts/monitoring/cleanup-alb-resources.sh
        
        echo "  ✅ ALB cleanup completed - waiting for AWS to process deletions..."
        sleep 30
    else
        echo "  ✅ No ALB resource conflicts detected"
    fi
fi

# Handle VPC Peering dependency issue
vpc_peering_status=$(check_stack_status "VpcPeeringStack-$ENVIRONMENT")
networking_status=$(check_stack_status "NetworkingStack-$ENVIRONMENT")

if [ "$vpc_peering_status" != "NOT_FOUND" ] && [ "$vpc_peering_status" != "DELETE_COMPLETE" ] && \
   [ "$networking_status" = "UPDATE_ROLLBACK_COMPLETE" ]; then
    echo ""
    echo "🔗 Detected VPC Peering dependency blocking networking updates"
    echo "Temporarily removing VPC Peering to allow networking recovery..."
    
    aws cloudformation delete-stack --stack-name "VpcPeeringStack-$ENVIRONMENT"
    wait_for_stable_state "VpcPeeringStack-$ENVIRONMENT"
fi

# Recover each stack
for stack in "${STACKS[@]}"; do
    status=$(check_stack_status "$stack")
    
    if [ "$status" != "NOT_FOUND" ] && [ "$status" != "CREATE_COMPLETE" ] && [ "$status" != "UPDATE_COMPLETE" ]; then
        echo ""
        recover_stack "$stack" "$status"
        wait_for_stable_state "$stack"
    fi
done

echo ""
echo "📋 Final stack states:"
for stack in "${STACKS[@]}"; do
    status=$(check_stack_status "$stack")
    case $status in
        "CREATE_COMPLETE"|"UPDATE_COMPLETE"|"DELETE_COMPLETE"|"NOT_FOUND")
            echo "  $stack: $status"
            ;;
        *)
            echo "  $stack: $status"
            ;;
    esac
done

echo ""
echo "Recovery Summary:"
echo "- Stacks should now be in a deployable state"
echo "- You can proceed with normal deployment"
echo "- If any stacks still show issues, check CloudFormation console for details"

echo ""
echo "Next Steps:"
echo "1. For UPDATE_ROLLBACK_COMPLETE stacks: Simply redeploy normally"
echo "2. For other failed states: Check CloudFormation console for specific errors"
echo "3. If deployment still fails, consider using --exclusively flag:"
echo "   cd infrastructure && ENVIRONMENT=pipeline yarn cdk deploy NetworkingStack-pipeline --exclusively"

echo ""
echo "Stack recovery process completed"