#!/bin/bash
# Setup ECR repository manually (outside of CDK)
# This script creates the ECR repository and stores its URI in SSM Parameter Store

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ENVIRONMENT=${ENVIRONMENT:-development}

echo -e "${GREEN}=== Setting up ECR Repository for ${ENVIRONMENT} ===${NC}"
echo ""

# Get AWS account and region
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_REGION:-$(aws configure get region)}
AWS_REGION=${AWS_REGION:-eu-west-1}

echo -e "AWS Account: ${YELLOW}${AWS_ACCOUNT}${NC}"
echo -e "AWS Region: ${YELLOW}${AWS_REGION}${NC}"
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo ""

# Repository name
REPO_NAME="portfolio-${ENVIRONMENT}"
echo -e "Repository Name: ${YELLOW}${REPO_NAME}${NC}"

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
  
  # Create repository with immutable tags
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

echo -e "Repository URI: ${YELLOW}${REPO_URI}${NC}"

# Set lifecycle policy to keep only recent images
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

# Check if parameter exists
if aws ssm get-parameter --name "/ecr/${ENVIRONMENT}/repository-uri" --region ${AWS_REGION} >/dev/null 2>&1; then
  echo "Updating existing SSM parameter..."
  aws ssm put-parameter \
    --name "/ecr/${ENVIRONMENT}/repository-uri" \
    --value "${REPO_URI}" \
    --type String \
    --overwrite \
    --region ${AWS_REGION} \
    --description "ECR Repository URI for ${ENVIRONMENT} environment (manually created)"
else
  echo "Creating new SSM parameter..."
  aws ssm put-parameter \
    --name "/ecr/${ENVIRONMENT}/repository-uri" \
    --value "${REPO_URI}" \
    --type String \
    --region ${AWS_REGION} \
    --description "ECR Repository URI for ${ENVIRONMENT} environment (manually created)"
fi

echo -e "${GREEN}✓ Repository URI stored in SSM${NC}"

# Store repository name as well
echo ""
echo -e "${GREEN}Step 4: Storing repository name in SSM Parameter Store${NC}"

if aws ssm get-parameter --name "/ecr/${ENVIRONMENT}/repository-name" --region ${AWS_REGION} >/dev/null 2>&1; then
  aws ssm put-parameter \
    --name "/ecr/${ENVIRONMENT}/repository-name" \
    --value "${REPO_NAME}" \
    --type String \
    --overwrite \
    --region ${AWS_REGION} \
    --description "ECR Repository Name for ${ENVIRONMENT} environment"
else
  aws ssm put-parameter \
    --name "/ecr/${ENVIRONMENT}/repository-name" \
    --value "${REPO_NAME}" \
    --type String \
    --region ${AWS_REGION} \
    --description "ECR Repository Name for ${ENVIRONMENT} environment"
fi

echo -e "${GREEN}✓ Repository name stored in SSM${NC}"

# Optional: Set repository policy for cross-account access (if needed)
if [ -n "${PIPELINE_ACCOUNT}" ]; then
  echo ""
  echo -e "${GREEN}Step 5: Setting repository policy for pipeline account${NC}"
  
  cat > /tmp/ecr-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPipelineAccountPull",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::${PIPELINE_ACCOUNT}:root"
      },
      "Action": [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ]
    }
  ]
}
EOF

  aws ecr set-repository-policy \
    --repository-name ${REPO_NAME} \
    --region ${AWS_REGION} \
    --policy-text file:///tmp/ecr-policy.json
  
  echo -e "${GREEN}✓ Repository policy set for pipeline account${NC}"
fi

echo ""
echo -e "${GREEN}=== ECR Setup Complete! ===${NC}"
echo ""
echo -e "${YELLOW}Repository Details:${NC}"
echo "  Name: ${REPO_NAME}"
echo "  URI: ${REPO_URI}"
echo "  Region: ${AWS_REGION}"
echo ""
echo -e "${YELLOW}SSM Parameters Created:${NC}"
echo "  /ecr/${ENVIRONMENT}/repository-uri"
echo "  /ecr/${ENVIRONMENT}/repository-name"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Build and push your frontend image:"
echo -e "   ${GREEN}cd frontend${NC}"
echo -e "   ${GREEN}docker build -t ${REPO_NAME}:<tag> .${NC}"
echo -e "   ${GREEN}aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com${NC}"
echo -e "   ${GREEN}docker tag ${REPO_NAME}:<tag> ${REPO_URI}:<tag>${NC}"
echo -e "   ${GREEN}docker push ${REPO_URI}:<tag>${NC}"
echo ""
echo "2. Deploy infrastructure:"
echo -e "   ${GREEN}export IMAGE_TAG=<tag>${NC}"
echo -e "   ${GREEN}cd infrastructure && yarn deploy:${ENVIRONMENT}${NC}"
