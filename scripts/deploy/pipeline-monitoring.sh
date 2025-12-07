#!/bin/bash
# =============================================================================
# Deploy Pipeline Monitoring Infrastructure
# =============================================================================
# This script deploys the monitoring infrastructure to the pipeline account.
# It supports both layered (recommended) and embedded (legacy) architectures.
#
# Usage:
#   ./scripts/deploy/pipeline-monitoring.sh [action] [options]
#
# Actions:
#   deploy-all        - Deploy full stack (networking + monitoring)
#   deploy-infra      - Deploy Layer 1: Infrastructure only
#   deploy-services   - Deploy Layer 2: Services only
#   sync-config       - Sync config to EFS (Layer 3)
#   destroy           - Destroy all monitoring stacks
#
# Options:
#   --layered         - Use layered architecture (default)
#   --embedded        - Use embedded architecture (legacy)
#   --skip-vpc-peering - Skip VPC peering deployment
# =============================================================================

set -e

# Default values
ACTION="${1:-deploy-all}"
USE_LAYERED="true"
SKIP_VPC_PEERING="false"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Parse options
shift || true
while [[ $# -gt 0 ]]; do
  case $1 in
    --layered)
      USE_LAYERED="true"
      shift
      ;;
    --embedded)
      USE_LAYERED="false"
      shift
      ;;
    --skip-vpc-peering)
      SKIP_VPC_PEERING="true"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "========================================="
echo "Pipeline Monitoring Deployment"
echo "========================================="
echo "Action: $ACTION"
echo "Architecture: $([ "$USE_LAYERED" = "true" ] && echo "Layered (recommended)" || echo "Embedded (legacy)")"
echo "Skip VPC Peering: $SKIP_VPC_PEERING"
echo ""

cd "$PROJECT_ROOT"

# Function to check if stack exists
stack_exists() {
  aws cloudformation describe-stacks --stack-name "$1" &>/dev/null
}

# Function to get dev account info
get_dev_info() {
  echo "Checking for dev account configuration..."
  
  # Try to get dev VPC ID from SSM
  DEV_VPC_ID=$(aws ssm get-parameter \
    --name "/networking/development/vpc-id" \
    --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  
  if [ -n "$DEV_VPC_ID" ]; then
    export DEV_VPC_ID
    echo "  Found dev VPC: $DEV_VPC_ID"
  fi
  
  # Try to get dev EC2 private IP
  DEV_IP=$(aws ssm get-parameter \
    --name "/compute/development/ec2-private-ip" \
    --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  
  if [ -n "$DEV_IP" ]; then
    export DEV_NODE_EXPORTER_IP="$DEV_IP"
    echo "  Found dev EC2 IP: $DEV_IP"
  fi
}

# Deploy networking
deploy_networking() {
  echo ""
  echo "Deploying NetworkingStack-pipeline..."
  cd "$PROJECT_ROOT/infrastructure"
  ENVIRONMENT=pipeline yarn cdk deploy NetworkingStack-pipeline --require-approval never
}

# Deploy VPC peering
deploy_vpc_peering() {
  if [ "$SKIP_VPC_PEERING" = "true" ]; then
    echo "Skipping VPC peering (--skip-vpc-peering flag set)"
    return 0
  fi
  
  if [ -z "$DEV_VPC_ID" ] || [ -z "$AWS_ACCOUNT_ID_DEV" ]; then
    echo "Skipping VPC peering (dev account not configured)"
    echo "  Set DEV_VPC_ID and AWS_ACCOUNT_ID_DEV to enable"
    return 0
  fi
  
  echo ""
  echo "Deploying VpcPeeringStack-pipeline..."
  cd "$PROJECT_ROOT/infrastructure"
  ENVIRONMENT=pipeline yarn cdk deploy VpcPeeringStack-pipeline --require-approval never || {
    echo "Warning: VPC peering deployment failed (may already exist or need manual setup)"
  }
}

# Deploy monitoring infrastructure (Layer 1)
deploy_monitoring_infra() {
  echo ""
  if [ "$USE_LAYERED" = "true" ]; then
    echo "Deploying MonitoringInfraStack-pipeline (Layer 1)..."
    cd "$PROJECT_ROOT/infrastructure"
    USE_LAYERED_MONITORING=true ENVIRONMENT=pipeline \
      yarn cdk deploy MonitoringInfraStack-pipeline --require-approval never
  else
    echo "Deploying MonitoringEcsStack-pipeline (Embedded)..."
    cd "$PROJECT_ROOT/infrastructure"
    ENVIRONMENT=pipeline yarn cdk deploy MonitoringEcsStack-pipeline --require-approval never
  fi
}

# Deploy monitoring services (Layer 2)
deploy_monitoring_services() {
  if [ "$USE_LAYERED" != "true" ]; then
    echo "Services are included in embedded stack, skipping..."
    return 0
  fi
  
  echo ""
  echo "Deploying MonitoringServiceStack-pipeline (Layer 2)..."
  cd "$PROJECT_ROOT/infrastructure"
  USE_LAYERED_MONITORING=true ENVIRONMENT=pipeline \
    yarn cdk deploy MonitoringServiceStack-pipeline --require-approval never
}

# Initialize config on EFS
init_config() {
  echo ""
  echo "Initializing config on EFS..."
  chmod +x "$PROJECT_ROOT/scripts/monitoring/init-config.sh"
  "$PROJECT_ROOT/scripts/monitoring/init-config.sh" --env pipeline || {
    echo "Warning: Init config may have already run"
  }
}

# Sync config to EFS (Layer 3)
sync_config() {
  echo ""
  echo "Syncing config from Git to EFS (Layer 3)..."
  chmod +x "$PROJECT_ROOT/scripts/monitoring/sync-config.sh"
  "$PROJECT_ROOT/scripts/monitoring/sync-config.sh" --env pipeline || {
    echo "Warning: Config sync encountered issues"
  }
}

# Show monitoring URLs
show_urls() {
  echo ""
  echo "========================================="
  echo "Monitoring URLs"
  echo "========================================="
  
  # Try layered stack first, then embedded
  ALB_DNS=$(aws cloudformation describe-stacks \
    --stack-name MonitoringInfraStack-pipeline \
    --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDns`].OutputValue' \
    --output text 2>/dev/null || \
    aws cloudformation describe-stacks \
    --stack-name MonitoringEcsStack-pipeline \
    --query 'Stacks[0].Outputs[?OutputKey==`MonitoringAlbDns`].OutputValue' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$ALB_DNS" ]; then
    echo "Grafana:    http://${ALB_DNS}/grafana (admin/admin)"
    echo "Prometheus: http://${ALB_DNS}/prometheus"
    echo "Targets:    http://${ALB_DNS}/prometheus/targets"
  else
    echo "Could not retrieve ALB DNS. Check stack outputs."
  fi
}

# Destroy all monitoring stacks
destroy_all() {
  echo ""
  echo "Destroying monitoring stacks in reverse dependency order..."
  cd "$PROJECT_ROOT/infrastructure"
  
  # Destroy layered stacks
  ENVIRONMENT=pipeline yarn cdk destroy MonitoringServiceStack-pipeline --force 2>/dev/null || true
  ENVIRONMENT=pipeline yarn cdk destroy MonitoringInfraStack-pipeline --force 2>/dev/null || true
  
  # Destroy embedded stack
  ENVIRONMENT=pipeline yarn cdk destroy MonitoringEcsStack-pipeline --force 2>/dev/null || true
  
  # Destroy VPC peering
  ENVIRONMENT=pipeline yarn cdk destroy VpcPeeringStack-pipeline --force 2>/dev/null || true
  
  # Destroy networking (last)
  ENVIRONMENT=pipeline yarn cdk destroy NetworkingStack-pipeline --force 2>/dev/null || true
  
  echo ""
  echo "✓ All monitoring stacks destroyed"
}

# Main execution
case "$ACTION" in
  deploy-all)
    get_dev_info
    deploy_networking
    deploy_vpc_peering
    deploy_monitoring_infra
    if [ "$USE_LAYERED" = "true" ]; then
      init_config
      deploy_monitoring_services
      sync_config
    fi
    show_urls
    ;;
  deploy-infra)
    get_dev_info
    deploy_networking
    deploy_vpc_peering
    deploy_monitoring_infra
    if [ "$USE_LAYERED" = "true" ]; then
      init_config
    fi
    show_urls
    ;;
  deploy-services)
    deploy_monitoring_services
    sync_config
    show_urls
    ;;
  sync-config)
    sync_config
    ;;
  destroy)
    destroy_all
    ;;
  *)
    echo "Unknown action: $ACTION"
    echo ""
    echo "Usage: $0 [action] [options]"
    echo ""
    echo "Actions:"
    echo "  deploy-all        - Deploy full stack"
    echo "  deploy-infra      - Deploy infrastructure only"
    echo "  deploy-services   - Deploy services only"
    echo "  sync-config       - Sync config to EFS"
    echo "  destroy           - Destroy all stacks"
    echo ""
    echo "Options:"
    echo "  --layered         - Use layered architecture (default)"
    echo "  --embedded        - Use embedded architecture"
    echo "  --skip-vpc-peering - Skip VPC peering"
    exit 1
    ;;
esac

echo ""
echo "✓ Done!"
