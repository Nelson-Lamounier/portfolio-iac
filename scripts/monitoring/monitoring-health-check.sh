#!/bin/bash
# monitoring-health-check.sh
# Final pipeline validation with dynamic configuration

set -e

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
AWS_REGION="${AWS_REGION:-eu-west-1}"
ENVIRONMENT="${ENVIRONMENT:-pipeline}"

# Pipeline-specific configuration
ALB_DNS="${ALB_DNS:-}"
PIPELINE_ACCOUNT_ID="${AWS_PIPELINE_ACCOUNT_ID:-}"
DEV_ACCOUNT_ID="${AWS_ACCOUNT_ID_DEV:-}"

# SSM Parameter paths
SSM_PREFIX="/monitoring"

# Pipeline mode detection
PIPELINE_MODE="${GITHUB_ACTIONS:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

FAILED=0
WARNINGS=0

log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_failure() { echo -e "${RED}✗${NC} $1"; FAILED=$((FAILED + 1)); }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
log_info() { echo -e "  ${BLUE}ℹ${NC} $1"; }

# ------------------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------------------

# Get SSM parameter value
get_ssm_param() {
  local name=$1
  local default=$2
  local value
  
  value=$(aws ssm get-parameter \
    --region "$AWS_REGION" \
    --name "$name" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null) || true
  
  if [ -n "$value" ] && [ "$value" != "None" ]; then
    echo "$value"
  else
    echo "$default"
  fi
}

# Get EC2 IP by tags
get_ec2_ip_by_tags() {
  local name_pattern=$1
  local env_tag=$2
  local profile=${3:-}
  
  local profile_arg=""
  [ -n "$profile" ] && profile_arg="--profile $profile"
  
  aws ec2 describe-instances \
    --region "$AWS_REGION" \
    $profile_arg \
    --filters \
      "Name=tag:Name,Values=$name_pattern" \
      "Name=tag:Environment,Values=$env_tag" \
      "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].PrivateIpAddress' \
    --output text 2>/dev/null || echo ""
}

# Get ECS service task IPs
get_ecs_task_ip() {
  local cluster=$1
  local service=$2
  
  local task_arn
  task_arn=$(aws ecs list-tasks \
    --region "$AWS_REGION" \
    --cluster "$cluster" \
    --service-name "$service" \
    --query 'taskArns[0]' \
    --output text 2>/dev/null)
  
  if [ -n "$task_arn" ] && [ "$task_arn" != "None" ]; then
    aws ecs describe-tasks \
      --region "$AWS_REGION" \
      --cluster "$cluster" \
      --tasks "$task_arn" \
      --query 'tasks[0].attachments[0].details[?name==`privateIPv4Address`].value' \
      --output text 2>/dev/null || echo ""
  fi
}

# Get VPC Peering by tags
get_vpc_peering_id() {
  aws ec2 describe-vpc-peering-connections \
    --region "$AWS_REGION" \
    --filters \
      "Name=status-code,Values=active" \
      "Name=tag:Purpose,Values=monitoring,cross-account" \
    --query 'VpcPeeringConnections[0].VpcPeeringConnectionId' \
    --output text 2>/dev/null || echo ""
}

# ------------------------------------------------------------------------------
# Discover Infrastructure
# ------------------------------------------------------------------------------
echo "=========================================="
echo "Monitoring Stack Health Check"
echo "=========================================="
echo ""
echo "Environment: $ENVIRONMENT"
echo "Pipeline Mode: $PIPELINE_MODE"
echo ""
echo "Discovering infrastructure..."
echo ""

# Method priority: ALB_DNS (pipeline) > CloudFormation Output > SSM > EC2 Tags > ECS Tasks > Fallback

# 1. Pipeline Monitoring - Use ALB DNS if provided (pipeline mode)
# First check if ALB_DNS is provided as environment variable
if [ -z "$ALB_DNS" ] || [ "$ALB_DNS" == "None" ] || [ "$ALB_DNS" == "" ]; then
  # Fallback: Get ALB DNS from CloudFormation stack output
  log_info "ALB_DNS not provided, attempting to retrieve from CloudFormation..."
  ALB_DNS=$(aws cloudformation describe-stacks \
    --stack-name "MonitoringInfraStack-${ENVIRONMENT}" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDns`].OutputValue' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$ALB_DNS" ] && [ "$ALB_DNS" != "None" ] && [ "$ALB_DNS" != "" ]; then
    log_info "Retrieved ALB DNS from CloudFormation: ***MASKED***"
  else
    log_warning "ALB DNS not found in CloudFormation stack outputs"
  fi
fi

# Use ALB DNS if available (preferred method for pipeline mode)
if [ -n "$ALB_DNS" ] && [ "$ALB_DNS" != "None" ] && [ "$ALB_DNS" != "" ]; then
  # When using ALB, we use ALB_DNS directly for health checks
  # PIPELINE_EC2_IP is set to ALB_DNS for validation purposes
  PIPELINE_EC2_IP="$ALB_DNS"
  log_info "Using ALB DNS for health checks: ***MASKED***"
else
  # Fallback to discovery methods (for direct EC2 access scenarios)
  log_info "ALB DNS not available, falling back to EC2 instance discovery..."
  PIPELINE_EC2_IP=$(get_ssm_param "${SSM_PREFIX}/pipeline/ec2-ip" "")
  if [ -z "$PIPELINE_EC2_IP" ] || [ "$PIPELINE_EC2_IP" == "None" ] || [ "$PIPELINE_EC2_IP" == "" ]; then
    # Try finding instance by tags (more flexible tag matching)
    PIPELINE_EC2_IP=$(get_ec2_ip_by_tags "*monitoring*" "pipeline")
    if [ -z "$PIPELINE_EC2_IP" ] || [ "$PIPELINE_EC2_IP" == "None" ] || [ "$PIPELINE_EC2_IP" == "" ]; then
      # Try finding by ASG tag
      PIPELINE_EC2_IP=$(aws ec2 describe-instances \
        --region "$AWS_REGION" \
        --filters \
          "Name=tag:aws:autoscaling:groupName,Values=*monitoring*" \
          "Name=instance-state-name,Values=running" \
        --query 'Reservations[0].Instances[0].PrivateIpAddress' \
        --output text 2>/dev/null || echo "")
    fi
  fi
  if [ -z "$PIPELINE_EC2_IP" ] || [ "$PIPELINE_EC2_IP" == "None" ] || [ "$PIPELINE_EC2_IP" == "" ]; then
    # Try localhost if running on the monitoring instance itself
    if curl -sf http://localhost:9090/prometheus/-/healthy >/dev/null 2>&1; then
      PIPELINE_EC2_IP="localhost"
      log_info "Using localhost (running on monitoring instance)"
    fi
  fi
fi

# 2. Dev Instance IP (cross-account)
DEV_EC2_IP=$(get_ssm_param "${SSM_PREFIX}/dev/ec2-ip" "")
if [ -z "$DEV_EC2_IP" ]; then
  # Try with dev profile if configured
  DEV_EC2_IP=$(get_ec2_ip_by_tags "*portfolio*,*app*" "development" "dev-account" 2>/dev/null || echo "")
fi

# 3. VPC Peering ID
VPC_PEERING_ID=$(get_ssm_param "${SSM_PREFIX}/vpc-peering-id" "")
if [ -z "$VPC_PEERING_ID" ]; then
  VPC_PEERING_ID=$(get_vpc_peering_id)
fi

# 4. ECS Cluster name
ECS_CLUSTER=$(get_ssm_param "${SSM_PREFIX}/pipeline/ecs-cluster" "pipeline-monitoring-cluster")

# ------------------------------------------------------------------------------
# Build Endpoint URLs
# ------------------------------------------------------------------------------

# Validate minimum requirements
if [ -z "$PIPELINE_EC2_IP" ] || [ "$PIPELINE_EC2_IP" == "None" ] || [ "$PIPELINE_EC2_IP" == "" ]; then
  echo -e "${RED}ERROR: Could not determine Pipeline monitoring endpoint${NC}"
  echo ""
  echo "Debug Information:"
  echo "  ALB_DNS variable: ${ALB_DNS:-(not set)}"
  echo "  ENVIRONMENT: $ENVIRONMENT"
  echo "  AWS_REGION: $AWS_REGION"
  echo ""
  echo "Attempted discovery methods:"
  echo "  1. ALB_DNS from job output: ${ALB_DNS:-(not set)}"
  echo "  2. CloudFormation stack output: $(aws cloudformation describe-stacks --stack-name MonitoringInfraStack-${ENVIRONMENT} --region $AWS_REGION --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDns`].OutputValue' --output text 2>/dev/null || echo 'failed')"
  echo "  3. SSM parameter: $(get_ssm_param "${SSM_PREFIX}/pipeline/ec2-ip" "not found")"
  echo "  4. EC2 tags: $(get_ec2_ip_by_tags "*monitoring*" "pipeline" || echo 'not found')"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Verify MonitoringInfraStack-pipeline is deployed successfully"
  echo "  2. Check if LoadBalancerDns output exists in CloudFormation stack"
  echo "  3. Ensure ALB_DNS is provided in pipeline mode (from deploy-monitoring-infra job output)"
  echo "  4. Ensure EC2 instance has tags: Name=*monitoring*, Environment=pipeline"
  echo "  5. Or set SSM parameter: ${SSM_PREFIX}/pipeline/ec2-ip"
  echo "  6. Or run this script from the monitoring EC2 instance"
  exit 1
fi

# Build URLs based on deployment type
# Use ALB_DNS if available (either from env var or CloudFormation), otherwise use direct IP
if [ -n "$ALB_DNS" ] && [ "$ALB_DNS" != "None" ] && [ "$ALB_DNS" != "" ]; then
  # ALB-based deployment (pipeline mode)
  PROMETHEUS_URL="http://${ALB_DNS}/prometheus"
  GRAFANA_URL="http://${ALB_DNS}/grafana"
  PIPELINE_NODE_EXPORTER="${ALB_DNS}/node-exporter"  # Through ALB if configured
  log_info "Using ALB-based URLs for health checks"
elif [ -n "$PIPELINE_EC2_IP" ] && [ "$PIPELINE_EC2_IP" != "None" ] && [ "$PIPELINE_EC2_IP" != "" ]; then
  # Direct EC2 deployment (fallback)
  PROMETHEUS_URL="http://${PIPELINE_EC2_IP}:9090/prometheus"
  GRAFANA_URL="http://${PIPELINE_EC2_IP}:3001"
  PIPELINE_NODE_EXPORTER="${PIPELINE_EC2_IP}:9100"
  log_info "Using direct EC2 IP-based URLs for health checks"
else
  log_failure "Cannot build URLs - both ALB_DNS and PIPELINE_EC2_IP are unavailable"
  exit 1
fi

if [ -n "$DEV_EC2_IP" ] && [ "$DEV_EC2_IP" != "None" ]; then
  DEV_NODE_EXPORTER="${DEV_EC2_IP}:9100"
  NEXTJS_METRICS="${DEV_EC2_IP}:3000"
  CROSS_ACCOUNT_ENABLED=true
else
  CROSS_ACCOUNT_ENABLED=false
  log_warning "Dev instance IP not found - cross-account checks will be skipped"
fi

# ------------------------------------------------------------------------------
# Display Configuration
# ------------------------------------------------------------------------------
echo "Discovered Configuration:"
echo "-------------------------"
if [ "$PIPELINE_MODE" == "true" ]; then
  # In pipeline mode, mask sensitive information
  printf "%-25s %s\n" "Pipeline Endpoint:" "***MASKED***"
  printf "%-25s %s\n" "Dev EC2 IP:" "${DEV_EC2_IP:+***MASKED***}"
  printf "%-25s %s\n" "VPC Peering ID:" "${VPC_PEERING_ID:+***MASKED***}"
else
  # In local mode, show full information
  printf "%-25s %s\n" "Pipeline EC2 IP:" "$PIPELINE_EC2_IP"
  printf "%-25s %s\n" "Dev EC2 IP:" "${DEV_EC2_IP:-NOT FOUND}"
  printf "%-25s %s\n" "VPC Peering ID:" "${VPC_PEERING_ID:-NOT FOUND}"
fi
printf "%-25s %s\n" "ECS Cluster:" "$ECS_CLUSTER"
printf "%-25s %s\n" "Prometheus URL:" "${PROMETHEUS_URL//$PIPELINE_EC2_IP/***MASKED***}"
printf "%-25s %s\n" "Grafana URL:" "${GRAFANA_URL//$PIPELINE_EC2_IP/***MASKED***}"
printf "%-25s %s\n" "Cross-Account Checks:" "$CROSS_ACCOUNT_ENABLED"
printf "%-25s %s\n" "Pipeline Mode:" "$PIPELINE_MODE"
echo ""

# ------------------------------------------------------------------------------
# 1. VPC Peering Check
# ------------------------------------------------------------------------------
echo "1. VPC Peering Connection"
echo "-------------------------"

if [ -n "$VPC_PEERING_ID" ] && [ "$VPC_PEERING_ID" != "None" ]; then
  PEERING_STATUS=$(aws ec2 describe-vpc-peering-connections \
    --vpc-peering-connection-ids "$VPC_PEERING_ID" \
    --region "$AWS_REGION" \
    --query 'VpcPeeringConnections[0].Status.Code' \
    --output text 2>/dev/null || echo "FAILED")

  if [ "$PEERING_STATUS" == "active" ]; then
    log_success "VPC Peering $VPC_PEERING_ID is active"
  else
    log_failure "VPC Peering $VPC_PEERING_ID status: $PEERING_STATUS (expected: active)"
  fi
else
  log_warning "VPC Peering ID not found - skipping check"
fi

# ------------------------------------------------------------------------------
# 2. Cross-Account Network Connectivity
# ------------------------------------------------------------------------------
echo ""
echo "2. Cross-Account Network Connectivity"
echo "--------------------------------------"

if [ "$CROSS_ACCOUNT_ENABLED" == "true" ]; then
  # Test connectivity to dev node-exporter
  if timeout 5 bash -c "echo > /dev/tcp/${DEV_EC2_IP}/9100" 2>/dev/null; then
    log_success "Can reach dev node-exporter at $DEV_NODE_EXPORTER"
  else
    log_failure "Cannot reach dev node-exporter at $DEV_NODE_EXPORTER"
    log_info "Check: VPC peering routes, security groups, NACLs"
  fi

  # Test connectivity to dev Next.js app
  if timeout 5 bash -c "echo > /dev/tcp/${DEV_EC2_IP}/3000" 2>/dev/null; then
    log_success "Can reach dev Next.js app at $NEXTJS_METRICS"
  else
    log_failure "Cannot reach dev Next.js app at $NEXTJS_METRICS"
  fi
else
  log_warning "Skipping cross-account checks (dev IP not available)"
fi

# ------------------------------------------------------------------------------
# 3. Prometheus Health
# ------------------------------------------------------------------------------
echo ""
echo "3. Prometheus Health"
echo "--------------------"

PROM_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$PROMETHEUS_URL/-/healthy" 2>/dev/null || echo "000")
if [ "$PROM_HEALTH" == "200" ]; then
  log_success "Prometheus is healthy"
else
  log_failure "Prometheus health check failed (HTTP $PROM_HEALTH)"
fi

PROM_READY=$(curl -s -o /dev/null -w "%{http_code}" "$PROMETHEUS_URL/-/ready" 2>/dev/null || echo "000")
if [ "$PROM_READY" == "200" ]; then
  log_success "Prometheus is ready"
else
  log_failure "Prometheus not ready (HTTP $PROM_READY)"
fi

# Check scrape targets
if [ "$PROM_HEALTH" == "200" ]; then
  echo ""
  echo "   Prometheus Scrape Targets:"
  
  TARGETS_JSON=$(curl -s "$PROMETHEUS_URL/api/v1/targets" 2>/dev/null)
  
  check_target() {
    local job_name=$1
    local state
    local last_error
    
    state=$(echo "$TARGETS_JSON" | jq -r ".data.activeTargets[] | select(.labels.job==\"$job_name\") | .health" 2>/dev/null | head -1)
    last_error=$(echo "$TARGETS_JSON" | jq -r ".data.activeTargets[] | select(.labels.job==\"$job_name\") | .lastError" 2>/dev/null | head -1)
    
    if [ "$state" == "up" ]; then
      log_success "Target '$job_name' is UP"
    elif [ -z "$state" ]; then
      log_warning "Target '$job_name' not found"
    else
      log_failure "Target '$job_name' is $state"
      [ -n "$last_error" ] && [ "$last_error" != "null" ] && log_info "Error: $last_error"
    fi
  }
  
  check_target "prometheus"
  check_target "pipeline-node-exporter"
  
  if [ "$CROSS_ACCOUNT_ENABLED" == "true" ]; then
    check_target "dev-node-exporter"
    check_target "dev-nextjs-app"
  fi
fi

# ------------------------------------------------------------------------------
# 4. Grafana Health
# ------------------------------------------------------------------------------
echo ""
echo "4. Grafana Health"
echo "-----------------"

GRAFANA_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$GRAFANA_URL/api/health" 2>/dev/null || echo "000")
if [ "$GRAFANA_HEALTH" == "200" ]; then
  log_success "Grafana is healthy"
else
  log_failure "Grafana health check failed (HTTP $GRAFANA_HEALTH)"
fi

# ------------------------------------------------------------------------------
# 5. ECS Services
# ------------------------------------------------------------------------------
echo ""
echo "5. ECS Services"
echo "---------------"

check_ecs_service() {
  local service=$1
  
  local result
  result=$(aws ecs describe-services \
    --cluster "$ECS_CLUSTER" \
    --services "$service" \
    --region "$AWS_REGION" \
    --query 'services[0].{running:runningCount,desired:desiredCount,status:status,deployments:deployments[0].status}' \
    --output json 2>/dev/null)
  
  if [ -n "$result" ] && [ "$result" != "null" ]; then
    local running desired status deployment_status
    running=$(echo "$result" | jq -r '.running // 0')
    desired=$(echo "$result" | jq -r '.desired // 0')
    status=$(echo "$result" | jq -r '.status // "UNKNOWN"')
    deployment_status=$(echo "$result" | jq -r '.deployments // "UNKNOWN"')
    
    if [ "$status" == "ACTIVE" ] && [ "$running" == "$desired" ] && [ "$running" -gt 0 ]; then
      log_success "$service: $running/$desired tasks running (deployment: $deployment_status)"
    elif [ "$status" == "ACTIVE" ] && [ "$running" != "$desired" ]; then
      log_warning "$service: $running/$desired tasks (scaling in progress)"
    else
      log_failure "$service: $running/$desired tasks (status: $status)"
    fi
  else
    log_warning "Could not check $service - service may not exist"
  fi
}

# Check pipeline-specific ECS services
if [ "$ENVIRONMENT" == "pipeline" ]; then
  check_ecs_service "pipeline-prometheus"
  check_ecs_service "pipeline-grafana" 
  check_ecs_service "pipeline-monitoring-node-exporter"
else
  # Fallback service names
  check_ecs_service "prometheus-service"
  check_ecs_service "grafana-service"
fi

# Additional ECS cluster health check
echo ""
echo "   ECS Cluster Health:"
CLUSTER_STATUS=$(aws ecs describe-clusters \
  --clusters "$ECS_CLUSTER" \
  --region "$AWS_REGION" \
  --query 'clusters[0].status' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$CLUSTER_STATUS" == "ACTIVE" ]; then
  log_success "ECS Cluster '$ECS_CLUSTER' is active"
  
  # Check cluster capacity
  CAPACITY=$(aws ecs describe-clusters \
    --clusters "$ECS_CLUSTER" \
    --region "$AWS_REGION" \
    --include CAPACITY_PROVIDERS \
    --query 'clusters[0].registeredContainerInstancesCount' \
    --output text 2>/dev/null || echo "0")
  
  if [ "$CAPACITY" -gt 0 ]; then
    log_success "ECS Cluster has $CAPACITY registered container instances"
  else
    log_info "ECS Cluster using Fargate (no EC2 instances required)"
  fi
else
  log_failure "ECS Cluster '$ECS_CLUSTER' status: $CLUSTER_STATUS"
fi

# ------------------------------------------------------------------------------
# 6. Application Metrics (if cross-account enabled)
# ------------------------------------------------------------------------------
if [ "$CROSS_ACCOUNT_ENABLED" == "true" ]; then
  echo ""
  echo "6. Application Metrics"
  echo "----------------------"
  
  METRICS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://$NEXTJS_METRICS/api/metrics" 2>/dev/null || echo "000")
  if [ "$METRICS_STATUS" == "200" ]; then
    log_success "Next.js metrics endpoint responding"
  else
    log_failure "Next.js metrics not responding (HTTP $METRICS_STATUS)"
  fi
fi

# ------------------------------------------------------------------------------
# Pipeline-Specific Validation
# ------------------------------------------------------------------------------
if [ "$PIPELINE_MODE" == "true" ]; then
  echo ""
  echo "6. Pipeline-Specific Validation"
  echo "-------------------------------"
  
  # Validate CloudFormation stacks are in good state
  check_cf_stack() {
    local stack_name=$1
    local status
    status=$(aws cloudformation describe-stacks \
      --stack-name "$stack_name" \
      --region "$AWS_REGION" \
      --query 'Stacks[0].StackStatus' \
      --output text 2>/dev/null || echo "NOT_FOUND")
    
    case "$status" in
      "CREATE_COMPLETE"|"UPDATE_COMPLETE")
        log_success "CloudFormation stack '$stack_name': $status"
        ;;
      "NOT_FOUND")
        log_warning "CloudFormation stack '$stack_name' not found"
        ;;
      *"ROLLBACK"*|*"FAILED"*)
        log_failure "CloudFormation stack '$stack_name': $status"
        ;;
      *"IN_PROGRESS"*)
        log_warning "CloudFormation stack '$stack_name': $status (operation in progress)"
        ;;
      *)
        log_warning "CloudFormation stack '$stack_name': $status"
        ;;
    esac
  }
  
  check_cf_stack "NetworkingStack-pipeline"
  check_cf_stack "MonitoringEfsStack-pipeline"
  check_cf_stack "MonitoringInfraStack-pipeline"
  check_cf_stack "MonitoringServiceStack-pipeline"
  
  # Check if VPC peering stack exists (optional)
  if [ -n "$DEV_ACCOUNT_ID" ]; then
    check_cf_stack "VpcPeeringStack-pipeline"
  fi
fi

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "Health Check Summary"
echo "=========================================="

# Display summary with context
echo "Environment: $ENVIRONMENT"
echo "Pipeline Mode: $PIPELINE_MODE"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

if [ $FAILED -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed! Monitoring infrastructure is healthy.${NC}"
  
  if [ "$PIPELINE_MODE" == "true" ]; then
    echo ""
    echo "🎉 Pipeline deployment validation successful!"
    echo "📊 Monitoring stack is ready for use"
    echo "🔗 Access endpoints are available (check pipeline outputs)"
  fi
  
  exit 0
elif [ $FAILED -eq 0 ]; then
  echo -e "${YELLOW}⚠️  Passed with $WARNINGS warning(s)${NC}"
  echo ""
  echo "ℹ️  The monitoring infrastructure is functional but has some non-critical issues."
  echo "📋 Review the warnings above and consider addressing them."
  
  if [ "$PIPELINE_MODE" == "true" ]; then
    echo "✅ Pipeline deployment can proceed"
  fi
  
  exit 0
else
  echo -e "${RED}❌ $FAILED check(s) failed, $WARNINGS warning(s)${NC}"
  echo ""
  echo "🚨 Critical issues detected in monitoring infrastructure!"
  echo "🔧 Please review and fix the failed checks before proceeding."
  
  if [ "$PIPELINE_MODE" == "true" ]; then
    echo ""
    echo "Pipeline deployment validation failed. Check the errors above."
    echo "Common issues:"
    echo "  - Services still starting up (wait a few minutes and retry)"
    echo "  - Network connectivity issues"
    echo "  - Resource configuration problems"
    echo "  - CloudFormation stack failures"
  fi
  
  exit 1
fi