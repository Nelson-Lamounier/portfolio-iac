#!/bin/bash
# =============================================================================
# LAYER 3: Monitoring Configuration Sync Script
# =============================================================================
# This script syncs monitoring configuration to EFS without requiring CDK deploy.
# Use this for frequent config changes like:
# - Prometheus scrape targets
# - Alert rules
# - Grafana dashboards
# - Datasource configurations
#
# Usage:
#   ./scripts/monitoring/sync-config.sh [--profile <aws-profile>] [--env <environment>]
#
# Examples:
#   ./scripts/monitoring/sync-config.sh --profile github-actions --env pipeline
#   ./scripts/monitoring/sync-config.sh --env development
# =============================================================================

set -e

# Default values
AWS_PROFILE=""
ENVIRONMENT="pipeline"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MONITORING_DIR="$PROJECT_ROOT/monitoring"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --profile)
      AWS_PROFILE="$2"
      shift 2
      ;;
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Set AWS profile if provided
if [ -n "$AWS_PROFILE" ]; then
  export AWS_PROFILE
  echo "Using AWS profile: $AWS_PROFILE"
fi

echo "=============================================="
echo "Monitoring Config Sync - Environment: $ENVIRONMENT"
echo "=============================================="

# Get ECS cluster and instance info
CLUSTER_NAME="${ENVIRONMENT}-monitoring-cluster"
echo "Looking for cluster: $CLUSTER_NAME"

# Get container instance ID
CONTAINER_INSTANCE_ARN=$(aws ecs list-container-instances \
  --cluster "$CLUSTER_NAME" \
  --query 'containerInstanceArns[0]' \
  --output text)

if [ "$CONTAINER_INSTANCE_ARN" == "None" ] || [ -z "$CONTAINER_INSTANCE_ARN" ]; then
  echo "Error: No container instances found in cluster $CLUSTER_NAME"
  exit 1
fi

# Get EC2 instance ID
EC2_INSTANCE_ID=$(aws ecs describe-container-instances \
  --cluster "$CLUSTER_NAME" \
  --container-instances "$CONTAINER_INSTANCE_ARN" \
  --query 'containerInstances[0].ec2InstanceId' \
  --output text)

echo "Found EC2 instance: $EC2_INSTANCE_ID"

# Function to run command on EC2 via SSM
run_ssm_command() {
  local command="$1"
  local description="$2"
  
  echo "Running: $description"
  
  COMMAND_ID=$(aws ssm send-command \
    --instance-ids "$EC2_INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=[\"$command\"]" \
    --query 'Command.CommandId' \
    --output text)
  
  # Wait for command to complete
  aws ssm wait command-executed \
    --command-id "$COMMAND_ID" \
    --instance-id "$EC2_INSTANCE_ID" 2>/dev/null || true
  
  # Get command output
  aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$EC2_INSTANCE_ID" \
    --query 'StandardOutputContent' \
    --output text
}

# Function to copy file to EC2 via SSM
copy_file_to_ec2() {
  local local_file="$1"
  local remote_path="$2"
  local description="$3"
  
  echo "Copying: $description"
  
  # Read file content and escape for shell
  local content
  content=$(cat "$local_file" | base64)
  
  # Write to remote via SSM
  COMMAND_ID=$(aws ssm send-command \
    --instance-ids "$EC2_INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=[\"echo '$content' | base64 -d > $remote_path\"]" \
    --query 'Command.CommandId' \
    --output text)
  
  aws ssm wait command-executed \
    --command-id "$COMMAND_ID" \
    --instance-id "$EC2_INSTANCE_ID" 2>/dev/null || true
}

echo ""
echo "Syncing Prometheus configuration..."
echo "-----------------------------------"

# Sync prometheus.yml
if [ -f "$MONITORING_DIR/prometheus/prometheus.yml" ]; then
  copy_file_to_ec2 \
    "$MONITORING_DIR/prometheus/prometheus.yml" \
    "/mnt/efs/config/prometheus/prometheus.yml" \
    "prometheus.yml"
  
  # Set permissions
  run_ssm_command \
    "chown 65534:65534 /mnt/efs/config/prometheus/prometheus.yml && chmod 644 /mnt/efs/config/prometheus/prometheus.yml" \
    "Setting prometheus.yml permissions"
fi

# Sync alert rules
if [ -f "$MONITORING_DIR/prometheus/alerts.yml" ]; then
  copy_file_to_ec2 \
    "$MONITORING_DIR/prometheus/alerts.yml" \
    "/mnt/efs/config/prometheus/alerts.yml" \
    "alerts.yml"
  
  run_ssm_command \
    "chown 65534:65534 /mnt/efs/config/prometheus/alerts.yml && chmod 644 /mnt/efs/config/prometheus/alerts.yml" \
    "Setting alerts.yml permissions"
fi

echo ""
echo "Syncing Grafana configuration..."
echo "---------------------------------"

# Sync datasources
if [ -d "$MONITORING_DIR/grafana/provisioning/datasources" ]; then
  for file in "$MONITORING_DIR/grafana/provisioning/datasources"/*.yml; do
    if [ -f "$file" ]; then
      filename=$(basename "$file")
      copy_file_to_ec2 \
        "$file" \
        "/mnt/efs/config/grafana/provisioning/datasources/$filename" \
        "datasource: $filename"
    fi
  done
  
  run_ssm_command \
    "chown -R 472:472 /mnt/efs/config/grafana/provisioning/datasources && chmod -R 644 /mnt/efs/config/grafana/provisioning/datasources/*" \
    "Setting datasource permissions"
fi

# Sync dashboard provisioning config
if [ -d "$MONITORING_DIR/grafana/provisioning/dashboards" ]; then
  for file in "$MONITORING_DIR/grafana/provisioning/dashboards"/*.yml; do
    if [ -f "$file" ]; then
      filename=$(basename "$file")
      copy_file_to_ec2 \
        "$file" \
        "/mnt/efs/config/grafana/provisioning/dashboards/$filename" \
        "dashboard config: $filename"
    fi
  done
fi

# Sync dashboards
if [ -d "$MONITORING_DIR/grafana/dashboards" ]; then
  for file in "$MONITORING_DIR/grafana/dashboards"/*.json; do
    if [ -f "$file" ]; then
      filename=$(basename "$file")
      copy_file_to_ec2 \
        "$file" \
        "/mnt/efs/config/grafana/dashboards/$filename" \
        "dashboard: $filename"
    fi
  done
  
  run_ssm_command \
    "chown -R 472:472 /mnt/efs/config/grafana/dashboards && chmod -R 644 /mnt/efs/config/grafana/dashboards/*" \
    "Setting dashboard permissions"
fi

echo ""
echo "Reloading services..."
echo "---------------------"

# Reload Prometheus config (hot reload via API)
run_ssm_command \
  "curl -X POST http://localhost:9090/prometheus/-/reload 2>/dev/null || echo 'Prometheus reload requested'" \
  "Reloading Prometheus configuration"

echo ""
echo "=============================================="
echo "Configuration sync complete!"
echo "=============================================="
echo ""
echo "Note: Grafana dashboards will auto-reload within 10 seconds"
echo "      (configured via updateIntervalSeconds in provisioning)"
