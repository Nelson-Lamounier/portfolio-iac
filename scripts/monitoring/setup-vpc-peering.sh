#!/bin/bash
# Setup VPC peering between pipeline and development accounts

set -e

PIPELINE_ENV="${PIPELINE_ENV:-pipeline}"
DEV_ENV="${DEV_ENV:-development}"
AWS_REGION="${AWS_REGION:-eu-west-1}"

echo "========================================="
echo "VPC Peering Setup"
echo "========================================="
echo ""
echo "Pipeline Environment: $PIPELINE_ENV"
echo "Development Environment: $DEV_ENV"
echo "Region: $AWS_REGION"
echo ""

# ============================================================================
# Step 1: Get Pipeline VPC Info
# ============================================================================
echo "Step 1: Getting pipeline VPC information..."

PIPELINE_VPC=$(aws ec2 describe-vpcs \
  --filters "Name=tag:Environment,Values=$PIPELINE_ENV" \
  --query 'Vpcs[0].VpcId' \
  --output text \
  --region "$AWS_REGION")

if [ "$PIPELINE_VPC" = "None" ] || [ -z "$PIPELINE_VPC" ]; then
  echo "ERROR: Pipeline VPC not found"
  exit 1
fi

PIPELINE_CIDR=$(aws ec2 describe-vpcs \
  --vpc-ids "$PIPELINE_VPC" \
  --query 'Vpcs[0].CidrBlock' \
  --output text \
  --region "$AWS_REGION")

echo "✓ Pipeline VPC: $PIPELINE_VPC"
echo "  CIDR: $PIPELINE_CIDR"
echo ""

# Export for CDK
export PIPELINE_VPC_ID="$PIPELINE_VPC"
export PIPELINE_VPC_CIDR="$PIPELINE_CIDR"

# ============================================================================
# Step 2: Get Development VPC Info (requires role assumption)
# ============================================================================
echo "Step 2: Getting development VPC information..."
echo "Note: This requires AWS credentials to be configured for dev account"
echo ""

DEV_VPC=$(aws ec2 describe-vpcs \
  --filters "Name=tag:Environment,Values=$DEV_ENV" \
  --query 'Vpcs[0].VpcId' \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "NOT_FOUND")

if [ "$DEV_VPC" = "NOT_FOUND" ] || [ "$DEV_VPC" = "None" ] || [ -z "$DEV_VPC" ]; then
  echo "WARNING: Development VPC not found or not accessible"
  echo "Make sure:"
  echo "  1. Development infrastructure is deployed"
  echo "  2. AWS credentials are configured for dev account"
  echo "  3. Cross-account role has ec2:DescribeVpcs permission"
  echo ""
  echo "Skipping VPC peering setup"
  exit 0
fi

DEV_CIDR=$(aws ec2 describe-vpcs \
  --vpc-ids "$DEV_VPC" \
  --query 'Vpcs[0].CidrBlock' \
  --output text \
  --region "$AWS_REGION")

echo "✓ Development VPC: $DEV_VPC"
echo "  CIDR: $DEV_CIDR"
echo ""

# Export for CDK
export DEV_VPC_ID="$DEV_VPC"
export DEV_VPC_CIDR="$DEV_CIDR"

# ============================================================================
# Step 3: Validate CIDR Blocks
# ============================================================================
echo "Step 3: Validating CIDR blocks..."

if [ "$PIPELINE_CIDR" = "$DEV_CIDR" ]; then
  echo "ERROR: VPC CIDR blocks overlap!"
  echo "  Pipeline: $PIPELINE_CIDR"
  echo "  Development: $DEV_CIDR"
  echo ""
  echo "VPC peering requires non-overlapping CIDR blocks."
  echo "Update development VPC to use a different CIDR (e.g., 10.1.0.0/16)"
  exit 1
fi

echo "✓ CIDR blocks are compatible"
echo "  Pipeline: $PIPELINE_CIDR"
  echo "  Development: $DEV_CIDR"
echo ""

# ============================================================================
# Step 4: Deploy VPC Peering via CDK
# ============================================================================
echo "Step 4: Deploying VPC peering connection..."
echo ""

cd infrastructure

ENVIRONMENT="$PIPELINE_ENV" yarn cdk deploy \
  VpcPeeringStack-$PIPELINE_ENV \
  --require-approval never

echo ""
echo "✓ VPC peering stack deployed"
echo ""

# ============================================================================
# Step 5: Verify Peering Connection
# ============================================================================
echo "Step 5: Verifying peering connection..."
echo ""

# Switch back to pipeline account to check peering
PEERING_CONN=$(aws ec2 describe-vpc-peering-connections \
  --filters "Name=status-code,Values=active,pending-acceptance" \
            "Name=requester-vpc-info.vpc-id,Values=$PIPELINE_VPC" \
  --query 'VpcPeeringConnections[0].VpcPeeringConnectionId' \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "NOT_FOUND")

if [ "$PEERING_CONN" != "NOT_FOUND" ] && [ "$PEERING_CONN" != "None" ]; then
  echo "✓ VPC Peering Connection: $PEERING_CONN"
  
  # Show peering details
  aws ec2 describe-vpc-peering-connections \
    --vpc-peering-connection-ids "$PEERING_CONN" \
    --query 'VpcPeeringConnections[0].{ID:VpcPeeringConnectionId,Status:Status.Code,RequesterVPC:RequesterVpcInfo.VpcId,RequesterCIDR:RequesterVpcInfo.CidrBlock,AccepterVPC:AccepterVpcInfo.VpcId,AccepterCIDR:AccepterVpcInfo.CidrBlock}' \
    --output table \
    --region "$AWS_REGION"
else
  echo "WARNING: VPC peering connection not found"
  echo "Check CloudFormation stack outputs for details"
fi

echo ""
echo "========================================="
echo "VPC Peering Setup Complete"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Update Prometheus config to scrape dev targets"
echo "  2. Test connectivity: ping <dev-instance-ip> from pipeline"
echo "  3. Check Prometheus targets: http://<alb-dns>/prometheus/targets"
echo ""
