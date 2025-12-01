#!/bin/bash
# Automatic stack recovery for CI/CD pipeline
# Handles UPDATE_ROLLBACK_FAILED and other problematic states

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Get parameters
ENV=${1:-development}
REGION=${AWS_REGION:-eu-west-1}
MAX_RETRIES=${MAX_RETRIES:-3}
RETRY_DELAY=${RETRY_DELAY:-30}

print_info "Stack Recovery Tool"
print_info "Environment: $ENV"
print_info "Region: $REGION"
print_info "Max Retries: $MAX_RETRIES"
echo ""

# Function to get stack status
get_stack_status() {
    local stack_name=$1
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$REGION" \
        --query "Stacks[0].StackStatus" \
        --output text 2>/dev/null || echo "DOES_NOT_EXIST"
}

# Function to check if stack is in failed state
is_failed_state() {
    local status=$1
    case $status in
        UPDATE_ROLLBACK_FAILED|UPDATE_FAILED|CREATE_FAILED|DELETE_FAILED|ROLLBACK_FAILED)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Function to check if stack is in rollback complete state
is_rollback_complete() {
    local status=$1
    case $status in
        UPDATE_ROLLBACK_COMPLETE|ROLLBACK_COMPLETE)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Function to continue update rollback
continue_update_rollback() {
    local stack_name=$1
    
    print_step "Attempting to continue update rollback for: $stack_name"
    
    if aws cloudformation continue-update-rollback \
        --stack-name "$stack_name" \
        --region "$REGION" 2>/dev/null; then
        
        print_info "Rollback continuation initiated"
        
        # Wait for rollback to complete
        print_info "Waiting for rollback to complete..."
        aws cloudformation wait stack-rollback-complete \
            --stack-name "$stack_name" \
            --region "$REGION" 2>/dev/null || true
        
        local final_status=$(get_stack_status "$stack_name")
        print_info "Final status: $final_status"
        
        return 0
    else
        print_warning "Could not continue rollback automatically"
        return 1
    fi
}

# Function to get failed resources
get_failed_resources() {
    local stack_name=$1
    
    print_step "Identifying failed resources in: $stack_name"
    
    aws cloudformation describe-stack-resources \
        --stack-name "$stack_name" \
        --region "$REGION" \
        --query "StackResources[?contains(ResourceStatus, 'FAILED')].[LogicalResourceId,ResourceType,ResourceStatus,ResourceStatusReason]" \
        --output table 2>/dev/null || echo "No failed resources found"
}

# Function to skip failed resources and continue rollback
skip_failed_resources() {
    local stack_name=$1
    
    print_step "Attempting to skip failed resources for: $stack_name"
    
    # Get list of failed resources
    local failed_resources=$(aws cloudformation describe-stack-resources \
        --stack-name "$stack_name" \
        --region "$REGION" \
        --query "StackResources[?contains(ResourceStatus, 'FAILED')].LogicalResourceId" \
        --output text 2>/dev/null)
    
    if [ -z "$failed_resources" ]; then
        print_info "No failed resources to skip"
        return 0
    fi
    
    print_info "Failed resources: $failed_resources"
    
    # Try to continue rollback with resource skipping
    if aws cloudformation continue-update-rollback \
        --stack-name "$stack_name" \
        --region "$REGION" \
        --resources-to-skip $failed_resources 2>/dev/null; then
        
        print_info "Rollback continuation with resource skipping initiated"
        
        # Wait for rollback to complete
        aws cloudformation wait stack-rollback-complete \
            --stack-name "$stack_name" \
            --region "$REGION" 2>/dev/null || true
        
        return 0
    else
        print_error "Failed to skip resources and continue rollback"
        return 1
    fi
}

# Function to recover a single stack
recover_stack() {
    local stack_name=$1
    local retry_count=0
    
    print_step "Recovering stack: $stack_name"
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        local status=$(get_stack_status "$stack_name")
        print_info "Current status: $status"
        
        case $status in
            DOES_NOT_EXIST)
                print_info "Stack does not exist, no recovery needed"
                return 0
                ;;
                
            UPDATE_COMPLETE|CREATE_COMPLETE)
                print_info "✓ Stack is in healthy state"
                return 0
                ;;
                
            UPDATE_ROLLBACK_FAILED)
                print_warning "Stack in UPDATE_ROLLBACK_FAILED state"
                get_failed_resources "$stack_name"
                
                # Try to continue rollback
                if continue_update_rollback "$stack_name"; then
                    print_info "✓ Rollback continued successfully"
                    return 0
                fi
                
                # Try to skip failed resources
                if skip_failed_resources "$stack_name"; then
                    print_info "✓ Rollback completed with resource skipping"
                    return 0
                fi
                
                print_error "Failed to recover from UPDATE_ROLLBACK_FAILED"
                ;;
                
            UPDATE_ROLLBACK_COMPLETE|ROLLBACK_COMPLETE)
                print_warning "Stack in rollback complete state"
                print_info "Stack is stable but in rolled-back state"
                print_info "Deployment will attempt to update from this state"
                return 0
                ;;
                
            UPDATE_FAILED|CREATE_FAILED)
                print_warning "Stack in failed state: $status"
                
                # Wait a bit for automatic rollback to start
                print_info "Waiting for automatic rollback to start..."
                sleep $RETRY_DELAY
                
                local new_status=$(get_stack_status "$stack_name")
                if [ "$new_status" != "$status" ]; then
                    print_info "Status changed to: $new_status"
                    continue
                fi
                ;;
                
            *IN_PROGRESS)
                print_info "Stack operation in progress: $status"
                print_info "Waiting for operation to complete..."
                sleep $RETRY_DELAY
                continue
                ;;
                
            *)
                print_warning "Unknown status: $status"
                ;;
        esac
        
        retry_count=$((retry_count + 1))
        if [ $retry_count -lt $MAX_RETRIES ]; then
            print_info "Retry $retry_count/$MAX_RETRIES - waiting ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi
    done
    
    print_error "Failed to recover stack after $MAX_RETRIES attempts"
    return 1
}

# Main recovery logic
print_step "Checking all stacks for environment: $ENV"
echo ""

# Define stacks in dependency order (reverse for recovery)
STACKS=(
    "MonitoringStack-${ENV}"
    "LoadBalancerStack-${ENV}"
    "ComputeStack-${ENV}"
    "StorageStack-${ENV}"
    "NetworkingStack-${ENV}"
)

RECOVERY_NEEDED=false
FAILED_STACKS=()

# Check all stacks
for stack in "${STACKS[@]}"; do
    status=$(get_stack_status "$stack")
    
    if [ "$status" = "DOES_NOT_EXIST" ]; then
        continue
    fi
    
    echo "  $stack: $status"
    
    if is_failed_state "$status" || is_rollback_complete "$status"; then
        RECOVERY_NEEDED=true
        FAILED_STACKS+=("$stack")
    fi
done

echo ""

if [ "$RECOVERY_NEEDED" = false ]; then
    print_info "✓ All stacks are in healthy state"
    print_info "No recovery needed"
    exit 0
fi

print_warning "Recovery needed for ${#FAILED_STACKS[@]} stack(s)"
echo ""

# Attempt recovery for each failed stack
RECOVERY_SUCCESS=true

for stack in "${FAILED_STACKS[@]}"; do
    if ! recover_stack "$stack"; then
        RECOVERY_SUCCESS=false
        print_error "Failed to recover: $stack"
    fi
    echo ""
done

if [ "$RECOVERY_SUCCESS" = true ]; then
    print_info "✓ All stacks recovered successfully"
    print_info "Deployment can proceed"
    exit 0
else
    print_error "Some stacks could not be recovered automatically"
    print_warning "Manual intervention may be required"
    print_info "Check CloudFormation console for details"
    exit 1
fi
