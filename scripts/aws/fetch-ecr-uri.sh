#!/usr/bin/env bash
# @format
# Fetch ECR repository URI from Parameter Store

set -euo pipefail

# Required environment variables
: "${ENVIRONMENT:?ENVIRONMENT must be set}"
: "${AWS_REGION:?AWS_REGION must be set}"

PARAM_NAME="/ecr/${ENVIRONMENT}/repository-uri"

echo "Fetching ECR repository URI from Parameter Store..."
echo "Parameter: ${PARAM_NAME}"

ECR_REPO_URI=$(aws ssm get-parameter \
  --name "${PARAM_NAME}" \
  --query 'Parameter.Value' \
  --output text \
  --region "${AWS_REGION}")

if [ -z "${ECR_REPO_URI}" ]; then
  echo "Failed to fetch ECR repository URI"
  exit 1
fi

# Parse ECR URI components
ECR_REPO_NAME=$(echo "${ECR_REPO_URI}" | awk -F'/' '{print $NF}')
ECR_REGISTRY=$(echo "${ECR_REPO_URI}" | sed 's|/[^/]*$||')
TARGET_ACCOUNT=$(echo "${ECR_REGISTRY}" | cut -d'.' -f1)

# Mask sensitive values in GitHub Actions
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "::add-mask::${TARGET_ACCOUNT}"
  echo "::add-mask::${ECR_REPO_URI}"
  echo "::add-mask::${ECR_REGISTRY}"
fi

echo "✓ Successfully fetched ECR repository URI"
echo "Repository Name: ${ECR_REPO_NAME}"

# Output to GitHub Actions or stdout
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "repository-uri=${ECR_REPO_URI}"
    echo "repository-name=${ECR_REPO_NAME}"
    echo "registry=${ECR_REGISTRY}"
    echo "target-account=${TARGET_ACCOUNT}"
  } >> "${GITHUB_OUTPUT}"
else
  echo "ECR_REPO_URI=${ECR_REPO_URI}"
  echo "ECR_REPO_NAME=${ECR_REPO_NAME}"
  echo "ECR_REGISTRY=${ECR_REGISTRY}"
  echo "TARGET_ACCOUNT=${TARGET_ACCOUNT}"
fi
