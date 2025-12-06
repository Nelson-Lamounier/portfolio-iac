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

print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

TESTS_PASSED=0
TESTS_FAILED=0

print_header "Monitoring Setup E2E Tests"

# Test 1: Check if monitoring stack exists
print_info "Test 1: Checking if monitoring stack exists..."
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "MonitoringEcsStack-${ENVIRONMENT}" \
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

# Test 2: Get ALB DNS
print_info "Test 2: Getting monitoring ALB DNS..."
ALB_DNS=$(aws cloudformation describe-stacks \
    --stack-name "MonitoringEcsStack-${ENVIRONMENT}" \
    --query "Stacks[0].Outputs[?OutputKey=='MonitoringAlbDns'].OutputValue" \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$ALB_DNS" ] && [ "$ALB_DNS" != "None" ]; then
    print_success "ALB DNS: $ALB_DNS"
    ((TESTS_PASSED++))
else
    print_error "ALB DNS not found"
    ((TESTS_FAILED++))
fi

# Test 3: Check Grafana accessibility
print_info "Test 3: Checking Grafana accessibility..."
GRAFANA_URL="http://${ALB_DNS}/grafana"

if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "${GRAFANA_URL}/api/health" | grep -q "200"; then
    print_success "Grafana is accessible at $GRAFANA_URL"
    ((TESTS_PASSED++))
else
    print_warning "Grafana not accessible yet (may still be starting up)"
    ((TESTS_FAILED++))
fi

# Test 4: Check Prometheus accessibility
print_info "Test 4: Checking Prometheus accessibility..."
PROMETHEUS_URL="http://${ALB_DNS}/prometheus"

if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "${PROMETHEUS_URL}/-/healthy" | grep -q "200"; then
    print_success "Prometheus is accessible at $PROMETHEUS_URL"
    ((TESTS_PASSED++))
else
    print_warning "Prometheus not accessible yet (may still be starting up)"
    ((TESTS_FAILED++))
fi

# Test 5: Check Prometheus targets
print_info "Test 5: Checking Prometheus targets..."
TARGETS_RESPONSE=$(curl -s --connect-timeout 10 "${PROMETHEUS_URL}/api/v1/targets" 2>/dev/null || echo "")

if echo "$TARGETS_RESPONSE" | grep -q "prometheus"; then
    print_success "Prometheus is scraping targets"
    ((TESTS_PASSED++))
    UP_COUNT=$(echo "$TARGETS_RESPONSE" | grep -o '"health":"up"' | wc -l)
    print_info "Targets UP: $UP_COUNT"
else
    print_warning "Could not verify Prometheus targets"
    ((TESTS_FAILED++))
fi

# Test 6: Check ECS services
print_info "Test 6: Checking ECS services..."
CLUSTER_NAME="${ENVIRONMENT}-monitoring-cluster"

for SERVICE in prometheus grafana; do
    SERVICE_STATUS=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services "${ENVIRONMENT}-${SERVICE}" \
        --query "services[0].runningCount" \
        --output text \
        --region $REGION 2>/dev/null || echo "0")
    
    if [ "$SERVICE_STATUS" -gt 0 ]; then
        print_success "${SERVICE} service running (count: $SERVICE_STATUS)"
    else
        print_warning "${SERVICE} service not running"
    fi
done

# Summary
print_header "Test Summary"

echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    print_success "All tests passed!"
    echo ""
    echo "Access your monitoring:"
    echo "  Grafana: $GRAFANA_URL"
    echo "  Prometheus: $PROMETHEUS_URL"
    echo ""
    echo "Default Grafana credentials: admin/admin"
    exit 0
else
    print_warning "Some tests failed. Review the output above."
    exit 1
fi
