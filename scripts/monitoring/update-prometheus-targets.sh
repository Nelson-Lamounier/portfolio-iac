#!/bin/bash
# @format
# Auto-update Prometheus targets with current EC2 instance IPs
# This script queries AWS for running instances and updates the Prometheus config

set -e

PROFILE=${AWS_PROFILE:-github-actions}
REGION=${AWS_REGION:-eu-west-1}
PIPELINE_ENV=${PIPELINE_ENV:-pipeline}

echo "=== Updating Prometheus Targets ==="
echo "Profile: $PROFILE"
echo "Region: $REGION"
echo ""

# Get pipeline instance ID
PIPELINE_INSTANCE=$(aws ec2 describe-instances \
  --profile $PROFILE \
  --region $REGION \
  --filters "Name=tag:Environment,Values=$PIPELINE_ENV" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

if [ "$PIPELINE_INSTANCE" = "None" ] || [ -z "$PIPELINE_INSTANCE" ]; then
  echo "❌ Pipeline instance not found"
  exit 1
fi

echo "Pipeline Instance: $PIPELINE_INSTANCE"
echo ""

# Function to get instance IP by environment
get_instance_ip() {
  local env=$1
  local profile=$2
  
  aws ec2 describe-instances \
    --profile $profile \
    --region $REGION \
    --filters "Name=tag:Environment,Values=$env" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].PrivateIpAddress' \
    --output text
}

# Get IPs for each environment
echo "Fetching instance IPs..."
DEV_IP=$(get_instance_ip "development" "dev-account")
STAGING_IP=$(get_instance_ip "staging" "staging-account" 2>/dev/null || echo "NOT_FOUND")
PROD_IP=$(get_instance_ip "production" "prod-account" 2>/dev/null || echo "NOT_FOUND")

echo "Development IP: $DEV_IP"
echo "Staging IP: $STAGING_IP"
echo "Production IP: $PROD_IP"
echo ""

# Build Prometheus config
cat > /tmp/prometheus.yml <<EOF
# @format
# Auto-generated Prometheus Configuration
# Last updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    environment: '$PIPELINE_ENV'
    cluster: 'pipeline-monitoring'

rule_files:
  - /etc/prometheus/alerts.yml

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    metrics_path: /prometheus/metrics
    static_configs:
      - targets: ['localhost:9090']
        labels:
          service: 'prometheus'

  # Node Exporter - Pipeline
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
        labels:
          service: 'node-exporter'
          instance: 'pipeline-monitoring'
EOF

# Add development targets if IP found
if [ "$DEV_IP" != "None" ] && [ "$DEV_IP" != "NOT_FOUND" ] && [ -n "$DEV_IP" ]; then
  cat >> /tmp/prometheus.yml <<EOF

  # Development Environment
  - job_name: 'node-exporter-development'
    static_configs:
      - targets: ['$DEV_IP:9100']
        labels:
          service: 'node-exporter'
          environment: 'development'
          account: 'development'

  - job_name: 'nextjs-development'
    metrics_path: /api/metrics
    static_configs:
      - targets: ['$DEV_IP:3000']
        labels:
          service: 'nextjs'
          environment: 'development'
          account: 'development'
EOF
  echo "✓ Added development targets ($DEV_IP)"
fi

# Add staging targets if IP found
if [ "$STAGING_IP" != "None" ] && [ "$STAGING_IP" != "NOT_FOUND" ] && [ -n "$STAGING_IP" ]; then
  cat >> /tmp/prometheus.yml <<EOF

  # Staging Environment
  - job_name: 'node-exporter-staging'
    static_configs:
      - targets: ['$STAGING_IP:9100']
        labels:
          service: 'node-exporter'
          environment: 'staging'
          account: 'staging'

  - job_name: 'nextjs-staging'
    metrics_path: /api/metrics
    static_configs:
      - targets: ['$STAGING_IP:3000']
        labels:
          service: 'nextjs'
          environment: 'staging'
          account: 'staging'
EOF
  echo "✓ Added staging targets ($STAGING_IP)"
fi

# Add production targets if IP found
if [ "$PROD_IP" != "None" ] && [ "$PROD_IP" != "NOT_FOUND" ] && [ -n "$PROD_IP" ]; then
  cat >> /tmp/prometheus.yml <<EOF

  # Production Environment
  - job_name: 'node-exporter-production'
    static_configs:
      - targets: ['$PROD_IP:9100']
        labels:
          service: 'node-exporter'
          environment: 'production'
          account: 'production'

  - job_name: 'nextjs-production'
    metrics_path: /api/metrics
    static_configs:
      - targets: ['$PROD_IP:3000']
        labels:
          service: 'nextjs'
          environment: 'production'
          account: 'production'
EOF
  echo "✓ Added production targets ($PROD_IP)"
fi

echo ""
echo "=== Uploading Config to EFS ==="

# Upload to EFS via SSM
COMMAND_ID=$(aws ssm send-command \
  --profile $PROFILE \
  --region $REGION \
  --instance-ids $PIPELINE_INSTANCE \
  --document-name "AWS-RunShellScript" \
  --parameters commands="[
    \"cat > /tmp/prometheus.yml <<'EOFCONFIG'
$(cat /tmp/prometheus.yml)
EOFCONFIG\",
    \"sudo mv /tmp/prometheus.yml /mnt/efs/config/prometheus/prometheus.yml\",
    \"sudo chown 65534:65534 /mnt/efs/config/prometheus/prometheus.yml\",
    \"sudo chmod 644 /mnt/efs/config/prometheus/prometheus.yml\",
    \"echo 'Config updated'\"
  ]" \
  --query 'Command.CommandId' \
  --output text)

echo "SSM Command ID: $COMMAND_ID"
echo "Waiting for upload..."
sleep 5

# Check result
aws ssm get-command-invocation \
  --profile $PROFILE \
  --region $REGION \
  --command-id $COMMAND_ID \
  --instance-id $PIPELINE_INSTANCE \
  --query 'StandardOutputContent' \
  --output text

echo ""
echo "=== Reloading Prometheus ==="

# Reload Prometheus config (no restart needed)
aws ssm send-command \
  --profile $PROFILE \
  --region $REGION \
  --instance-ids $PIPELINE_INSTANCE \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["curl -X POST http://localhost:9090/prometheus/-/reload"]' \
  --output text > /dev/null

echo "✓ Prometheus config reloaded"
echo ""
echo "=== Summary ==="
echo "Targets updated successfully!"
echo "Check Prometheus UI: http://<alb-dns>/prometheus/targets"
