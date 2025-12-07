#!/usr/bin/env bash
# @format
# =============================================================================
# Update Prometheus Targets Dynamically
# =============================================================================
# This script fetches current EC2 IPs from application accounts and updates
# the Prometheus configuration if IPs have changed. This ensures monitoring
# continues to work even when EC2 instances are replaced.
#
# Usage:
#   AWS_REGION=eu-west-1 ./scripts/monitoring/update-prometheus-targets.sh
#
# Can be run:
#   - Manually when you know IPs have changed
#   - Scheduled via cron/EventBridge every 5-15 minutes
#   - Triggered by CloudWatch alarms when targets become unreachable
#
# Prerequisites:
#   - AWS credentials with cross-account access
#   - Monitoring stack deployed in pipeline account
#   - Application stacks deployed in dev/staging/prod accounts
# =============================================================================

set -euo pipefail

# Configuration
AWS_REGION="${AWS_REGION:-eu-west-1}"
MONITORING_ENV="pipeline"
STACK_NAME="MonitoringEcsStack-${MONITORING_ENV}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

echo "========================================="
echo "Update Prometheus Targets"
echo "========================================="
echo "Region: ${AWS_REGION}"
echo "Monitoring Stack: ${STACK_NAME}"
echo ""

# =============================================================================
# Fetch Current IPs from Application Accounts
# =============================================================================

# Development
log_info "Fetching development account IPs..."
DEV_VPC_ID=""
DEV_NODE_EXPORTER_IP=""

if [ -n "${AWS_ACCOUNT_ID_DEV:-}" ]; then
  # Assume role in dev account
  DEV_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID_DEV}:role/GitHubActionsDeploymentRole"
  
  CREDS=$(aws sts assume-role \
    --role-arn "${DEV_ROLE_ARN}" \
    --role-session-name "PrometheusTargetUpdate" \
    --duration-seconds 900 \
    --query 'Credentials' \
    --output json 2>/dev/null || echo "")
  
  if [ -n "${CREDS}" ]; then
    export AWS_ACCESS_KEY_ID=$(echo "${CREDS}" | jq -r '.AccessKeyId')
    export AWS_SECRET_ACCESS_KEY=$(echo "${CREDS}" | jq -r '.SecretAccessKey')
    export AWS_SESSION_TOKEN=$(echo "${CREDS}" | jq -r '.SessionToken')
    
    # Fetch VPC ID
    DEV_VPC_ID=$(aws ssm get-parameter \
      --name "/networking/development/vpc-id" \
      --query 'Parameter.Value' \
      --output text \
      --region "${AWS_REGION}" 2>/dev/null || echo "")
    
    # Fetch EC2 IP dynamically from ECS
    CLUSTER_NAME="ecs-cluster-development"
    CONTAINER_INSTANCE_ARN=$(aws ecs list-container-instances \
      --cluster "${CLUSTER_NAME}" \
      --query 'containerInstanceArns[0]' \
      --output text \
      --region "${AWS_REGION}" 2>/dev/null || echo "")
    
    if [ -n "${CONTAINER_INSTANCE_ARN}" ] && [ "${CONTAINER_INSTANCE_ARN}" != "None" ]; then
      EC2_INSTANCE_ID=$(aws ecs describe-container-instances \
        --cluster "${CLUSTER_NAME}" \
        --container-instances "${CONTAINER_INSTANCE_ARN}" \
        --query 'containerInstances[0].ec2InstanceId' \
        --output text \
        --region "${AWS_REGION}" 2>/dev/null || echo "")
      
      if [ -n "${EC2_INSTANCE_ID}" ] && [ "${EC2_INSTANCE_ID}" != "None" ]; then
        DEV_NODE_EXPORTER_IP=$(aws ec2 describe-instances \
          --instance-ids "${EC2_INSTANCE_ID}" \
          --query 'Reservations[0].Instances[0].PrivateIpAddress' \
          --output text \
          --region "${AWS_REGION}" 2>/dev/null || echo "")
      fi
    fi
    
    # Clear credentials
    unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
    
    if [ -n "${DEV_NODE_EXPORTER_IP}" ]; then
      log_info "Development IP: ${DEV_NODE_EXPORTER_IP}"
    else
      log_warn "Development IP not found"
    fi
  else
    log_warn "Cannot assume role in development account"
  fi
else
  log_warn "AWS_ACCOUNT_ID_DEV not set, skipping development"
fi

# Staging (similar pattern)
STAGING_NODE_EXPORTER_IP=""
if [ -n "${AWS_ACCOUNT_ID_STAGING:-}" ]; then
  log_info "Fetching staging account IPs..."
  # TODO: Implement staging fetch (same as dev)
fi

# Production (similar pattern)
PROD_NODE_EXPORTER_IP=""
if [ -n "${AWS_ACCOUNT_ID_PROD:-}" ]; then
  log_info "Fetching production account IPs..."
  # TODO: Implement production fetch (same as dev)
fi

# =============================================================================
# Check if IPs have changed
# =============================================================================

echo ""
log_info "Checking if configuration needs update..."

# Get current Prometheus config from ECS task
TASK_ARN=$(aws ecs list-tasks \
  --cluster "ecs-cluster-${MONITORING_ENV}" \
  --service-name "prometheus-service" \
  --query 'taskArns[0]' \
  --output text \
  --region "${AWS_REGION}" 2>/dev/null || echo "")

NEEDS_UPDATE=false

if [ -n "${TASK_ARN}" ] && [ "${TASK_ARN}" != "None" ]; then
  # Get task definition to check current environment variables
  TASK_DEF=$(aws ecs describe-tasks \
    --cluster "ecs-cluster-${MONITORING_ENV}" \
    --tasks "${TASK_ARN}" \
    --query 'tasks[0].taskDefinitionArn' \
    --output text \
    --region "${AWS_REGION}" 2>/dev/null || echo "")
  
  if [ -n "${TASK_DEF}" ]; then
    # Check if IPs in task definition match current IPs
    CURRENT_DEV_IP=$(aws ecs describe-task-definition \
      --task-definition "${TASK_DEF}" \
      --query 'taskDefinition.containerDefinitions[0].environment[?name==`DEV_NODE_EXPORTER_IP`].value' \
      --output text \
      --region "${AWS_REGION}" 2>/dev/null || echo "")
    
    if [ "${CURRENT_DEV_IP}" != "${DEV_NODE_EXPORTER_IP}" ]; then
      log_warn "Development IP changed: ${CURRENT_DEV_IP} → ${DEV_NODE_EXPORTER_IP}"
      NEEDS_UPDATE=true
    else
      log_info "Development IP unchanged: ${DEV_NODE_EXPORTER_IP}"
    fi
  fi
fi

# =============================================================================
# Update Configuration if Needed
# =============================================================================

if [ "${NEEDS_UPDATE}" = "true" ]; then
  echo ""
  log_info "Updating Prometheus configuration..."
  
  # Redeploy monitoring stack with new IPs
  cd infrastructure
  
  export DEV_NODE_EXPORTER_IP
  export STAGING_NODE_EXPORTER_IP
  export PROD_NODE_EXPORTER_IP
  
  yarn cdk deploy MonitoringEcsStack-${MONITORING_ENV} \
    --require-approval never \
    --region "${AWS_REGION}"
  
  log_info "Configuration updated successfully"
  
  # Wait for service to stabilize
  log_info "Waiting for service to stabilize..."
  aws ecs wait services-stable \
    --cluster "ecs-cluster-${MONITORING_ENV}" \
    --services "prometheus-service" \
    --region "${AWS_REGION}"
  
  log_info "Service is stable"
else
  log_info "No configuration changes needed"
fi

echo ""
echo "========================================="
echo "Summary"
echo "========================================="
echo "Development IP: ${DEV_NODE_EXPORTER_IP:-NOT_FOUND}"
echo "Staging IP:     ${STAGING_NODE_EXPORTER_IP:-NOT_FOUND}"
echo "Production IP:  ${PROD_NODE_EXPORTER_IP:-NOT_FOUND}"
echo "Update Needed:  ${NEEDS_UPDATE}"
echo ""
log_info "Done"
