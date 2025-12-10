#!/bin/bash
# cleanup-alb-resources.sh - Clean up orphaned ALB resources that block deployment

set -e

ENVIRONMENT=${ENVIRONMENT:-pipeline}
REGION=${AWS_REGION:-eu-west-1}

echo "🧹 Cleaning up orphaned ALB resources"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Function to check if ALB exists
check_alb_exists() {
    local alb_name=$1
    aws elbv2 describe-load-balancers \
        --names "$alb_name" \
        --query 'LoadBalancers[0].LoadBalancerArn' \
        --output text 2>/dev/null || echo "NOT_FOUND"
}

# Function to delete ALB and all associated resources
cleanup_alb() {
    local alb_name=$1
    
    echo "🔍 Checking for ALB: $alb_name"
    
    ALB_ARN=$(check_alb_exists "$alb_name")
    
    if [ "$ALB_ARN" = "NOT_FOUND" ]; then
        echo "  ✅ ALB $alb_name not found - no cleanup needed"
        return 0
    fi
    
    echo "  ⚠️ Found ALB: $ALB_ARN"
    echo "  🗑️ Cleaning up ALB resources..."
    
    # Get all listeners
    echo "    Deleting listeners..."
    LISTENERS=$(aws elbv2 describe-listeners \
        --load-balancer-arn "$ALB_ARN" \
        --query 'Listeners[].ListenerArn' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$LISTENERS" ]; then
        for listener_arn in $LISTENERS; do
            echo "      Deleting listener: $listener_arn"
            aws elbv2 delete-listener --listener-arn "$listener_arn" 2>/dev/null || true
        done
    fi
    
    # Get all target groups associated with this ALB
    echo "    Deleting target groups..."
    TARGET_GROUPS=$(aws elbv2 describe-target-groups \
        --load-balancer-arn "$ALB_ARN" \
        --query 'TargetGroups[].TargetGroupArn' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$TARGET_GROUPS" ]; then
        for tg_arn in $TARGET_GROUPS; do
            echo "      Deleting target group: $tg_arn"
            aws elbv2 delete-target-group --target-group-arn "$tg_arn" 2>/dev/null || true
        done
    fi
    
    # Wait a moment for resources to be deleted
    echo "    Waiting for resources to be deleted..."
    sleep 10
    
    # Delete the ALB
    echo "    Deleting ALB: $ALB_ARN"
    aws elbv2 delete-load-balancer --load-balancer-arn "$ALB_ARN" 2>/dev/null || true
    
    echo "  ✅ ALB cleanup completed"
}

# Function to cleanup security groups
cleanup_security_groups() {
    echo "🔍 Checking for orphaned security groups..."
    
    # Find security groups with monitoring ALB in the name
    SG_IDS=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=*MonitoringAlbSg*" \
        --query 'SecurityGroups[].GroupId' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$SG_IDS" ]; then
        for sg_id in $SG_IDS; do
            echo "  🗑️ Attempting to delete security group: $sg_id"
            aws ec2 delete-security-group --group-id "$sg_id" 2>/dev/null || {
                echo "    ⚠️ Could not delete security group $sg_id (may be in use)"
            }
        done
    else
        echo "  ✅ No orphaned security groups found"
    fi
}

# Main cleanup process
echo "Starting ALB resource cleanup..."

# Clean up the monitoring ALB
cleanup_alb "${ENVIRONMENT}-monitoring-alb"

# Clean up any orphaned security groups
cleanup_security_groups

echo ""
echo "📋 Cleanup Summary:"
echo "- Checked and cleaned up ALB: ${ENVIRONMENT}-monitoring-alb"
echo "- Removed associated listeners and target groups"
echo "- Attempted to clean up orphaned security groups"
echo ""
echo "✅ ALB resource cleanup completed"
echo ""
echo "Next steps:"
echo "1. Wait 2-3 minutes for AWS to fully process the deletions"
echo "2. Retry your CDK deployment"
echo "3. If issues persist, check the AWS Console for any remaining resources"
