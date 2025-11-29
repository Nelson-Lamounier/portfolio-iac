#!/usr/bin/env bash
# @format
# Verify CDK bootstrap stack exists and is properly configured

set -euo pipefail

# Required environment variables
: "${ENVIRONMENT:?ENVIRONMENT must be set}"
: "${AWS_REGION:?AWS_REGION must be set}"
: "${TARGET_ACCOUNT_ID:?TARGET_ACCOUNT_ID must be set}"
: "${AWS_PIPELINE_ACCOUNT_ID:?AWS_PIPELINE_ACCOUNT_ID must be set}"

echo "Verifying CDK bootstrap for ${ENVIRONMENT} environment..."
echo "Target Account: ${TARGET_ACCOUNT_ID}"
echo "Region: ${AWS_REGION}"

if aws cloudformation describe-stacks \
  --stack-name CDKToolkit \
  --region "${AWS_REGION}" >/dev/null 2>&1; then
  
  echo "✓ CDK bootstrap stack found"
  
  # Get bootstrap version
  BOOTSTRAP_VERSION=$(aws cloudformation describe-stacks \
    --stack-name CDKToolkit \
    --region "${AWS_REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`BootstrapVersion`].OutputValue' \
    --output text 2>/dev/null || echo "unknown")
  
  echo "✓ Bootstrap version: ${BOOTSTRAP_VERSION}"
  
  # Check trust relationship
  TRUSTED_ACCOUNTS=$(aws cloudformation describe-stacks \
    --stack-name CDKToolkit \
    --region "${AWS_REGION}" \
    --query 'Stacks[0].Parameters[?ParameterKey==`TrustedAccounts`].ParameterValue' \
    --output text 2>/dev/null || echo "")
  
  if echo "${TRUSTED_ACCOUNTS}" | grep -q "${AWS_PIPELINE_ACCOUNT_ID}"; then
    echo "✓ Trust relationship configured with pipeline account"
  else
    echo "⚠ Warning: Pipeline account may not be trusted"
  fi
  
  exit 0
else
  echo "❌ ERROR: CDK bootstrap stack not found!"
  echo ""
  echo "Bootstrap the account with:"
  echo "  cdk bootstrap aws://${TARGET_ACCOUNT_ID}/${AWS_REGION} \\"
  echo "    --trust ${AWS_PIPELINE_ACCOUNT_ID} \\"
  echo "    --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess"
  exit 1
fi
