#!/usr/bin/env bash
# @format
# Check if infrastructure exists by verifying ECR parameter in SSM

set -euo pipefail

# Required environment variables
: "${ENVIRONMENT:?ENVIRONMENT must be set}"
: "${AWS_REGION:?AWS_REGION must be set}"

PARAM_NAME="/ecr/${ENVIRONMENT}/repository-uri"

echo "Checking if infrastructure exists..."
echo "Parameter: ${PARAM_NAME}"
echo "Region: ${AWS_REGION}"

if aws ssm get-parameter \
  --name "${PARAM_NAME}" \
  --region "${AWS_REGION}" \
  --query 'Parameter.Value' \
  --output text >/dev/null 2>&1; then
  
  echo "exists=true" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  echo "✓ Infrastructure exists"
  exit 0
else
  echo "exists=false" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  echo "⚠ Infrastructure not found - will deploy infrastructure first"
  
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "::warning::ECR repository not found. Infrastructure must be deployed before frontend."
  fi
  
  exit 0
fi
