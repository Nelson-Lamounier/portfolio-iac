#!/bin/bash
# Setup domain configuration in SSM Parameter Store
# This script should be run in your pipeline account to store domain configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Get current AWS account ID
CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
if [ -z "$CURRENT_ACCOUNT" ]; then
    print_error "Failed to get AWS account ID. Please check your AWS credentials."
    exit 1
fi

print_info "Current AWS Account: $CURRENT_ACCOUNT"

# Get parameters from command line or prompt
if [ -z "$1" ]; then
    read -p "Enter root domain name (e.g., yourdomain.com): " ROOT_DOMAIN_NAME
else
    ROOT_DOMAIN_NAME=$1
fi

if [ -z "$2" ]; then
    read -p "Enter Route 53 Hosted Zone ID (e.g., Z1234567890ABC): " HOSTED_ZONE_ID
else
    HOSTED_ZONE_ID=$2
fi

# Validate inputs
if [ -z "$ROOT_DOMAIN_NAME" ]; then
    print_error "Root domain name is required"
    exit 1
fi

if [ -z "$HOSTED_ZONE_ID" ]; then
    print_error "Hosted Zone ID is required"
    exit 1
fi

# Confirm before proceeding
print_warning "This will create/update the following SSM parameters:"
echo "  - /portfolio/domain/root-domain-name = $ROOT_DOMAIN_NAME"
echo "  - /portfolio/domain/hosted-zone-id = $HOSTED_ZONE_ID"
echo ""
read -p "Continue? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Aborted."
    exit 0
fi

# Create/update parameters
print_info "Creating/updating SSM parameters..."

aws ssm put-parameter \
    --name "/portfolio/domain/root-domain-name" \
    --value "$ROOT_DOMAIN_NAME" \
    --type String \
    --description "Root domain name for portfolio application" \
    --overwrite \
    2>/dev/null || {
    print_error "Failed to create root-domain-name parameter"
    exit 1
}

aws ssm put-parameter \
    --name "/portfolio/domain/hosted-zone-id" \
    --value "$HOSTED_ZONE_ID" \
    --type String \
    --description "Route 53 Hosted Zone ID for portfolio domain" \
    --overwrite \
    2>/dev/null || {
    print_error "Failed to create hosted-zone-id parameter"
    exit 1
}

print_info "✓ Parameters created successfully!"
echo ""
print_info "Verifying parameters..."

# Verify parameters
ROOT_DOMAIN_VERIFY=$(aws ssm get-parameter --name "/portfolio/domain/root-domain-name" --query Parameter.Value --output text 2>/dev/null)
HOSTED_ZONE_VERIFY=$(aws ssm get-parameter --name "/portfolio/domain/hosted-zone-id" --query Parameter.Value --output text 2>/dev/null)

echo "  Root Domain Name: $ROOT_DOMAIN_VERIFY"
echo "  Hosted Zone ID: $HOSTED_ZONE_VERIFY"
echo ""

print_info "✓ Setup complete!"
print_info "You can now run 'cdk synth' or 'cdk deploy' and these values will be automatically resolved."
