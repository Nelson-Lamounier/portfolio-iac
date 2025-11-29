#!/usr/bin/env bash
# @format
# Setup AWS CLI profile for GitHub Actions role

set -euo pipefail

echo "=== GitHub Actions Role Setup ==="
echo ""

# Get role ARN
read -p "Enter GitHub OIDC Role ARN (from GitHub secrets): " ROLE_ARN

if [ -z "${ROLE_ARN}" ]; then
  echo "❌ Role ARN is required"
  exit 1
fi

# Get source profile
read -p "Enter source AWS profile name [default]: " SOURCE_PROFILE
SOURCE_PROFILE="${SOURCE_PROFILE:-default}"

# Get region
read -p "Enter AWS region [eu-west-1]: " AWS_REGION
AWS_REGION="${AWS_REGION:-eu-west-1}"

# Profile name
PROFILE_NAME="github-actions"

echo ""
echo "Configuration:"
echo "  Profile name: ${PROFILE_NAME}"
echo "  Role ARN: ${ROLE_ARN}"
echo "  Source profile: ${SOURCE_PROFILE}"
echo "  Region: ${AWS_REGION}"
echo ""

read -p "Create this profile? (y/n): " CONFIRM

if [ "${CONFIRM}" != "y" ]; then
  echo "Cancelled"
  exit 0
fi

# Create config directory if it doesn't exist
mkdir -p ~/.aws

# Backup existing config
if [ -f ~/.aws/config ]; then
  cp ~/.aws/config ~/.aws/config.backup.$(date +%s)
  echo "✓ Backed up existing config"
fi

# Add profile to config
cat >> ~/.aws/config << EOF

# GitHub Actions role (for local testing)
[profile ${PROFILE_NAME}]
region = ${AWS_REGION}
output = json
role_arn = ${ROLE_ARN}
source_profile = ${SOURCE_PROFILE}
EOF

echo "✓ Added profile to ~/.aws/config"
echo ""

# Test the profile
echo "Testing profile..."
if aws sts get-caller-identity --profile ${PROFILE_NAME} >/dev/null 2>&1; then
  echo "✓ Profile works!"
  echo ""
  echo "Current identity:"
  aws sts get-caller-identity --profile ${PROFILE_NAME}
  echo ""
  echo "✅ Setup complete!"
  echo ""
  echo "To use this profile:"
  echo "  export AWS_PROFILE=${PROFILE_NAME}"
  echo ""
  echo "To test locally:"
  echo "  export AWS_PROFILE=${PROFILE_NAME}"
  echo "  export ENVIRONMENT=development"
  echo "  export AWS_REGION=${AWS_REGION}"
  echo "  make check-infra"
else
  echo "❌ Failed to assume role"
  echo ""
  echo "Possible issues:"
  echo "  1. Source profile (${SOURCE_PROFILE}) doesn't have permission to assume role"
  echo "  2. Role trust policy doesn't allow your user"
  echo "  3. Role ARN is incorrect"
  echo ""
  echo "Check the trust policy on the GitHub role:"
  echo "  aws iam get-role --role-name GitHubActionsRole --profile ${SOURCE_PROFILE}"
  exit 1
fi
