#!/bin/bash
# Deploy development environment with cross-account monitoring support

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Deploy Development Environment with Cross-Account Monitoring ===${NC}"
echo ""

# Check required environment variables
if [ -z "$AWS_ACCOUNT_ID_DEV" ]; then
    echo -e "${RED}Error: AWS_ACCOUNT_ID_DEV not set${NC}"
    exit 1
fi

if [ -z "$AWS_PIPELINE_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: AWS_PIPELINE_ACCOUNT_ID not set${NC}"
    exit 1
fi

echo -e "${BLUE}Configuration:${NC}"
echo "  Dev Account: $AWS_ACCOUNT_ID_DEV"
echo "  Pipeline Account: $AWS_PIPELINE_ACCOUNT_ID"
echo "  Region: ${AWS_REGION:-eu-west-1}"
echo ""

# Navigate to infrastructure directory
cd infrastructure

# Build the project
echo -e "${YELLOW}Building CDK project...${NC}"
yarn build

# Deploy stacks in order
echo ""
echo -e "${GREEN}=== Step 1: Deploy Networking Stack ===${NC}"
cdk deploy NetworkingStack-development \
    --context envName=development \
    --require-approval never

echo ""
echo -e "${GREEN}=== Step 2: Deploy Load Balancer Stack ===${NC}"
cdk deploy LoadBalancerStack-development \
    --context envName=development \
    --require-approval never

echo ""
echo -e "${GREEN}=== Step 3: Deploy Compute Stack (with Node Exporter) ===${NC}"
echo -e "${YELLOW}This will:${NC}"
echo "  - Deploy ECS cluster with application"
echo "  - Deploy Node Exporter for metrics collection"
echo "  - Configure security group to allow pipeline VPC (10.0.0.0/16) on port 9100"
echo ""
cdk deploy ComputeStack-development \
    --context envName=development \
    --require-approval never

echo ""
echo -e "${GREEN}=== Step 4: Deploy Cross-Account Monitoring Stack ===${NC}"
echo -e "${YELLOW}This will:${NC}"
echo "  - Create IAM role: development-PipelineMonitoringAccess"
echo "  - Grant CloudWatch, ECS, EC2 read permissions"
echo "  - Allow pipeline account to assume role"
echo "  - Set up EventBridge forwarding to pipeline account"
echo ""
cdk deploy CrossAccountMonitoring-development \
    --context envName=development \
    --require-approval never

# Verify deployment
echo ""
echo -e "${GREEN}=== Verification ===${NC}"

# Check IAM role
echo -e "${YELLOW}Checking IAM role...${NC}"
ROLE_ARN=$(aws iam get-role \
    --role-name development-PipelineMonitoringAccess \
    --query 'Role.Arn' \
    --output text 2>/dev/null || echo "")

if [ -n "$ROLE_ARN" ]; then
    echo -e "${GREEN}✓ IAM role created: $ROLE_ARN${NC}"
else
    echo -e "${RED}✗ IAM role not found${NC}"
fi

# Check security group
echo -e "${YELLOW}Checking security group...${NC}"
SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=tag:Environment,Values=development" "Name=group-name,Values=*ECS*" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -n "$SG_ID" ] && [ "$SG_ID" != "None" ]; then
    echo -e "${GREEN}✓ Security group found: $SG_ID${NC}"
    
    # Check if port 9100 is open from pipeline VPC
    RULE_EXISTS=$(aws ec2 describe-security-groups \
        --group-ids "$SG_ID" \
        --query "SecurityGroups[0].IpPermissions[?FromPort==\`9100\` && ToPort==\`9100\`].IpRanges[?CidrIp==\`10.0.0.0/16\`]" \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$RULE_EXISTS" ]; then
        echo -e "${GREEN}✓ Port 9100 open from pipeline VPC (10.0.0.0/16)${NC}"
    else
        echo -e "${YELLOW}⚠ Port 9100 rule not found - may need manual configuration${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Security group not found${NC}"
fi

# Check Node Exporter service
echo -e "${YELLOW}Checking Node Exporter service...${NC}"
SERVICE_STATUS=$(aws ecs describe-services \
    --cluster development-cluster \
    --services development-node-exporter \
    --query 'services[0].[serviceName,status,runningCount,desiredCount]' \
    --output text 2>/dev/null || echo "")

if [ -n "$SERVICE_STATUS" ]; then
    echo -e "${GREEN}✓ Node Exporter service: $SERVICE_STATUS${NC}"
else
    echo -e "${YELLOW}⚠ Node Exporter service not found${NC}"
fi

# Get instance private IP
echo -e "${YELLOW}Getting ECS instance private IP...${NC}"
INSTANCE_IP=$(aws ec2 describe-instances \
    --filters "Name=tag:Environment,Values=development" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].PrivateIpAddress' \
    --output text 2>/dev/null || echo "")

if [ -n "$INSTANCE_IP" ] && [ "$INSTANCE_IP" != "None" ]; then
    echo -e "${GREEN}✓ ECS instance private IP: $INSTANCE_IP${NC}"
    echo ""
    echo -e "${BLUE}Node Exporter endpoint: http://$INSTANCE_IP:9100/metrics${NC}"
else
    echo -e "${YELLOW}⚠ ECS instance not found${NC}"
fi

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Deploy VPC peering between pipeline and dev accounts"
echo "  2. Deploy monitoring stack in pipeline account"
echo "  3. Test connectivity from pipeline to dev Node Exporter"
echo "  4. Import Grafana dashboard"
echo ""
echo -e "${BLUE}Testing Guide:${NC}"
echo "  See: docs/monitoring/QUICK_TEST_GUIDE.md"
echo ""
