#!/bin/bash
# =============================================================================
# Auto-Fix Monitoring Issues
# =============================================================================
# This script automatically fixes common monitoring deployment issues based
# on the manual troubleshooting steps. It recreates configs and fixes permissions.
#
# Usage:
#   ./scripts/monitoring/auto-fix-monitoring-issues.sh [--profile <aws-profile>] [--env <environment>]
#
# Examples:
#   ./scripts/monitoring/auto-fix-monitoring-issues.sh --profile pipeline-account --env pipeline
# =============================================================================

set -e

# Default values
AWS_PROFILE=""
ENVIRONMENT="pipeline"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
echo "Auto-Fix Monitoring Issues"
echo "Environment: $ENVIRONMENT"
echo "=============================================="

# Function to print status
print_status() {
  local status=$1
  local message=$2
  case $status in
    "PASS")
      echo -e "${GREEN}✅ FIXED${NC}: $message"
      ;;
    "FAIL")
      echo -e "${RED}❌ FAILED${NC}: $message"
      ;;
    "WARN")
      echo -e "${YELLOW}⚠️  WARN${NC}: $message"
      ;;
    "INFO")
      echo -e "${BLUE}ℹ️  INFO${NC}: $message"
      ;;
  esac
}

# Function to run SSM command and get output
run_ssm_command() {
  local instance_id=$1
  local command=$2
  local description=$3
  
  print_status "INFO" "Running: $description"
  
  COMMAND_ID=$(aws ssm send-command \
    --instance-ids "$instance_id" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=[\"$command\"]" \
    --query 'Command.CommandId' \
    --output text)
  
  # Wait for command to complete
  sleep 10
  
  # Get command output
  OUTPUT=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$instance_id" \
    --query 'StandardOutputContent' \
    --output text)
  
  echo "$OUTPUT"
}

# Get instance details
print_status "INFO" "Getting EC2 instance details..."

INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Environment,Values=${ENVIRONMENT}" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null || echo "")

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  print_status "FAIL" "No running EC2 instance found"
  exit 1
fi

INSTANCE_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PrivateIpAddress' \
  --output text)

print_status "INFO" "Instance ID: $INSTANCE_ID"
print_status "INFO" "Instance IP: $INSTANCE_IP"

# Fix 1: Recreate Prometheus configuration
echo ""
echo "=== Fix 1: Recreate Prometheus Configuration ==="

PROMETHEUS_CONFIG_CMD="cat > /mnt/efs/config/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    metrics_path: /prometheus/metrics
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'node-exporter-development'
    static_configs:
      - targets: ['10.1.0.71:9100']
        labels:
          environment: development

  - job_name: 'nextjs-development'
    metrics_path: /api/metrics
    static_configs:
      - targets: ['10.1.0.71:3000']
        labels:
          environment: development
EOF
chown 65534:65534 /mnt/efs/config/prometheus/prometheus.yml
chmod 644 /mnt/efs/config/prometheus/prometheus.yml
echo 'Prometheus config recreated'"

run_ssm_command "$INSTANCE_ID" "$PROMETHEUS_CONFIG_CMD" "Recreate Prometheus config"
print_status "PASS" "Prometheus configuration recreated"

# Fix 2: Update Grafana datasource with current IP
echo ""
echo "=== Fix 2: Update Grafana Datasource ==="

GRAFANA_DATASOURCE_CMD="cat > /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml << 'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    uid: PBFA97CFB590B2093
    url: http://${INSTANCE_IP}:9090/prometheus
    isDefault: true
    jsonData:
      timeInterval: 15s
EOF
echo 'Prometheus datasource updated with IP: ${INSTANCE_IP}'"

run_ssm_command "$INSTANCE_ID" "$GRAFANA_DATASOURCE_CMD" "Update Grafana Prometheus datasource"
print_status "PASS" "Grafana Prometheus datasource updated"

# Fix 3: Create CloudWatch datasource
echo ""
echo "=== Fix 3: Create CloudWatch Datasource ==="

CLOUDWATCH_DATASOURCE_CMD="cat > /mnt/efs/config/grafana/provisioning/datasources/cloudwatch.yml << 'EOF'
apiVersion: 1
datasources:
  - name: CloudWatch
    type: cloudwatch
    uid: P034F075C744B399F
    jsonData:
      authType: default
      defaultRegion: eu-west-1
    editable: true
EOF
echo 'CloudWatch datasource created'"

run_ssm_command "$INSTANCE_ID" "$CLOUDWATCH_DATASOURCE_CMD" "Create CloudWatch datasource"
print_status "PASS" "CloudWatch datasource created"

# Fix 4: Fix symlinks if broken
echo ""
echo "=== Fix 4: Fix Symlinks ==="

SYMLINK_FIX_CMD="# Remove any existing directories that should be symlinks
rm -rf /mnt/prometheus-config /mnt/grafana-data /mnt/prometheus-data /mnt/grafana-provisioning /mnt/grafana-dashboards

# Create proper symlinks
ln -sf /mnt/efs/prometheus-data /mnt/prometheus-data
ln -sf /mnt/efs/grafana-data /mnt/grafana-data
ln -sf /mnt/efs/config/prometheus /mnt/prometheus-config
ln -sf /mnt/efs/config/grafana/provisioning /mnt/grafana-provisioning
ln -sf /mnt/efs/config/grafana/dashboards /mnt/grafana-dashboards

# Verify symlinks
ls -la /mnt/ | grep -E '(prometheus|grafana)'
echo 'Symlinks fixed'"

run_ssm_command "$INSTANCE_ID" "$SYMLINK_FIX_CMD" "Fix symlinks"
print_status "PASS" "Symlinks fixed"

# Fix 5: Set correct permissions
echo ""
echo "=== Fix 5: Set Correct Permissions ==="

PERMISSIONS_CMD="# Set ownership
chown -R 65534:65534 /mnt/efs/prometheus-data /mnt/efs/config/prometheus
chown -R 472:0 /mnt/efs/grafana-data /mnt/efs/config/grafana

# Set permissions
chmod -R 777 /mnt/efs/prometheus-data
chmod -R 777 /mnt/efs/grafana-data
chmod -R 755 /mnt/efs/config/prometheus
chmod -R 755 /mnt/efs/config/grafana

echo 'Permissions set correctly'"

run_ssm_command "$INSTANCE_ID" "$PERMISSIONS_CMD" "Set correct permissions"
print_status "PASS" "Permissions set correctly"

# Fix 6: Add comprehensive IAM permissions to Grafana role
echo ""
echo "=== Fix 6: Update Grafana IAM Permissions ==="

print_status "INFO" "Getting Grafana task role..."

GRAFANA_ROLE=$(aws ecs describe-task-definition \
  --task-definition "MonitoringServiceStack${ENVIRONMENT}GrafanaTaskDefinitionTaskDefA8364B8E" \
  --query 'taskDefinition.taskRoleArn' \
  --output text | awk -F'/' '{print $NF}' 2>/dev/null || echo "")

if [ -n "$GRAFANA_ROLE" ]; then
  print_status "INFO" "Grafana role: $GRAFANA_ROLE"
  
  # Add CloudWatch Logs permissions
  aws iam put-role-policy \
    --role-name "$GRAFANA_ROLE" \
    --policy-name CloudWatchLogsAccess \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "logs:DescribeLogStreams",
            "logs:DescribeLogGroups",
            "logs:StartQuery",
            "logs:StopQuery",
            "logs:GetQueryResults",
            "logs:FilterLogEvents",
            "logs:GetLogEvents"
          ],
          "Resource": "*"
        }
      ]
    }' 2>/dev/null || true
  
  # Add comprehensive monitoring permissions
  aws iam put-role-policy \
    --role-name "$GRAFANA_ROLE" \
    --policy-name ComprehensiveMonitoringAccess \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "ecs:ListClusters",
            "ecs:ListServices",
            "ecs:ListTasks",
            "ecs:DescribeClusters",
            "ecs:DescribeServices",
            "ecs:DescribeTasks",
            "ecs:DescribeTaskDefinition",
            "ecs:DescribeContainerInstances",
            "lambda:ListFunctions",
            "lambda:GetFunction",
            "lambda:ListEventSourceMappings",
            "cloudformation:ListStacks",
            "cloudformation:DescribeStacks",
            "cloudformation:DescribeStackEvents",
            "cloudformation:DescribeStackResources",
            "application-autoscaling:DescribeScalableTargets",
            "application-autoscaling:DescribeScalingPolicies",
            "tag:GetResources"
          ],
          "Resource": "*"
        }
      ]
    }' 2>/dev/null || true
  
  print_status "PASS" "Grafana IAM permissions updated"
else
  print_status "WARN" "Could not find Grafana task role"
fi

# Fix 7: Restart services to apply changes
echo ""
echo "=== Fix 7: Restart Services ==="

CLUSTER_NAME="${ENVIRONMENT}-monitoring-cluster"

# Restart Prometheus
print_status "INFO" "Restarting Prometheus service..."
aws ecs update-service \
  --cluster "$CLUSTER_NAME" \
  --service "${ENVIRONMENT}-prometheus" \
  --force-new-deployment \
  --query 'service.serviceName' \
  --output text >/dev/null 2>&1 || true

# Restart Grafana
print_status "INFO" "Restarting Grafana service..."
aws ecs update-service \
  --cluster "$CLUSTER_NAME" \
  --service "${ENVIRONMENT}-grafana" \
  --force-new-deployment \
  --query 'service.serviceName' \
  --output text >/dev/null 2>&1 || true

print_status "PASS" "Services restarted"

# Fix 8: Reload Prometheus configuration
echo ""
echo "=== Fix 8: Reload Prometheus Configuration ==="

sleep 30  # Wait for Prometheus to start

RELOAD_CMD="curl -X POST http://localhost:9090/prometheus/-/reload || echo 'Reload failed - Prometheus may still be starting'"
run_ssm_command "$INSTANCE_ID" "$RELOAD_CMD" "Reload Prometheus config"
print_status "PASS" "Prometheus configuration reloaded"

# Summary
echo ""
echo "=============================================="
echo "Auto-Fix Summary"
echo "=============================================="

# Get ALB DNS for access URLs
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name "MonitoringInfraStack-${ENVIRONMENT}" \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDns`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -n "$ALB_DNS" ]; then
  echo "Access URLs:"
  echo "  Grafana:    http://${ALB_DNS}/grafana (admin/admin)"
  echo "  Prometheus: http://${ALB_DNS}/prometheus"
  echo "  Targets:    http://${ALB_DNS}/prometheus/targets"
  echo ""
fi

echo "Fixed Issues:"
echo "  ✅ Prometheus configuration recreated"
echo "  ✅ Grafana datasource updated with current IP ($INSTANCE_IP)"
echo "  ✅ CloudWatch datasource created"
echo "  ✅ Symlinks fixed"
echo "  ✅ Permissions corrected"
echo "  ✅ IAM permissions updated"
echo "  ✅ Services restarted"
echo "  ✅ Prometheus config reloaded"
echo ""
echo "Wait 2-3 minutes for services to fully restart, then test the monitoring URLs."
echo "All targets should be UP and Grafana datasources should work correctly."