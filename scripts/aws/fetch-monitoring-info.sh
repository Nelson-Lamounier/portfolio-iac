#!/usr/bin/env bash
# @format
# =============================================================================
# Fetch Monitoring Info from Parameter Store
# =============================================================================
# Retrieves VPC ID and EC2 private IP for cross-account monitoring setup.
# These values are stored in SSM Parameter Store after deploying the
# NetworkingStack and ComputeStack in each environment.
#
# Usage:
#   ENVIRONMENT=development AWS_REGION=eu-west-1 ./scripts/aws/fetch-monitoring-info.sh
#
# SSM Parameters (stored by CDK stacks):
#   /networking/{env}/vpc-id          - VPC ID from NetworkingStack
#   /compute/{env}/ec2-private-ip     - EC2 private IP from ComputeStack
#
# Outputs (for GitHub Actions):
#   vpc-id          - VPC ID
#   ec2-private-ip  - EC2 private IP
#   vpc-found       - true/false
#   ec2-found       - true/false
# =============================================================================

set -euo pipefail

# Required environment variables
: "${ENVIRONMENT:?ENVIRONMENT must be set (e.g., development, staging, production)}"
: "${AWS_REGION:=${AWS_DEFAULT_REGION:-eu-west-1}}"


# Map environment to parameter name
case "${ENVIRONMENT}" in
  development) PARAM_NAME="dev" ; ENV_VAR_NAME="AWS_ACCOUNT_ID_DEV" ;;
  staging)     PARAM_NAME="test"; ENV_VAR_NAME="AWS_ACCOUNT_ID_STAGING" ;;
  production)  PARAM_NAME="prod"; ENV_VAR_NAME="AWS_ACCOUNT_ID_PROD" ;;
  *)
    echo "Unknown environment: ${ENVIRONMENT}"
    exit 1
    ;;
esac

echo "========================================="
echo "Fetching Monitoring Info"
echo "========================================="
echo "Environment: ${ENVIRONMENT}"
echo "Region: ${AWS_REGION}"
echo ""

# Initialize output variables
VPC_ID=""
EC2_PRIVATE_IP=""
VPC_FOUND="false"
EC2_FOUND="false"

# =============================================================================
# Fetch VPC ID
# =============================================================================
# Try multiple SSM parameter paths (different stacks use different conventions)
VPC_PARAM_PATHS=(
  "/networking/${ENVIRONMENT}/vpc-id"
  "/vpc/${ENVIRONMENT}/vpc-id"
)

for VPC_PARAM_NAME in "${VPC_PARAM_PATHS[@]}"; do
  echo "Trying VPC ID from: ${VPC_PARAM_NAME}"
  VPC_ID=$(aws ssm get-parameter \
    --name "${VPC_PARAM_NAME}" \
    --query 'Parameter.Value' \
    --output text \
    --region "${AWS_REGION}" 2>/dev/null || echo "")
  
  if [ -n "${VPC_ID}" ] && [ "${VPC_ID}" != "None" ]; then
    VPC_FOUND="true"
    echo "✓ VPC ID: ${VPC_ID}"
    break
  fi
done

if [ "${VPC_FOUND}" = "false" ]; then
  echo "⚠ VPC ID not found in SSM"
  echo "  Tried: ${VPC_PARAM_PATHS[*]}"
  echo "  Ensure NetworkingStack-${ENVIRONMENT} is deployed"
fi

# =============================================================================
# Fetch EC2 Private IP
# =============================================================================
# Try multiple SSM parameter paths
EC2_PARAM_PATHS=(
  "/compute/${ENVIRONMENT}/ec2-private-ip"
  "/ecs/${ENVIRONMENT}/ec2-private-ip"
)

echo ""
for EC2_PARAM_NAME in "${EC2_PARAM_PATHS[@]}"; do
  echo "Trying EC2 Private IP from: ${EC2_PARAM_NAME}"
  EC2_PRIVATE_IP=$(aws ssm get-parameter \
    --name "${EC2_PARAM_NAME}" \
    --query 'Parameter.Value' \
    --output text \
    --region "${AWS_REGION}" 2>/dev/null || echo "")
  
  if [ -n "${EC2_PRIVATE_IP}" ] && [ "${EC2_PRIVATE_IP}" != "None" ]; then
    EC2_FOUND="true"
    echo "✓ EC2 Private IP: ${EC2_PRIVATE_IP}"
    break
  fi
done

if [ "${EC2_FOUND}" = "false" ]; then
  echo "⚠ EC2 Private IP not found in SSM"
  echo "  Tried: ${EC2_PARAM_PATHS[*]}"
  echo "  Will try to fetch from ECS cluster..."
fi

# =============================================================================
# Alternative: Try to fetch from CloudFormation outputs directly
# =============================================================================
if [ "${VPC_FOUND}" = "false" ]; then
  echo ""
  echo "Trying to fetch VPC ID from CloudFormation outputs..."
  VPC_ID=$(aws cloudformation describe-stacks \
    --stack-name "NetworkingStack-${ENVIRONMENT}" \
    --query 'Stacks[0].Outputs[?OutputKey==`VpcId`].OutputValue' \
    --output text \
    --region "${AWS_REGION}" 2>/dev/null || echo "")
  
  if [ -n "${VPC_ID}" ] && [ "${VPC_ID}" != "None" ]; then
    VPC_FOUND="true"
    echo "✓ VPC ID (from CFN): ${VPC_ID}"
  fi
fi

if [ "${EC2_FOUND}" = "false" ]; then
  echo ""
  echo "Trying to fetch EC2 IP from ECS cluster..."
  
  # Get container instance from ECS cluster
  CLUSTER_NAME="ecs-cluster-${ENVIRONMENT}"
  CONTAINER_INSTANCE_ARN=$(aws ecs list-container-instances \
    --cluster "${CLUSTER_NAME}" \
    --query 'containerInstanceArns[0]' \
    --output text \
    --region "${AWS_REGION}" 2>/dev/null || echo "")
  
  if [ -n "${CONTAINER_INSTANCE_ARN}" ] && [ "${CONTAINER_INSTANCE_ARN}" != "None" ]; then
    EC2_INSTANCE_ID=$(aws ecs describe-container-instances \
      --cluster "${CLUSTER_NAME}" \
      --container-instances "${CONTAINER_INSTANCE_ARN}" \
      --query 'containerInstances[0].ec2InstanceId' \
      --output text \
      --region "${AWS_REGION}" 2>/dev/null || echo "")
    
    if [ -n "${EC2_INSTANCE_ID}" ] && [ "${EC2_INSTANCE_ID}" != "None" ]; then
      EC2_PRIVATE_IP=$(aws ec2 describe-instances \
        --instance-ids "${EC2_INSTANCE_ID}" \
        --query 'Reservations[0].Instances[0].PrivateIpAddress' \
        --output text \
        --region "${AWS_REGION}" 2>/dev/null || echo "")
      
      if [ -n "${EC2_PRIVATE_IP}" ] && [ "${EC2_PRIVATE_IP}" != "None" ]; then
        EC2_FOUND="true"
        echo "✓ EC2 Private IP (from ECS): ${EC2_PRIVATE_IP}"
      fi
    fi
  fi
fi

# =============================================================================
# Output Results
# =============================================================================
echo ""
echo "========================================="
echo "Results"
echo "========================================="
echo "VPC ID:         ${VPC_ID:-NOT_FOUND}"
echo "EC2 Private IP: ${EC2_PRIVATE_IP:-NOT_FOUND}"
echo "VPC Found:      ${VPC_FOUND}"
echo "EC2 Found:      ${EC2_FOUND}"

# Output to GitHub Actions
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "vpc-id=${VPC_ID}"
    echo "ec2-private-ip=${EC2_PRIVATE_IP}"
    echo "vpc-found=${VPC_FOUND}"
    echo "ec2-found=${EC2_FOUND}"
  } >> "${GITHUB_OUTPUT}"
fi

# Also export as environment variables for GitHub Actions
if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "DEV_VPC_ID=${VPC_ID}"
    echo "DEV_NODE_EXPORTER_IP=${EC2_PRIVATE_IP}"
  } >> "${GITHUB_ENV}"
fi

# Export for local use
export DEV_VPC_ID="${VPC_ID}"
export DEV_NODE_EXPORTER_IP="${EC2_PRIVATE_IP}"

echo ""
echo "✓ Done"
