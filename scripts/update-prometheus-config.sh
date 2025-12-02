#!/bin/bash
# @format

# Script to update Prometheus configuration with ALB DNS name
# Run this after deploying the monitoring EC2 instance

set -e

ENVIRONMENT=${1:-development}
REGION=${AWS_REGION:-eu-west-1}

echo "Updating Prometheus configuration for environment: $ENVIRONMENT"

# Get monitoring instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=${ENVIRONMENT}-monitoring" \
            "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text \
  --region $REGION)

if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "Error: Monitoring instance not found for environment: $ENVIRONMENT"
  exit 1
fi

echo "Found monitoring instance: $INSTANCE_ID"

# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names "${ENVIRONMENT}-alb" \
  --query "LoadBalancers[0].DNSName" \
  --output text \
  --region $REGION 2>/dev/null || echo "")

if [ -z "$ALB_DNS" ]; then
  echo "Warning: ALB not found. Skipping ALB configuration."
  ALB_CONFIG=""
else
  echo "Found ALB DNS: $ALB_DNS"
  ALB_CONFIG="
  # Next.js Application
  - job_name: 'nextjs-app'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['${ALB_DNS}']
        labels:
          app: 'portfolio'
          environment: '${ENVIRONMENT}'
    scrape_interval: 30s
    scrape_timeout: 10s"
fi

# Create updated Prometheus config
cat > /tmp/prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    environment: '${ENVIRONMENT}'

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node Exporter (EC2 metrics)
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
        labels:
          instance: 'monitoring-ec2'
          environment: '${ENVIRONMENT}'
${ALB_CONFIG}
EOF

echo "Uploading new configuration to EC2 instance..."

# Upload config via SSM
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "cat > /opt/monitoring/prometheus/prometheus.yml << '\''EOFCONFIG'\''",
    "'"$(cat /tmp/prometheus.yml)"'",
    "EOFCONFIG",
    "cd /opt/monitoring",
    "docker-compose restart prometheus",
    "echo '\''Prometheus configuration updated and restarted'\''"
  ]' \
  --region $REGION \
  --output text

echo "Configuration update command sent. Waiting for completion..."
sleep 10

echo "✓ Prometheus configuration updated successfully!"
echo ""
echo "Access your monitoring:"
echo "  Grafana: http://$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text --region $REGION):3000"
echo "  Prometheus: http://$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text --region $REGION):9090"
echo ""
echo "Default Grafana credentials: admin/admin"

# Clean up
rm /tmp/prometheus.yml
