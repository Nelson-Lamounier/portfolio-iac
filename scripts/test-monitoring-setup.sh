#!/bin/bash
# @format

# End-to-end test script for monitoring setup
# Tests EC2 instance, Prometheus, Grafana, and metrics collection

set -e

ENVIRONMENT=${1:-development}
REGION=${AWS_REGION:-eu-west-1}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    print_info "Running: $test_name"
    
    if eval "$test_command"; then
        print_success "$test_name"
        ((TESTS_PASSED++))
        return 0
    else
        print_error "$test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}

print_header "Monitoring Setup E2E Tests"

# Test 1: Check if monitoring stack exists
print_info "Test 1: Checking if monitoring stack exists..."
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "MonitoringEc2Stack-${ENVIRONMENT}" \
    --query "Stacks[0].StackStatus" \
    --output text \
    --region $REGION 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$STACK_STATUS" = "UPDATE_COMPLETE" ]; then
    print_success "Monitoring stack exists and is healthy"
    ((TESTS_PASSED++))
else
    print_error "Monitoring stack not found or unhealthy: $STACK_STATUS"
    ((TESTS_FAILED++))
    exit 1
fi

# Test 2: Get monitoring instance details
print_info "Test 2: Getting monitoring instance details..."
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --stack-name "MonitoringEc2Stack-${ENVIRONMENT}" \
    --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" \
    --output text \
    --region $REGION)

if [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ]; then
    print_success "Instance ID found: $INSTANCE_ID"
    ((TESTS_PASSED++))
else
    print_error "Instance ID not found"
    ((TESTS_FAILED++))
    exit 1
fi

# Test 3: Check instance state
print_info "Test 3: Checking instance state..."
INSTANCE_STATE=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query "Reservations[0].Instances[0].State.Name" \
    --output text \
    --region $REGION)

if [ "$INSTANCE_STATE" = "running" ]; then
    print_success "Instance is running"
    ((TESTS_PASSED++))
else
    print_error "Instance is not running: $INSTANCE_STATE"
    ((TESTS_FAILED++))
fi

# Test 4: Get public IP
print_info "Test 4: Getting public IP..."
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query "Reservations[0].Instances[0].PublicIpAddress" \
    --output text \
    --region $REGION)

if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ]; then
    print_success "Public IP: $PUBLIC_IP"
    ((TESTS_PASSED++))
else
    print_error "Public IP not found"
    ((TESTS_FAILED++))
fi

# Test 5: Check Grafana accessibility
print_info "Test 5: Checking Grafana accessibility..."
GRAFANA_URL="http://${PUBLIC_IP}:3000"

if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "$GRAFANA_URL" | grep -q "200\|302"; then
    print_success "Grafana is accessible at $GRAFANA_URL"
    ((TESTS_PASSED++))
else
    print_warning "Grafana not accessible yet (may still be starting up)"
    ((TESTS_FAILED++))
fi

# Test 6: Check Prometheus accessibility
print_info "Test 6: Checking Prometheus accessibility..."
PROMETHEUS_URL="http://${PUBLIC_IP}:9090"

if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "$PROMETHEUS_URL" | grep -q "200"; then
    print_success "Prometheus is accessible at $PROMETHEUS_URL"
    ((TESTS_PASSED++))
else
    print_warning "Prometheus not accessible yet (may still be starting up)"
    ((TESTS_FAILED++))
fi

# Test 7: Check Prometheus targets
print_info "Test 7: Checking Prometheus targets..."
TARGETS_RESPONSE=$(curl -s --connect-timeout 10 "${PROMETHEUS_URL}/api/v1/targets" 2>/dev/null || echo "")

if echo "$TARGETS_RESPONSE" | grep -q "prometheus"; then
    print_success "Prometheus is scraping targets"
    ((TESTS_PASSED++))
    
    # Count UP targets
    UP_COUNT=$(echo "$TARGETS_RESPONSE" | grep -o '"health":"up"' | wc -l)
    print_info "Targets UP: $UP_COUNT"
else
    print_warning "Could not verify Prometheus targets"
    ((TESTS_FAILED++))
fi

# Test 8: Check if ALB exists
print_info "Test 8: Checking if ALB exists..."
ALB_DNS=$(aws elbv2 describe-load-balancers \
    --names "${ENVIRONMENT}-alb" \
    --query "LoadBalancers[0].DNSName" \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$ALB_DNS" ] && [ "$ALB_DNS" != "None" ]; then
    print_success "ALB found: $ALB_DNS"
    ((TESTS_PASSED++))
else
    print_warning "ALB not found (may not be deployed yet)"
    ((TESTS_FAILED++))
fi

# Test 9: Check Next.js metrics endpoint
if [ -n "$ALB_DNS" ]; then
    print_info "Test 9: Checking Next.js metrics endpoint..."
    
    METRICS_RESPONSE=$(curl -s --connect-timeout 10 "http://${ALB_DNS}/api/metrics" 2>/dev/null || echo "")
    
    if echo "$METRICS_RESPONSE" | grep -q "nextjs_up"; then
        print_success "Next.js metrics endpoint is working"
        ((TESTS_PASSED++))
        
        # Check for expected metrics
        if echo "$METRICS_RESPONSE" | grep -q "nextjs_page_views_total"; then
            print_success "Page views metric found"
        fi
        if echo "$METRICS_RESPONSE" | grep -q "nextjs_api_calls_total"; then
            print_success "API calls metric found"
        fi
    else
        print_warning "Next.js metrics endpoint not responding correctly"
        ((TESTS_FAILED++))
    fi
else
    print_warning "Test 9: Skipping Next.js metrics test (no ALB)"
fi

# Test 10: Check Docker containers on EC2
print_info "Test 10: Checking Docker containers..."

CONTAINER_CHECK=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=["docker ps --format \"{{.Names}}: {{.Status}}\""]' \
    --region $REGION \
    --output text \
    --query "Command.CommandId" 2>/dev/null || echo "")

if [ -n "$CONTAINER_CHECK" ]; then
    sleep 5
    COMMAND_OUTPUT=$(aws ssm get-command-invocation \
        --command-id "$CONTAINER_CHECK" \
        --instance-id "$INSTANCE_ID" \
        --region $REGION \
        --query "StandardOutputContent" \
        --output text 2>/dev/null || echo "")
    
    if echo "$COMMAND_OUTPUT" | grep -q "prometheus"; then
        print_success "Prometheus container is running"
        ((TESTS_PASSED++))
    else
        print_warning "Prometheus container status unknown"
    fi
    
    if echo "$COMMAND_OUTPUT" | grep -q "grafana"; then
        print_success "Grafana container is running"
    else
        print_warning "Grafana container status unknown"
    fi
    
    if echo "$COMMAND_OUTPUT" | grep -q "node-exporter"; then
        print_success "Node Exporter container is running"
    else
        print_warning "Node Exporter container status unknown"
    fi
else
    print_warning "Could not check container status via SSM"
    ((TESTS_FAILED++))
fi

# Test 11: Check security group rules
print_info "Test 11: Checking security group rules..."
SG_ID=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query "Reservations[0].Instances[0].SecurityGroups[0].GroupId" \
    --output text \
    --region $REGION)

if [ -n "$SG_ID" ]; then
    # Check for Grafana port
    if aws ec2 describe-security-groups \
        --group-ids $SG_ID \
        --query "SecurityGroups[0].IpPermissions[?FromPort==\`3000\`]" \
        --output text \
        --region $REGION | grep -q "3000"; then
        print_success "Security group allows Grafana access (port 3000)"
        ((TESTS_PASSED++))
    else
        print_error "Security group does not allow Grafana access"
        ((TESTS_FAILED++))
    fi
    
    # Check for Prometheus port
    if aws ec2 describe-security-groups \
        --group-ids $SG_ID \
        --query "SecurityGroups[0].IpPermissions[?FromPort==\`9090\`]" \
        --output text \
        --region $REGION | grep -q "9090"; then
        print_success "Security group allows Prometheus access (port 9090)"
    else
        print_warning "Security group does not allow Prometheus access"
    fi
else
    print_error "Could not find security group"
    ((TESTS_FAILED++))
fi

# Test 12: Check IAM role permissions
print_info "Test 12: Checking IAM role permissions..."
ROLE_NAME=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query "Reservations[0].Instances[0].IamInstanceProfile.Arn" \
    --output text \
    --region $REGION | awk -F'/' '{print $NF}')

if [ -n "$ROLE_NAME" ]; then
    # Check for CloudWatch permissions
    if aws iam list-attached-role-policies \
        --role-name "$ROLE_NAME" \
        --query "AttachedPolicies[?contains(PolicyName, 'CloudWatch')]" \
        --output text | grep -q "CloudWatch"; then
        print_success "IAM role has CloudWatch permissions"
        ((TESTS_PASSED++))
    else
        print_warning "CloudWatch permissions not found in attached policies"
    fi
    
    # Check for SSM permissions
    if aws iam list-attached-role-policies \
        --role-name "$ROLE_NAME" \
        --query "AttachedPolicies[?contains(PolicyName, 'SSM')]" \
        --output text | grep -q "SSM"; then
        print_success "IAM role has SSM permissions"
    else
        print_warning "SSM permissions not found in attached policies"
    fi
else
    print_warning "Could not verify IAM role"
    ((TESTS_FAILED++))
fi

# Summary
print_header "Test Summary"

echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    print_success "All tests passed! ✨"
    echo ""
    echo "Access your monitoring:"
    echo "  Grafana: $GRAFANA_URL"
    echo "  Prometheus: $PROMETHEUS_URL"
    echo ""
    echo "Default Grafana credentials: admin/admin"
    exit 0
else
    print_warning "Some tests failed. Review the output above."
    echo ""
    echo "Common issues:"
    echo "  - Containers may still be starting up (wait 2-3 minutes)"
    echo "  - ALB may not be deployed yet"
    echo "  - Security group may need adjustment"
    echo ""
    echo "To check container status:"
    echo "  aws ssm start-session --target $INSTANCE_ID"
    echo "  docker ps"
    echo "  docker logs prometheus"
    echo "  docker logs grafana"
    exit 1
fi
