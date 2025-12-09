#!/bin/bash
# Setup cross-account Prometheus scraping
# This script configures Prometheus in the pipeline account to scrape metrics from dev/staging/prod

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

echo ""
echo "========================================="
echo "Cross-Account Prometheus Scraping Setup"
echo "========================================="
echo ""

# ========================================
# Step 1: Verify VPC Peering Connectivity
# ========================================
print_step "Step 1: Verifying VPC Peering Connectivity"

# Use pipeline profile
export AWS_PROFILE=${AWS_PROFILE:-github-actions}

PEERING_STATUS=$(aws ec2 describe-vpc-peering-connections \
  --filters "Name=status-code,Values=active" \
  --query 'VpcPeeringConnections[0].Status.Code' \
  --output text 2>/dev/null || echo "none")

if [ "$PEERING_STATUS" = "active" ]; then
  print_info "✓ VPC Peering is active"
  
  # Get peering details
  PEERING_ID=$(aws ec2 describe-vpc-peering-connections \
    --filters "Name=status-code,Values=active" \
    --query 'VpcPeeringConnections[0].VpcPeeringConnectionId' \
    --output text)
  
  REQUESTER_CIDR=$(aws ec2 describe-vpc-peering-connections \
    --filters "Name=status-code,Values=active" \
    --query 'VpcPeeringConnections[0].RequesterVpcInfo.CidrBlock' \
    --output text)
  
  ACCEPTER_CIDR=$(aws ec2 describe-vpc-peering-connections \
    --filters "Name=status-code,Values=active" \
    --query 'VpcPeeringConnections[0].AccepterVpcInfo.CidrBlock' \
    --output text)
  
  echo "  Peering ID: $PEERING_ID"
  echo "  Pipeline CIDR: $REQUESTER_CIDR"
  echo "  Development CIDR: $ACCEPTER_CIDR"
else
  print_error "✗ No active VPC peering found"
  print_warning "Run 'make deploy-vpc-peering' first"
  exit 1
fi

echo ""

# ========================================
# Step 2: Get Development Node Exporter IP
# ========================================
print_step "Step 2: Getting Development Node Exporter IP"

DEV_NODE_EXPORTER_IP=""

# Check if already set in environment
if [ -n "$DEV_NODE_EXPORTER_IP" ]; then
  print_info "Using DEV_NODE_EXPORTER_IP from environment: $DEV_NODE_EXPORTER_IP"
else
  # Try to get from SSM parameter (if stored)
  DEV_NODE_EXPORTER_IP=$(aws ssm get-parameter \
    --name "/monitoring/development/node-exporter-ip" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$DEV_NODE_EXPORTER_IP" ] && [ "$DEV_NODE_EXPORTER_IP" != "None" ]; then
    print_info "Found IP in SSM: $DEV_NODE_EXPORTER_IP"
  else
    # Prompt user for the IP
    print_warning "Could not automatically get dev instance IP"
    echo ""
    echo "Please get the IP by running in the dev account:"
    echo "  aws ec2 describe-instances \\"
    echo "    --filters \"Name=tag:Environment,Values=development\" \"Name=instance-state-name,Values=running\" \\"
    echo "    --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text"
    echo ""
    read -p "Enter the development ECS instance private IP: " DEV_NODE_EXPORTER_IP
  fi
fi

if [ -z "$DEV_NODE_EXPORTER_IP" ] || [ "$DEV_NODE_EXPORTER_IP" = "None" ]; then
  print_error "No development instance IP provided"
  exit 1
fi

print_info "✓ Development Node Exporter IP: $DEV_NODE_EXPORTER_IP"

# Store in SSM for future use
print_info "Storing IP in SSM Parameter Store..."
aws ssm put-parameter \
  --name "/monitoring/development/node-exporter-ip" \
  --value "$DEV_NODE_EXPORTER_IP" \
  --type String \
  --overwrite 2>/dev/null || print_warning "Could not store IP in SSM"

echo ""

# ========================================
# Step 3: Redeploy Monitoring Stack with Cross-Account Targets
# ========================================
print_step "Step 3: Redeploying Monitoring Stack with Cross-Account Targets"

echo "This will redeploy MonitoringEcsStack-pipeline with the development target"
echo "  DEV_NODE_EXPORTER_IP=$DEV_NODE_EXPORTER_IP"
echo ""
read -p "Continue? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  print_info "Deploying MonitoringEcsStack-pipeline..."
  
  cd infrastructure
  
  # Export the IP for CDK to pick up
  export DEV_NODE_EXPORTER_IP
  
  ENVIRONMENT=pipeline yarn cdk deploy MonitoringEcsStack-pipeline \
    --require-approval never \
    --profile github-actions
  
  cd ..
  
  print_info "✓ Monitoring stack redeployed with cross-account targets"
else
  print_warning "Skipped monitoring stack deployment"
  echo ""
  echo "To deploy manually, run:"
  echo "  export DEV_NODE_EXPORTER_IP=$DEV_NODE_EXPORTER_IP"
  echo "  cd infrastructure"
  echo "  ENVIRONMENT=pipeline yarn cdk deploy MonitoringEcsStack-pipeline --require-approval never --profile github-actions"
fi

echo ""

# ========================================
# Step 4: Access Grafana
# ========================================
print_step "Step 4: Getting Grafana Access URL"

# Get Grafana URL from CloudFormation outputs
GRAFANA_URL=$(aws cloudformation describe-stacks \
  --stack-name MonitoringEcsStack-pipeline \
  --query 'Stacks[0].Outputs[?OutputKey==`GrafanaUrl`].OutputValue' \
  --output text 2>/dev/null || echo "")

PROMETHEUS_URL=$(aws cloudformation describe-stacks \
  --stack-name MonitoringEcsStack-pipeline \
  --query 'Stacks[0].Outputs[?OutputKey==`PrometheusUrl`].OutputValue' \
  --output text 2>/dev/null || echo "")

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""

if [ -n "$GRAFANA_URL" ]; then
  print_info "Grafana URL: $GRAFANA_URL"
  echo "  Default credentials: admin / admin"
else
  print_warning "Could not get Grafana URL from CloudFormation"
fi

if [ -n "$PROMETHEUS_URL" ]; then
  print_info "Prometheus URL: $PROMETHEUS_URL"
  echo "  Check targets: ${PROMETHEUS_URL}/targets"
fi

echo ""
print_info "Verification Steps:"
echo "  1. Open Prometheus: ${PROMETHEUS_URL}/targets"
echo "     - Look for 'node-exporter-development' job"
echo "     - Status should be 'UP'"
echo ""
echo "  2. Open Grafana: $GRAFANA_URL"
echo "     - Login with admin/admin"
echo "     - Go to Explore → Select Prometheus"
echo "     - Query: up{environment=\"development\"}"
echo ""
echo "  3. If targets are DOWN, check:"
echo "     - Security groups allow port 9100 from pipeline VPC (10.0.0.0/16)"
echo "     - VPC peering routes are configured correctly"
echo "     - Node Exporter is running in dev account"
echo ""
