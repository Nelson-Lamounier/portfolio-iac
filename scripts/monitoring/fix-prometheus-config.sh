#!/bin/bash
# =============================================================================
# Fix Prometheus Config Issue
# =============================================================================
# This script fixes the "prometheus.yml not found" issue by:
# 1. Deploying the stack (uploads assets to S3)
# 2. Terminating the old EC2 instance
# 3. Waiting for new instance with correct config
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "========================================="
echo "Fix Prometheus Config Issue"
echo "========================================="
echo ""

# Step 1: Deploy stack
echo "Step 1: Deploying MonitoringEcsStack-pipeline..."
echo "This will upload config assets to S3"
echo ""
cd "$PROJECT_ROOT/infrastructure"
yarn build
ENVIRONMENT=pipeline yarn cdk deploy MonitoringEcsStack-pipeline --exclusively --require-approval never

echo ""
echo "✓ Deployment complete"
echo ""

# Step 2: Find and terminate old instance
echo "Step 2: Finding EC2 instance..."
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:aws:autoscaling:groupName,Values=*pipeline-monitoring*MonitoringCapacity*" \
  "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null || echo "")

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" == "None" ]; then
  echo "No running instance found. Auto Scaling will create one."
else
  echo "Found instance: $INSTANCE_ID"
  echo "Terminating instance to force new launch with updated UserData..."
  aws ec2 terminate-instances --instance-ids $INSTANCE_ID
  echo "✓ Instance terminated"
fi

echo ""
echo "Step 3: Waiting for new instance to launch..."
echo "This takes about 2-3 minutes..."
sleep 120

# Step 3: Wait for new instance
for i in {1..10}; do
  NEW_INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:aws:autoscaling:groupName,Values=*pipeline-monitoring*MonitoringCapacity*" \
    "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$NEW_INSTANCE_ID" ] && [ "$NEW_INSTANCE_ID" != "None" ]; then
    echo "✓ New instance launched: $NEW_INSTANCE_ID"
    break
  fi
  
  echo "Waiting... (attempt $i/10)"
  sleep 30
done

if [ -z "$NEW_INSTANCE_ID" ] || [ "$NEW_INSTANCE_ID" == "None" ]; then
  echo "ERROR: New instance not found after 5 minutes"
  echo "Check Auto Scaling Group manually"
  exit 1
fi

echo ""
echo "Step 4: Waiting for UserData script to complete..."
echo "This takes about 3-5 minutes..."
sleep 180

echo ""
echo "========================================="
echo "✓ Fix Complete!"
echo "========================================="
echo ""
echo "New Instance ID: $NEW_INSTANCE_ID"
echo ""
echo "To verify:"
echo "  1. Connect to instance:"
echo "     aws ssm start-session --target $NEW_INSTANCE_ID"
echo ""
echo "  2. Check UserData log:"
echo "     sudo tail -f /var/log/monitoring-setup.log"
echo ""
echo "  3. Verify config files:"
echo "     ls -la /mnt/prometheus-config/"
echo ""
echo "  4. Check ECS tasks:"
echo "     docker ps"
echo ""
echo "  5. Get ALB DNS:"
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?contains(LoadBalancerName, `pipeline-monitoring`)].DNSName' \
  --output text 2>/dev/null || echo "")

if [ -n "$ALB_DNS" ]; then
  echo "     http://$ALB_DNS/grafana (admin/admin)"
  echo "     http://$ALB_DNS/prometheus"
else
  echo "     (ALB DNS not found - check AWS console)"
fi

echo ""
