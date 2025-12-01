#!/bin/bash
# Deploy Load Balancer and Certificate stacks locally for testing
# This script deploys only the networking-related stacks without compute resources

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Get environment from parameter or default to development
ENV=${1:-development}
REGION=${AWS_REGION:-eu-west-1}

print_info "Environment: $ENV"
print_info "Region: $REGION"

# Check if we're in the right directory
if [ ! -f "infrastructure/package.json" ]; then
    print_error "Please run this script from the repository root"
    exit 1
fi

# Load environment variables from .env file
if [ -f "infrastructure/.env" ]; then
    print_step "Loading environment variables from infrastructure/.env"
    set -a  # automatically export all variables
    source infrastructure/.env
    set +a
    print_info "✓ Environment variables loaded"
else
    print_warning "No infrastructure/.env file found"
    print_warning "Using current AWS credentials account"
fi

# Set AWS profile for deployment
# Use github-actions profile which has the same role as GitHub Actions
export AWS_PROFILE=github-actions

print_step "Using AWS profile: $AWS_PROFILE"

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
    print_error "AWS credentials not configured for profile: $AWS_PROFILE"
    print_info "Run: aws sso login --profile $AWS_PROFILE"
    exit 1
fi

CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
CURRENT_ROLE=$(aws sts get-caller-identity --query Arn --output text)
print_info "Current AWS Account: $CURRENT_ACCOUNT"
print_info "Current Role: $CURRENT_ROLE"

# Check target account from environment config
if [ -n "$AWS_ACCOUNT_ID_DEV" ] && [ "$ENV" = "development" ]; then
    TARGET_ACCOUNT="$AWS_ACCOUNT_ID_DEV"
elif [ -n "$AWS_ACCOUNT_ID_STAGING" ] && [ "$ENV" = "staging" ]; then
    TARGET_ACCOUNT="$AWS_ACCOUNT_ID_STAGING"
elif [ -n "$AWS_ACCOUNT_ID_PROD" ] && [ "$ENV" = "production" ]; then
    TARGET_ACCOUNT="$AWS_ACCOUNT_ID_PROD"
else
    TARGET_ACCOUNT="$CURRENT_ACCOUNT"
fi

print_info "Target AWS Account: $TARGET_ACCOUNT"

# Verify we can deploy to target account
if [ "$CURRENT_ACCOUNT" != "$TARGET_ACCOUNT" ]; then
    print_warning " Cross-account deployment"
    print_info "Deploying from pipeline account to $ENV account"
    print_info "This is expected when using github-actions profile"
fi

# Check if domain parameters are set (optional for HTTPS)
print_step "Checking domain configuration in SSM Parameter Store..."

# Fetch domain parameters from SSM
ROOT_DOMAIN=""
HOSTED_ZONE_ID=""

if aws ssm get-parameter --name "/portfolio/domain/root-domain-name" &>/dev/null; then
    ROOT_DOMAIN=$(aws ssm get-parameter \
        --name "/portfolio/domain/root-domain-name" \
        --query "Parameter.Value" \
        --output text)
    print_info "Found root domain: $ROOT_DOMAIN"
else
    print_warning "Parameter /portfolio/domain/root-domain-name not found"
fi

if aws ssm get-parameter --name "/portfolio/domain/hosted-zone-id" &>/dev/null; then
    HOSTED_ZONE_ID=$(aws ssm get-parameter \
        --name "/portfolio/domain/hosted-zone-id" \
        --query "Parameter.Value" \
        --output text)
    print_info "Found hosted zone: $HOSTED_ZONE_ID"
else
    print_warning "Parameter /portfolio/domain/hosted-zone-id not found"
fi

echo ""

if [ -z "$ROOT_DOMAIN" ] || [ -z "$HOSTED_ZONE_ID" ]; then
    print_warning "Domain parameters not found in SSM Parameter Store"
    print_warning "Load balancer will be deployed with HTTP only (no HTTPS)"
    print_info "To enable HTTPS, run: make setup-domain-params"
    echo ""
    read -p "Continue with HTTP only? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Aborted. Run 'make setup-domain-params' to configure domain."
        exit 0
    fi
    ENABLE_HTTPS=false
else
    print_info "✓ Domain configuration found:"
    echo "  Domain: $ROOT_DOMAIN"
    echo "  Hosted Zone: $HOSTED_ZONE_ID"
    ENABLE_HTTPS=true
fi

echo ""

# Navigate to infrastructure directory
cd infrastructure

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_step "Installing dependencies..."
    yarn install
fi

# Build infrastructure
print_step "Building infrastructure..."
yarn build

# Clear CDK context to ensure fresh parameter lookup
print_step "Clearing CDK context cache..."
npx cdk context --clear 2>/dev/null || true

# Synthesize to check for errors
print_step "Synthesizing CDK stacks..."
SYNTH_OUTPUT=$(npx cdk synth 2>&1)
SYNTH_EXIT_CODE=$?

if [ $SYNTH_EXIT_CODE -ne 0 ]; then
    print_error "CDK synthesis failed"
    echo "$SYNTH_OUTPUT"
    exit 1
fi

# Check for warnings (but don't fail)
if echo "$SYNTH_OUTPUT" | grep -q "\[Warning"; then
    print_warning "CDK synthesis completed with warnings (this is normal)"
fi

print_info "✓ Synthesis successful"
echo ""

# Show what will be deployed
print_step "Stacks to be deployed:"
echo "  1. NetworkingStack-${ENV} (VPC, Subnets, Security Groups)"
if [ "$ENABLE_HTTPS" = true ]; then
    echo "  2. CertificateStack-${ENV} (SSL/TLS Certificate)"
    echo "  3. LoadBalancerStack-${ENV} (Application Load Balancer with HTTPS)"
else
    echo "  2. LoadBalancerStack-${ENV} (Application Load Balancer - HTTP only)"
fi
echo ""

# Confirm deployment
print_warning "This will deploy resources to AWS"
print_info "Pipeline account: $CURRENT_ACCOUNT"
print_info "Target account: $TARGET_ACCOUNT"
echo ""
read -p "Continue with deployment? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Aborted."
    exit 0
fi

echo ""

# Deploy NetworkingStack first
print_step "Deploying NetworkingStack-${ENV}..."
if npx cdk deploy "NetworkingStack-${ENV}" \
    --require-approval never \
    --progress events \
    --outputs-file ../cdk-outputs-networking.json; then
    print_info "✓ NetworkingStack deployed successfully"
else
    print_error "NetworkingStack deployment failed"
    exit 1
fi

echo ""

# Deploy CertificateStack if HTTPS is enabled
if [ "$ENABLE_HTTPS" = true ]; then
    print_step "Deploying CertificateStack-${ENV}..."
    print_warning "Certificate validation can take 5-30 minutes..."
    print_info "AWS will create DNS validation records in Route 53"
    
    if npx cdk deploy "CertificateStack-${ENV}" \
        --require-approval never \
        --progress events \
        --outputs-file ../cdk-outputs-certificate.json; then
        print_info "✓ CertificateStack deployed successfully"
        
        # Wait for certificate validation
        print_step "Waiting for certificate validation..."
        print_info "This may take several minutes. You can check status in AWS Console:"
        print_info "https://console.aws.amazon.com/acm/home?region=${REGION}#/certificates/list"
        
        # Get certificate ARN from outputs
        CERT_ARN=$(cat ../cdk-outputs-certificate.json | jq -r ".\"CertificateStack-${ENV}\".\"CertificateArn-${ROOT_DOMAIN}\"" 2>/dev/null || echo "")
        
        if [ -n "$CERT_ARN" ]; then
            print_info "Certificate ARN: $CERT_ARN"
            
            # Poll certificate status
            MAX_WAIT=1800  # 30 minutes
            ELAPSED=0
            INTERVAL=30
            
            while [ $ELAPSED -lt $MAX_WAIT ]; do
                CERT_STATUS=$(aws acm describe-certificate \
                    --certificate-arn "$CERT_ARN" \
                    --region "$REGION" \
                    --query "Certificate.Status" \
                    --output text 2>/dev/null || echo "UNKNOWN")
                
                if [ "$CERT_STATUS" = "ISSUED" ]; then
                    print_info "✓ Certificate validated and issued!"
                    break
                elif [ "$CERT_STATUS" = "FAILED" ]; then
                    print_error "Certificate validation failed"
                    print_warning "Check Route 53 DNS records and try again"
                    exit 1
                else
                    echo -ne "\r  Status: $CERT_STATUS - Waiting... (${ELAPSED}s / ${MAX_WAIT}s)"
                    sleep $INTERVAL
                    ELAPSED=$((ELAPSED + INTERVAL))
                fi
            done
            
            echo ""
            
            if [ $ELAPSED -ge $MAX_WAIT ]; then
                print_warning "Certificate validation timeout"
                print_info "Continuing with deployment - certificate may still be validating"
                print_info "Check status: aws acm describe-certificate --certificate-arn $CERT_ARN"
            fi
        fi
    else
        print_error "CertificateStack deployment failed"
        exit 1
    fi
    
    echo ""
fi

# Deploy LoadBalancerStack
print_step "Deploying LoadBalancerStack-${ENV}..."
if npx cdk deploy "LoadBalancerStack-${ENV}" \
    --require-approval never \
    --progress events \
    --outputs-file ../cdk-outputs-loadbalancer.json; then
    print_info "✓ LoadBalancerStack deployed successfully"
else
    print_error "LoadBalancerStack deployment failed"
    exit 1
fi

echo ""

# Get load balancer DNS name
print_step "Retrieving load balancer information..."
LB_DNS=$(cat ../cdk-outputs-loadbalancer.json | jq -r ".\"LoadBalancerStack-${ENV}\".LoadBalancerDnsName" 2>/dev/null || echo "")

if [ -n "$LB_DNS" ]; then
    print_info "✓ Load Balancer deployed successfully!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    print_info "Load Balancer DNS: $LB_DNS"
    echo ""
    
    if [ "$ENABLE_HTTPS" = true ]; then
        print_info "HTTPS Enabled: Yes"
        print_info "Domain: $ROOT_DOMAIN"
        echo ""
        print_warning "Next Steps:"
        echo "  1. Wait for certificate validation (if not complete)"
        echo "  2. Create Route 53 A record pointing to load balancer"
        echo "  3. Test HTTP: curl -I http://$LB_DNS"
        echo "  4. Test HTTPS: curl -I https://$ROOT_DOMAIN"
    else
        print_info "HTTPS Enabled: No"
        echo ""
        print_warning "Next Steps:"
        echo "  1. Test HTTP: curl -I http://$LB_DNS"
        echo "  2. To enable HTTPS, run: make setup-domain-params"
    fi
    
    echo ""
    print_info "View in AWS Console:"
    echo "  https://console.aws.amazon.com/ec2/v2/home?region=${REGION}#LoadBalancers:"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    print_warning "Could not retrieve load balancer DNS name"
    print_info "Check AWS Console for details"
fi

echo ""

# Show stack outputs
print_step "Stack Outputs:"
echo ""

if [ -f "../cdk-outputs-networking.json" ]; then
    echo "NetworkingStack:"
    cat ../cdk-outputs-networking.json | jq ".\"NetworkingStack-${ENV}\"" 2>/dev/null || echo "  (no outputs)"
    echo ""
fi

if [ "$ENABLE_HTTPS" = true ] && [ -f "../cdk-outputs-certificate.json" ]; then
    echo "CertificateStack:"
    cat ../cdk-outputs-certificate.json | jq ".\"CertificateStack-${ENV}\"" 2>/dev/null || echo "  (no outputs)"
    echo ""
fi

if [ -f "../cdk-outputs-loadbalancer.json" ]; then
    echo "LoadBalancerStack:"
    cat ../cdk-outputs-loadbalancer.json | jq ".\"LoadBalancerStack-${ENV}\"" 2>/dev/null || echo "  (no outputs)"
    echo ""
fi

# Cleanup output files
rm -f ../cdk-outputs-*.json

print_info "✓ Deployment complete!"
print_info "To delete these stacks: make delete-stacks ENV=${ENV}"
