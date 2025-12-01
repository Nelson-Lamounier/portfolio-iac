#!/bin/bash
# Quick test to verify SSM parameter lookup

set -e

export AWS_PROFILE=github-actions

echo "Testing SSM parameter lookup..."
echo "Using profile: $AWS_PROFILE"
echo ""

echo "Checking authentication..."
aws sts get-caller-identity --query Account --output text
echo ""

echo "Fetching root domain name..."
ROOT_DOMAIN=$(aws ssm get-parameter \
    --name "/portfolio/domain/root-domain-name" \
    --query "Parameter.Value" \
    --output text 2>&1)
echo "Result: '$ROOT_DOMAIN'"
echo ""

echo "Fetching hosted zone ID..."
HOSTED_ZONE_ID=$(aws ssm get-parameter \
    --name "/portfolio/domain/hosted-zone-id" \
    --query "Parameter.Value" \
    --output text 2>&1)
echo "Result: '$HOSTED_ZONE_ID'"
echo ""

if [ -z "$ROOT_DOMAIN" ] || [ -z "$HOSTED_ZONE_ID" ]; then
    echo "One or both parameters are empty"
    echo "ROOT_DOMAIN is empty: $([ -z "$ROOT_DOMAIN" ] && echo 'YES' || echo 'NO')"
    echo "HOSTED_ZONE_ID is empty: $([ -z "$HOSTED_ZONE_ID" ] && echo 'YES' || echo 'NO')"
else
    echo "Both parameters found!"
    echo "Domain: $ROOT_DOMAIN"
    echo "Zone ID: $HOSTED_ZONE_ID"
fi
