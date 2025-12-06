#!/bin/bash
# Setup ECR repository manually (outside of CDK)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENVIRONMENT=${ENVIRONMENT:-development}

echo -e "${GREEN}=== Setting up ECR Repository for ${ENVIRONMENT} ===${NC}"

AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_REGION:-$(aws configure get region)}
AWS_REGION=${AWS_REGION:-eu-west-1}

echo "AWS Account: ${AWS_ACCOUNT}"
echo "AWS Region: ${AWS_REGION}"
echo "Environment: ${ENVIRONMENT}"

REPO_NAME="portfolio-${ENVIRONMENT}"
echo "Repository Name: ${REPO_NAME}"

# Check if repository already exists
echo ""
echo -e "${GREEN}Step 1: Checking if repository exists${NC}"
if aws ecr describe-repositories --repository-names ${REPO_NAME} --region ${AWS_REGION} >/dev/null 2>&1; then
  echo -e "${YELLOW}Repository already exists${NC}"
  REPO_URI=$(aws ecr describe-repositories \
    --repository-names ${REPO_NAME} \
    --region ${AWS_REGION} \
    --query 'repositories[0].repositoryUri' \
    --output text)
else
  echo "Creating ECR repository..."
  
  aws ecr create-repository \
    --repository-name ${REPO_NAME} \
    --region ${AWS_REGION} \
    --image-tag-mutability IMMUTABLE \
    --encryption-configuration encryptionType=AES256 \
    --image-scanning-configuration scanOnPush=true \
    --tags Key=Environment,Value=${ENVIRONMENT} Key=ManagedBy,Value=Manual
  
  REPO_URI=$(aws ecr describe-repositories \
    --repository-names ${REPO_NAME} \
    --region ${AWS_REGION} \
    --query 'repositories[0].repositoryUri' \
    --output text)
  
  echo -e "${GREEN}✓ Repository created${NC}"
fi

echo "Repository URI: ${REPO_URI}"

# Set lifecycle policy
echo ""
echo -e "${GREEN}Step 2: Setting lifecycle policy${NC}"
cat > /tmp/ecr-lifecycle-policy.json << EOF
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
EOF

aws ecr put-lifecycle-policy \
  --repository-name ${REPO_NAME} \
  --region ${AWS_REGION} \
  --lifecycle-policy-text file:///tmp/ecr-lifecycle-policy.json

echo -e "${GREEN}✓ Lifecycle policy set${NC}"

# Store repository URI in SSM Parameter Store
echo ""
echo -e "${GREEN}Step 3: Storing repository URI in SSM Parameter Store${NC}"

aws ssm put-parameter \
  --name "/ecr/${ENVIRONMENT}/repository-uri" \
  --value "${REPO_URI}" \
  --type String \
  --overwrite \
  --region ${AWS_REGION} \
  --description "ECR Repository URI for ${ENVIRONMENT} environment"

aws ssm put-parameter \
  --name "/ecr/${ENVIRONMENT}/repository-name" \
  --value "${REPO_NAME}" \
  --type String \
  --overwrite \
  --region ${AWS_REGION} \
  --description "ECR Repository Name for ${ENVIRONMENT} environment"

echo -e "${GREEN}✓ Repository URI stored in SSM${NC}"

rm /tmp/ecr-lifecycle-policy.json

echo ""
echo -e "${GREEN}=== ECR Setup Complete! ===${NC}"
echo ""
echo "Repository: ${REPO_URI}"
echo "SSM Parameters:"
echo "  /ecr/${ENVIRONMENT}/repository-uri"
echo "  /ecr/${ENVIRONMENT}/repository-name"
