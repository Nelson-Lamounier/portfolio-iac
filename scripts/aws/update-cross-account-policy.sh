#!/bin/bash
# Update cross-account IAM policy in pipeline account to allow role assumption

set -e

ROLE_NAME="github-actions-workflow-role"
POLICY_NAME="CrossAccountAccess"

echo "========================================="
echo "Update Cross-Account IAM Policy"
echo "========================================="
echo ""

# Check if we're in the pipeline account
CURRENT_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
echo "Current AWS Account: $CURRENT_ACCOUNT"
echo ""

# Create policy document
POLICY_DOC=$(cat <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["sts:AssumeRole", "sts:TagSession"],
    "Resource": "arn:aws:iam::*:role/GitHubActionsDeploymentRole"
  }]
}
EOF
)

echo "Policy to be applied:"
echo "$POLICY_DOC"
echo ""

# Check if role exists
if ! aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
  echo "ERROR: Role '$ROLE_NAME' not found in account $CURRENT_ACCOUNT"
  echo "Make sure you're authenticated to the pipeline account"
  exit 1
fi

echo "Role '$ROLE_NAME' found"
echo ""

# Check if policy already exists
if aws iam get-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME" &>/dev/null; then
  echo "Policy '$POLICY_NAME' already exists. Current policy:"
  aws iam get-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME" --query 'PolicyDocument' --output json
  echo ""
  read -p "Do you want to update it? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 0
  fi
fi

# Apply policy
echo "Applying policy..."
echo "$POLICY_DOC" > /tmp/cross-account-policy.json
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document file:///tmp/cross-account-policy.json

rm /tmp/cross-account-policy.json

echo ""
echo "✓ Policy updated successfully"
echo ""

# Verify
echo "Verifying policy..."
aws iam get-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME" --query 'PolicyDocument' --output json

echo ""
echo "========================================="
echo "Policy Update Complete"
echo "========================================="
echo ""
echo "The pipeline account can now assume GitHubActionsDeploymentRole in other accounts"
echo ""
