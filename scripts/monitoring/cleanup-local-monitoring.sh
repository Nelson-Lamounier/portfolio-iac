#!/usr/bin/env bash
# @format
# =============================================================================
# Cleanup Local Monitoring Stacks
# =============================================================================
# Removes local monitoring stacks from application accounts when switching
# to centralized monitoring in the pipeline account.
#
# Usage:
#   ./scripts/monitoring/cleanup-local-monitoring.sh [environment]
#
# Examples:
#   ./scripts/monitoring/cleanup-local-monitoring.sh development
#   ./scripts/monitoring/cleanup-local-monitoring.sh staging
#   ./scripts/monitoring/cleanup-local-monitoring.sh production
# =============================================================================

set -euo pipefail

ENVIRONMENT="${1:-}"
AWS_REGION="${AWS_REGION:-eu-west-1}"

if [ -z "$ENVIRONMENT" ]; then
  echo "Usage: $0 <environment>"
  echo ""
  echo "Examples:"
  echo "  $0 development"
  echo "  $0 staging"
  echo "  $0 production"
  exit 1
fi

echo "========================================="
echo "Cleanup Local Monitoring Stacks"
echo "========================================="
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo ""

# Function to check if stack exists
stack_exists() {
  aws cloudformation describe-stacks \
    --stack-name "$1" \
    --region "$AWS_REGION" \
    &>/dev/null
}

# Function to delete stack
delete_stack() {
  local stack_name="$1"
  
  if stack_exists "$stack_name"; then
    echo "Deleting $stack_name..."
    aws cloudformation delete-stack \
      --stack-name "$stack_name" \
      --region "$AWS_REGION"
    
    echo "Waiting for $stack_name to be deleted..."
    aws cloudformation wait stack-delete-complete \
      --stack-name "$stack_name" \
      --region "$AWS_REGION" 2>/dev/null || {
      echo "⚠ Stack deletion may have failed or timed out"
      echo "  Check stack status: aws cloudformation describe-stacks --stack-name $stack_name"
    }
    
    echo "✓ $stack_name deleted"
  else
    echo "✓ $stack_name does not exist (already cleaned up)"
  fi
  echo ""
}

# Check what monitoring stacks exist
echo "Checking for existing monitoring stacks..."
MONITORING_STACKS=$(aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE \
  --query "StackSummaries[?contains(StackName, 'Monitoring') && contains(StackName, '$ENVIRONMENT')].StackName" \
  --output text \
  --region "$AWS_REGION" || echo "")

if [ -z "$MONITORING_STACKS" ]; then
  echo "✓ No local monitoring stacks found for $ENVIRONMENT"
  echo ""
  echo "You're all set! Using centralized monitoring in pipeline account."
  exit 0
fi

echo "Found monitoring stacks:"
echo "$MONITORING_STACKS"
echo ""

# Confirm deletion
read -p "Delete these stacks? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "Deleting stacks in reverse dependency order..."
echo ""

# Delete in reverse order (services before infrastructure)
delete_stack "MonitoringEcsStack-$ENVIRONMENT"
delete_stack "MonitoringStack-$ENVIRONMENT"

echo "========================================="
echo "Cleanup Complete"
echo "========================================="
echo ""
echo "Local monitoring stacks removed from $ENVIRONMENT account."
echo ""
echo "Next steps:"
echo "  1. Ensure centralized monitoring is deployed in pipeline account"
echo "  2. Verify cross-account access is configured"
echo "  3. Check VPC peering is established"
echo ""
echo "Deploy centralized monitoring:"
echo "  make deploy-monitoring-layered"
echo ""
echo "Setup cross-account access:"
echo "  cd infrastructure"
echo "  ENVIRONMENT=$ENVIRONMENT yarn cdk deploy CrossAccountMonitoring-$ENVIRONMENT"
echo ""
