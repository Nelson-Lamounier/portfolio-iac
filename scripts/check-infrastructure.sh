#!/usr/bin/env bash
# @format
# Check if infrastructure exists by verifying ECR parameter in SSM

set -euo pipefail

# Required environment variables
: "${ENVIRONMENT:?ENVIRONMENT must be set}"
: "${AWS_REGION:?AWS_REGION must be set}"

# Get current AWS account to verify we're checking the right account
CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

PARAM_NAME="/ecr/${ENVIRONMENT}/repository-uri"

echo "Checking if infrastructure exists..."
echo "Current AWS Account: ${CURRENT_ACCOUNT}"
echo "Environment: ${ENVIRONMENT}"
echo "Parameter: ${PARAM_NAME}"
echo "Region: ${AWS_REGION}"

# Verify we're in the target account, not the pipeline account
# The AWS_OIDC_ROLE should already be configured for the target account
if [ -n "${TARGET_ACCOUNT_ID:-}" ]; then
  if [ "${CURRENT_ACCOUNT}" != "${TARGET_ACCOUNT_ID}" ]; then
    echo "::error::Currently in account ${CURRENT_ACCOUNT}, but expected ${TARGET_ACCOUNT_ID}"
    exit 1
  fi
  echo "✓ Verified we're in the correct target account"
fi

# Try to get the parameter and capture the error
if PARAM_VALUE=$(aws ssm get-parameter \
  --name "${PARAM_NAME}" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' \
  --output text 2>&1); then
  
  echo "exists=true" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  echo "✓ Infrastructure exists"
  echo "✓ ECR Repository URI: ${PARAM_VALUE}"
  exit 0
else
  echo "exists=false" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  echo "⚠ Infrastructure not found - will deploy infrastructure first"
  echo "Debug: SSM parameter check failed with: ${PARAM_VALUE}"
  
  # List all ECR-related parameters to help debug
  echo "Listing all /ecr/ parameters in this account:"
  aws ssm describe-parameters \
    --parameter-filters "Key=Name,Option=BeginsWith,Values=/ecr/" \
    --region "${AWS_REGION}" \
    --query 'Parameters[].Name' \
    --output text 2>&1 || echo "Failed to list parameters"
  
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "::warning::ECR repository parameter not found at ${PARAM_NAME}. Infrastructure must be deployed before frontend."
  fi
  
  exit 0
fi
