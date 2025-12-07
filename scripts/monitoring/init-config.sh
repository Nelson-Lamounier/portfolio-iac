#!/bin/bash
# =============================================================================
# LAYER 3: Initialize Monitoring Configuration on EFS
# =============================================================================
# This script initializes the monitoring configuration on EFS after the
# infrastructure stack is deployed. Run this once after initial deployment.
#
# Usage:
#   ./scripts/monitoring/init-config.sh [--profile <aws-profile>] [--env <environment>]
#
# Examples:
#   ./scripts/monitoring/init-config.sh --profile github-actions --env pipeline
# =============================================================================

set -e

# Default values
AWS_PROFILE=""
ENVIRONMENT="pipeline"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

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
echo "Initialize Monitoring Config - Environment: $ENVIRONMENT"
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

# Get host private IP
HOST_IP=$(aws ec2 describe-instances \
  --instance-ids "$EC2_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PrivateIpAddress' \
  --output text)

echo "Host private IP: $HOST_IP"

# Get region
REGION=$(aws configure get region || echo "eu-west-1")
echo "Region: $REGION"

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

echo ""
echo "Creating Prometheus configuration..."
echo "-------------------------------------"

# Create prometheus.yml
PROMETHEUS_CONFIG=$(cat << 'PROMEOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    environment: 'ENVIRONMENT_PLACEHOLDER'

rule_files:
  - /etc/prometheus/alerts.yml

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node Exporter - EC2 Service Discovery
  - job_name: 'node-exporter'
    ec2_sd_configs:
      - region: REGION_PLACEHOLDER
        port: 9100
        filters:
          - name: tag:Environment
            values: ['ENVIRONMENT_PLACEHOLDER']
          - name: instance-state-name
            values: ['running']
    relabel_configs:
      - source_labels: [__meta_ec2_private_ip]
        target_label: __address__
        replacement: '$1:9100'
      - source_labels: [__meta_ec2_instance_id]
        target_label: instance_id
      - source_labels: [__meta_ec2_availability_zone]
        target_label: availability_zone
      - source_labels: [__meta_ec2_tag_Purpose]
        target_label: cluster
        replacement: '$1'
      - source_labels: [__meta_ec2_tag_Name]
        target_label: instance
PROMEOF
)

# Replace placeholders
PROMETHEUS_CONFIG="${PROMETHEUS_CONFIG//ENVIRONMENT_PLACEHOLDER/$ENVIRONMENT}"
PROMETHEUS_CONFIG="${PROMETHEUS_CONFIG//REGION_PLACEHOLDER/$REGION}"

# Write config via SSM
run_ssm_command \
  "cat > /mnt/efs/config/prometheus/prometheus.yml << 'EOF'
$PROMETHEUS_CONFIG
EOF
chown 65534:65534 /mnt/efs/config/prometheus/prometheus.yml
chmod 644 /mnt/efs/config/prometheus/prometheus.yml" \
  "Creating prometheus.yml"

# Create empty alerts.yml
run_ssm_command \
  "cat > /mnt/efs/config/prometheus/alerts.yml << 'EOF'
groups: []
EOF
chown 65534:65534 /mnt/efs/config/prometheus/alerts.yml
chmod 644 /mnt/efs/config/prometheus/alerts.yml" \
  "Creating alerts.yml"

echo ""
echo "Creating Grafana configuration..."
echo "----------------------------------"

# Create datasource config
run_ssm_command \
  "cat > /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus
    access: proxy
    url: http://${HOST_IP}:9090/prometheus
    isDefault: true
    editable: true
    jsonData:
      timeInterval: '15s'
EOF
chown 472:472 /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
chmod 644 /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml" \
  "Creating datasource config"

# Create dashboard provisioning config
run_ssm_command \
  "cat > /mnt/efs/config/grafana/provisioning/dashboards/dashboards.yml << 'EOF'
apiVersion: 1

providers:
  - name: 'Default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
EOF
chown 472:472 /mnt/efs/config/grafana/provisioning/dashboards/dashboards.yml
chmod 644 /mnt/efs/config/grafana/provisioning/dashboards/dashboards.yml" \
  "Creating dashboard provisioning config"

echo ""
echo "=============================================="
echo "Configuration initialization complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "1. Deploy the MonitoringServiceStack to start the services"
echo "2. Use sync-config.sh to update configs without CDK deploy"
echo "3. Access Grafana at: http://<alb-dns>/grafana"
