#!/bin/bash
# @format

# Setup Multi-Account Monitoring
# Run AFTER deploying centralized monitoring stack

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ ${NC}$1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_header() {
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""
}

# Check environment variables
print_header "Checking Environment Variables"

if [ -z "$AWS_PIPELINE_ACCOUNT_ID" ]; then
    print_error "AWS_PIPELINE_ACCOUNT_ID not set"
    exit 1
fi
print_success "Pipeline Account: $AWS_PIPELINE_ACCOUNT_ID"

[ -n "$AWS_ACCOUNT_ID_DEV" ] && print_success "Dev Account: $AWS_ACCOUNT_ID_DEV"
[ -n "$AWS_ACCOUNT_ID_STAGING" ] && print_success "Staging Account: $AWS_ACCOUNT_ID_STAGING"
[ -n "$AWS_ACCOUNT_ID_PROD" ] && print_success "Production Account: $AWS_ACCOUNT_ID_PROD"

REGION=${AWS_REGION:-eu-west-1}
print_success "Region: $REGION"

# Get monitoring cluster instance
print_header "Finding Monitoring Cluster Instance"

INSTANCE_ID=$(aws ec2 describe-instances \
    --filters \
        "Name=tag:Environment,Values=pipeline" \
        "Name=tag:Purpose,Values=Monitoring" \
        "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text)

if [ "$INSTANCE_ID" == "None" ] || [ -z "$INSTANCE_ID" ]; then
    print_error "Monitoring instance not found"
    print_info "Make sure centralized monitoring is deployed"
    exit 1
fi

print_success "Found instance: $INSTANCE_ID"

INSTANCE_IP=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query 'Reservations[0].Instances[0].PrivateIpAddress' \
    --output text)

print_success "Instance IP: $INSTANCE_IP"

# Generate configurations
print_header "Generating Configurations"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_info "Generating Prometheus config..."
OUTPUT_FILE=/tmp/prometheus.yml $SCRIPT_DIR/generate-prometheus-config.sh \
    pipeline \
    $REGION \
    ${AWS_ACCOUNT_ID_DEV:-} \
    ${AWS_ACCOUNT_ID_STAGING:-} \
    ${AWS_ACCOUNT_ID_PROD:-}

print_info "Generating Grafana datasources..."
OUTPUT_FILE=/tmp/datasources.yml $SCRIPT_DIR/generate-grafana-datasources.sh \
    "http://${INSTANCE_IP}:9090/prometheus" \
    $REGION \
    ${AWS_ACCOUNT_ID_DEV:-} \
    ${AWS_ACCOUNT_ID_STAGING:-} \
    ${AWS_ACCOUNT_ID_PROD:-}

print_success "Configurations generated"

# Show next steps
print_header "Next Steps"

echo "1. Upload configurations to monitoring instance:"
echo "   scp /tmp/prometheus.yml ec2-user@${INSTANCE_IP}:/mnt/prometheus-config/"
echo "   scp /tmp/datasources.yml ec2-user@${INSTANCE_IP}:/mnt/grafana-provisioning/datasources/"
echo ""
echo "2. Restart monitoring services:"
echo "   aws ecs update-service --cluster pipeline-monitoring-cluster \\"
echo "     --service pipeline-prometheus --force-new-deployment"
echo "   aws ecs update-service --cluster pipeline-monitoring-cluster \\"
echo "     --service pipeline-grafana --force-new-deployment"
echo ""
echo "3. Verify Prometheus targets at:"
echo "   http://<alb-dns>/prometheus/targets"
echo ""

print_success "Multi-account monitoring setup complete!"
