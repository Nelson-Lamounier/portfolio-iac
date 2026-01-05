#!/bin/bash
# =============================================================================
# Validate Monitoring Deployment
# =============================================================================
# This script validates that Prometheus and Grafana are working correctly
# after deployment. It performs the same checks as the manual troubleshooting.
#
# Usage:
#   ./scripts/monitoring/validate-monitoring-deployment.sh [--profile <aws-profile>] [--env <environment>]
#
# Examples:
#   ./scripts/monitoring/validate-monitoring-deployment.sh --profile pipeline-account --env pipeline
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
echo "Monitoring Deployment Validation"
echo "Environment: $ENVIRONMENT"
echo "=============================================="

# Function to print status
print_status() {
  local status=$1
  local message=$2
  case $status in
    "PASS")
      echo -e "${GREEN}✅ PASS${NC}: $message"
      ;;
    "FAIL")
      echo -e "${RED}❌ FAIL${NC}: $message"
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
  aws ssm wait command-executed \
    --command-id "$COMMAND_ID" \
    --instance-id "$instance_id" 2>/dev/null || true
  
  # Get command output
  aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$instance_id" \
    --query 'StandardOutputContent' \
    --output text
}

# Test 1: Check if stacks exist
echo ""
echo "=== Test 1: Stack Validation ==="

INFRA_STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name "MonitoringInfraStack-${ENVIRONMENT}" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

SERVICE_STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name "MonitoringServiceStack-${ENVIRONMENT}" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$INFRA_STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$INFRA_STACK_STATUS" = "UPDATE_COMPLETE" ]; then
  print_status "PASS" "MonitoringInfraStack-${ENVIRONMENT} is deployed ($INFRA_STACK_STATUS)"
else
  print_status "FAIL" "MonitoringInfraStack-${ENVIRONMENT} not found or failed ($INFRA_STACK_STATUS)"
  exit 1
fi

if [ "$SERVICE_STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$SERVICE_STACK_STATUS" = "UPDATE_COMPLETE" ]; then
  print_status "PASS" "MonitoringServiceStack-${ENVIRONMENT} is deployed ($SERVICE_STACK_STATUS)"
else
  print_status "FAIL" "MonitoringServiceStack-${ENVIRONMENT} not found or failed ($SERVICE_STACK_STATUS)"
  exit 1
fi

# Test 2: Get ALB DNS and test endpoints
echo ""
echo "=== Test 2: Load Balancer Validation ==="

ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name "MonitoringInfraStack-${ENVIRONMENT}" \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDns`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -n "$ALB_DNS" ]; then
  print_status "PASS" "ALB DNS found: $ALB_DNS"
  
  # Test Prometheus endpoint
  PROMETHEUS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${ALB_DNS}/prometheus/-/healthy" || echo "000")
  if [ "$PROMETHEUS_STATUS" = "200" ]; then
    print_status "PASS" "Prometheus health check (HTTP $PROMETHEUS_STATUS)"
  else
    print_status "FAIL" "Prometheus health check failed (HTTP $PROMETHEUS_STATUS)"
  fi
  
  # Test Grafana endpoint
  GRAFANA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${ALB_DNS}/grafana/api/health" || echo "000")
  if [ "$GRAFANA_STATUS" = "200" ]; then
    print_status "PASS" "Grafana health check (HTTP $GRAFANA_STATUS)"
  else
    print_status "FAIL" "Grafana health check failed (HTTP $GRAFANA_STATUS)"
  fi
else
  print_status "FAIL" "ALB DNS not found"
  exit 1
fi

# Test 3: Check EC2 instance
echo ""
echo "=== Test 3: EC2 Instance Validation ==="

INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Environment,Values=${ENVIRONMENT}" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null || echo "")

if [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ]; then
  print_status "PASS" "EC2 instance found: $INSTANCE_ID"
  
  INSTANCE_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].PrivateIpAddress' \
    --output text)
  print_status "INFO" "Instance private IP: $INSTANCE_IP"
else
  print_status "FAIL" "No running EC2 instance found"
  exit 1
fi

# Test 4: Check ECS services
echo ""
echo "=== Test 4: ECS Services Validation ==="

CLUSTER_NAME="${ENVIRONMENT}-monitoring-cluster"

for SERVICE in "${ENVIRONMENT}-prometheus" "${ENVIRONMENT}-grafana" "${ENVIRONMENT}-monitoring-node-exporter"; do
  RUNNING=$(aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE" \
    --query 'services[0].runningCount' \
    --output text 2>/dev/null || echo "0")
  
  DESIRED=$(aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE" \
    --query 'services[0].desiredCount' \
    --output text 2>/dev/null || echo "0")
  
  if [ "$RUNNING" = "$DESIRED" ] && [ "$RUNNING" != "0" ]; then
    print_status "PASS" "$SERVICE: $RUNNING/$DESIRED tasks running"
  else
    print_status "FAIL" "$SERVICE: $RUNNING/$DESIRED tasks running"
  fi
done

# Test 5: Check EFS mount and config files
echo ""
echo "=== Test 5: EFS and Configuration Validation ==="

# Check EFS mount
EFS_MOUNT=$(run_ssm_command "$INSTANCE_ID" "df -h | grep efs || echo 'NOT_MOUNTED'" "Check EFS mount")
if [[ "$EFS_MOUNT" == *"efs"* ]]; then
  print_status "PASS" "EFS is mounted"
else
  print_status "FAIL" "EFS is not mounted"
fi

# Check Prometheus config
PROMETHEUS_CONFIG=$(run_ssm_command "$INSTANCE_ID" "test -f /mnt/efs/config/prometheus/prometheus.yml && echo 'EXISTS' || echo 'MISSING'" "Check Prometheus config")
if [ "$PROMETHEUS_CONFIG" = "EXISTS" ]; then
  print_status "PASS" "Prometheus config file exists"
else
  print_status "FAIL" "Prometheus config file missing"
fi

# Check symlinks
SYMLINKS=$(run_ssm_command "$INSTANCE_ID" "ls -la /mnt/ | grep -E '(prometheus-config|grafana-data|prometheus-data)' | wc -l" "Check symlinks")
if [ "$SYMLINKS" -ge "3" ]; then
  print_status "PASS" "Required symlinks exist ($SYMLINKS found)"
else
  print_status "WARN" "Some symlinks may be missing ($SYMLINKS found)"
fi

# Test 6: Validate Prometheus targets
echo ""
echo "=== Test 6: Prometheus Targets Validation ==="

# Get Prometheus targets via API
TARGETS_JSON=$(curl -s "http://${ALB_DNS}/prometheus/api/v1/targets" || echo '{"status":"error"}')
ACTIVE_TARGETS=$(echo "$TARGETS_JSON" | jq -r '.data.activeTargets[]? | select(.health=="up") | .labels.job' 2>/dev/null | wc -l || echo "0")

if [ "$ACTIVE_TARGETS" -ge "2" ]; then
  print_status "PASS" "Prometheus has $ACTIVE_TARGETS active targets"
  
  # List the targets
  echo "$TARGETS_JSON" | jq -r '.data.activeTargets[]? | select(.health=="up") | "  - " + .labels.job + " (" + .scrapeUrl + ")"' 2>/dev/null || true
else
  print_status "WARN" "Prometheus has only $ACTIVE_TARGETS active targets (expected at least 2)"
fi

# Test 7: Validate Grafana datasources
echo ""
echo "=== Test 7: Grafana Datasources Validation ==="

# Get Grafana datasources
DATASOURCES=$(curl -s -u admin:admin "http://${ALB_DNS}/grafana/api/datasources" || echo '[]')
PROMETHEUS_DS=$(echo "$DATASOURCES" | jq -r '.[] | select(.type=="prometheus") | .name' 2>/dev/null || echo "")
CLOUDWATCH_DS=$(echo "$DATASOURCES" | jq -r '.[] | select(.type=="cloudwatch") | .name' 2>/dev/null || echo "")

if [ -n "$PROMETHEUS_DS" ]; then
  print_status "PASS" "Prometheus datasource configured: $PROMETHEUS_DS"
else
  print_status "FAIL" "Prometheus datasource not found"
fi

if [ -n "$CLOUDWATCH_DS" ]; then
  print_status "PASS" "CloudWatch datasource configured: $CLOUDWATCH_DS"
else
  print_status "WARN" "CloudWatch datasource not found (optional)"
fi

# Test 8: Test Grafana datasource connectivity
echo ""
echo "=== Test 8: Grafana Datasource Connectivity ==="

# Test Prometheus datasource
if [ -n "$PROMETHEUS_DS" ]; then
  PROMETHEUS_TEST=$(curl -s -u admin:admin "http://${ALB_DNS}/grafana/api/datasources/proxy/1/api/v1/query?query=up" || echo '{"status":"error"}')
  if [[ "$PROMETHEUS_TEST" == *'"status":"success"'* ]]; then
    print_status "PASS" "Prometheus datasource connectivity test passed"
  else
    print_status "FAIL" "Prometheus datasource connectivity test failed"
  fi
fi

# Test 9: Check container logs
echo ""
echo "=== Test 9: Container Logs Validation ==="

# Check if containers are logging
PROMETHEUS_LOGS=$(run_ssm_command "$INSTANCE_ID" "docker logs \$(docker ps -q -f name=prometheus) 2>&1 | tail -5 | grep -v 'level=error' | wc -l" "Check Prometheus logs")
if [ "$PROMETHEUS_LOGS" -gt "0" ]; then
  print_status "PASS" "Prometheus is generating logs"
else
  print_status "WARN" "Prometheus may have logging issues"
fi

GRAFANA_LOGS=$(run_ssm_command "$INSTANCE_ID" "docker logs \$(docker ps -q -f name=grafana) 2>&1 | tail -5 | grep -v 'error' | wc -l" "Check Grafana logs")
if [ "$GRAFANA_LOGS" -gt "0" ]; then
  print_status "PASS" "Grafana is generating logs"
else
  print_status "WARN" "Grafana may have logging issues"
fi

# Summary
echo ""
echo "=============================================="
echo "Validation Summary"
echo "=============================================="
echo "Access URLs:"
echo "  Grafana:    http://${ALB_DNS}/grafana (admin/admin)"
echo "  Prometheus: http://${ALB_DNS}/prometheus"
echo "  Targets:    http://${ALB_DNS}/prometheus/targets"
echo ""
echo "Instance Details:"
echo "  Instance ID: $INSTANCE_ID"
echo "  Private IP:  $INSTANCE_IP"
echo ""

# Exit with success if we got this far
print_status "PASS" "Monitoring deployment validation completed"
echo ""
echo "If any tests failed, check the specific component logs and configurations."
echo "Use the troubleshooting script for detailed fixes."