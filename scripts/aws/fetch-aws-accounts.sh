#!/usr/bin/env bash
# @format
# Fetch AWS account IDs from SSM Parameter Store in pipeline account

set -euo pipefail

: "${ENVIRONMENT:?ENVIRONMENT must be set}"

echo "Fetching AWS account IDs from SSM Parameter Store..."

# Map environment to parameter name
case "${ENVIRONMENT}" in
  development) PARAM_NAME="dev" ; ENV_VAR_NAME="AWS_ACCOUNT_ID_DEV" ;;
  staging)     PARAM_NAME="test"; ENV_VAR_NAME="AWS_ACCOUNT_ID_STAGING" ;;
  production)  PARAM_NAME="prod"; ENV_VAR_NAME="AWS_ACCOUNT_ID_PROD" ;;
  *)
    echo "❌ Unknown environment: ${ENVIRONMENT}"
    exit 1
    ;;
esac

# Fetch target account ID
AWS_ACCOUNT_ID=$(aws ssm get-parameter \
  --name "/github-actions/accounts/${PARAM_NAME}" \
  --query "Parameter.Value" \
  --output text)

# Fetch pipeline account ID (optional)
AWS_PIPELINE_ACCOUNT_ID=$(aws ssm get-parameter \
  --name "/github-actions/accounts/pipeline" \
  --query "Parameter.Value" \
  --output text 2>/dev/null || echo "")

echo "✓ Target Account (${ENVIRONMENT}): ${AWS_ACCOUNT_ID}"
[ -n "${AWS_PIPELINE_ACCOUNT_ID}" ] && echo "✓ Pipeline Account: ${AWS_PIPELINE_ACCOUNT_ID}"

# Export to GitHub Actions environment
if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "${ENV_VAR_NAME}=${AWS_ACCOUNT_ID}"
    echo "TARGET_ACCOUNT_ID=${AWS_ACCOUNT_ID}"
    [ -n "${AWS_PIPELINE_ACCOUNT_ID}" ] && echo "AWS_PIPELINE_ACCOUNT_ID=${AWS_PIPELINE_ACCOUNT_ID}"
  } >> "${GITHUB_ENV}"
  
  # Mask sensitive values
  echo "::add-mask::${AWS_ACCOUNT_ID}"
  [ -n "${AWS_PIPELINE_ACCOUNT_ID}" ] && echo "::add-mask::${AWS_PIPELINE_ACCOUNT_ID}"
fi
