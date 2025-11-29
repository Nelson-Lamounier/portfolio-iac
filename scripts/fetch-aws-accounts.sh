#!/usr/bin/env bash
# @format
# Fetch AWS account IDs from Parameter Store

set -euo pipefail

# Required environment variables
: "${ENVIRONMENT:?ENVIRONMENT must be set}"

echo "Fetching parameters from AWS Systems Manager Parameter Store..."

# Map environment names to parameter names
case "${ENVIRONMENT}" in
  "development")
    PARAM_NAME="dev"
    ENV_VAR_NAME="AWS_ACCOUNT_ID_DEV"
    ;;
  "staging")
    PARAM_NAME="test"
    ENV_VAR_NAME="AWS_ACCOUNT_ID_STAGING"
    ;;
  "production")
    PARAM_NAME="prod"
    ENV_VAR_NAME="AWS_ACCOUNT_ID_PROD"
    ;;
  *)
    echo "Unknown environment: ${ENVIRONMENT}"
    exit 1
    ;;
esac

# Fetch account IDs
AWS_ACCOUNT_ID=$(aws ssm get-parameter \
  --name "/github-actions/accounts/${PARAM_NAME}" \
  --query "Parameter.Value" \
  --output text)

AWS_PIPELINE_ACCOUNT_ID=$(aws ssm get-parameter \
  --name "/github-actions/accounts/pipeline" \
  --query "Parameter.Value" \
  --output text)

echo "✓ Found account ID for ${ENVIRONMENT} environment"

# Mask sensitive values in GitHub Actions
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "::add-mask::${AWS_ACCOUNT_ID}"
  echo "::add-mask::${AWS_PIPELINE_ACCOUNT_ID}"
fi

# Output to GitHub Actions environment or stdout
if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "${ENV_VAR_NAME}=${AWS_ACCOUNT_ID}"
    echo "AWS_PIPELINE_ACCOUNT_ID=${AWS_PIPELINE_ACCOUNT_ID}"
    echo "TARGET_ACCOUNT_ID=${AWS_ACCOUNT_ID}"
  } >> "${GITHUB_ENV}"
else
  echo "${ENV_VAR_NAME}=${AWS_ACCOUNT_ID}"
  echo "AWS_PIPELINE_ACCOUNT_ID=${AWS_PIPELINE_ACCOUNT_ID}"
  echo "TARGET_ACCOUNT_ID=${AWS_ACCOUNT_ID}"
fi
