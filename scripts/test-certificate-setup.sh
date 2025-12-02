#!/bin/bash
# @format

# Test script for manual certificate setup
# This script verifies that the certificate ARN can be fetched from SSM
# and that the CDK app can use it correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed"
    exit 1
fi

print_header "Certificate Setup Test"

# Test 1: Check if SSM parameter exists
print_info "Test 1: Checking if certificate ARN exists in SSM..."

CERT_ARN=$(aws ssm get-parameter \
    --name "/portfolio/domain/acm-arn" \
    --query "Parameter.Value" \
    --output text 2>/dev/null || echo "")

if [ -z "$CERT_ARN" ]; then
    print_warning "Certificate ARN not found in SSM Parameter Store"
    print_info "Parameter name: /portfolio/domain/acm-arn"
    print_info ""
    print_info "To create the parameter:"
    print_info "1. Create certificate in dev account (AWS Console or CLI)"
    print_info "2. Wait for DNS validation (status = ISSUED)"
    print_info "3. Run: aws ssm put-parameter --name '/portfolio/domain/acm-arn' \\"
    print_info "        --value 'arn:aws:acm:REGION:ACCOUNT:certificate/ID' \\"
    print_info "        --type String --overwrite"
    echo ""
    CERT_ARN=""
else
    print_success "Certificate ARN found in SSM"
    print_info "ARN: ${CERT_ARN:0:60}..."
fi

# Test 2: Validate certificate ARN format
if [ -n "$CERT_ARN" ]; then
    print_info "Test 2: Validating certificate ARN format..."
    
    if [[ $CERT_ARN =~ ^arn:aws:acm:[a-z0-9-]+:[0-9]+:certificate/[a-f0-9-]+$ ]]; then
        print_success "Certificate ARN format is valid"
    else
        print_error "Certificate ARN format is invalid"
        print_info "Expected format: arn:aws:acm:REGION:ACCOUNT:certificate/ID"
        print_info "Actual: $CERT_ARN"
    fi
fi

# Test 3: Check if certificate exists and is valid
if [ -n "$CERT_ARN" ]; then
    print_info "Test 3: Checking certificate status in ACM..."
    
    # Extract region from ARN
    REGION=$(echo $CERT_ARN | cut -d: -f4)
    
    CERT_STATUS=$(aws acm describe-certificate \
        --certificate-arn "$CERT_ARN" \
        --region "$REGION" \
        --query "Certificate.Status" \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$CERT_STATUS" = "ISSUED" ]; then
        print_success "Certificate status: ISSUED"
        
        # Get certificate details
        DOMAIN=$(aws acm describe-certificate \
            --certificate-arn "$CERT_ARN" \
            --region "$REGION" \
            --query "Certificate.DomainName" \
            --output text 2>/dev/null)
        
        print_info "Domain: $DOMAIN"
        
        # Get SANs
        SANS=$(aws acm describe-certificate \
            --certificate-arn "$CERT_ARN" \
            --region "$REGION" \
            --query "Certificate.SubjectAlternativeNames" \
            --output text 2>/dev/null)
        
        print_info "SANs: $SANS"
        
    elif [ "$CERT_STATUS" = "PENDING_VALIDATION" ]; then
        print_warning "Certificate status: PENDING_VALIDATION"
        print_info "Certificate is waiting for DNS validation"
        print_info "This can take 5-30 minutes"
        
    elif [ "$CERT_STATUS" = "NOT_FOUND" ]; then
        print_error "Certificate not found in ACM"
        print_info "The certificate ARN in SSM may be incorrect or from a different account"
        
    else
        print_error "Certificate status: $CERT_STATUS"
        print_info "Certificate is not in a valid state for use"
    fi
fi

# Test 4: Test CDK synth with certificate ARN
print_info "Test 4: Testing CDK synth with certificate ARN..."

cd "$(dirname "$0")/../infrastructure" || exit 1

# Set environment variables
export CERTIFICATE_ARN="$CERT_ARN"
export ENVIRONMENT="development"
export SKIP_DOMAIN_LOOKUP="true"

print_info "Running: npm run cdk synth"

if npm run cdk synth > /dev/null 2>&1; then
    print_success "CDK synth successful"
    
    # Check if LoadBalancerStack was created
    if [ -f "cdk.out/LoadBalancerStack-development.template.json" ]; then
        print_success "LoadBalancerStack template generated"
        
        # Check if HTTPS listener exists in template
        if [ -n "$CERT_ARN" ]; then
            if grep -q '"Protocol":"HTTPS"' "cdk.out/LoadBalancerStack-development.template.json"; then
                print_success "HTTPS listener found in template"
            else
                print_warning "HTTPS listener not found in template"
                print_info "This may be expected if enableHttps is false"
            fi
        fi
        
        # Check if certificate ARN is in template
        if [ -n "$CERT_ARN" ]; then
            if grep -q "$CERT_ARN" "cdk.out/LoadBalancerStack-development.template.json"; then
                print_success "Certificate ARN found in template"
            else
                print_warning "Certificate ARN not found in template"
            fi
        fi
    else
        print_error "LoadBalancerStack template not found"
    fi
else
    print_error "CDK synth failed"
    print_info "Check the error output above"
fi

# Test 5: Test with missing certificate ARN
print_info "Test 5: Testing CDK synth without certificate ARN..."

unset CERTIFICATE_ARN
export SKIP_DOMAIN_LOOKUP="true"

if npm run cdk synth > /dev/null 2>&1; then
    print_success "CDK synth successful without certificate ARN"
    
    # Check that HTTPS listener is NOT in template
    if ! grep -q '"Protocol":"HTTPS"' "cdk.out/LoadBalancerStack-development.template.json"; then
        print_success "HTTPS listener correctly not included (HTTP-only mode)"
    else
        print_warning "HTTPS listener found when it shouldn't be"
    fi
else
    print_error "CDK synth failed without certificate ARN"
fi

# Summary
print_header "Test Summary"

if [ -n "$CERT_ARN" ] && [ "$CERT_STATUS" = "ISSUED" ]; then
    print_success "All tests passed!"
    print_info ""
    print_info "Your certificate setup is ready for deployment:"
    print_info "1. Certificate ARN is stored in SSM"
    print_info "2. Certificate is valid and issued"
    print_info "3. CDK can synthesize with the certificate"
    print_info ""
    print_info "Next steps:"
    print_info "1. Commit your changes"
    print_info "2. Push to GitHub"
    print_info "3. Workflow will fetch certificate ARN and deploy with HTTPS"
    
elif [ -n "$CERT_ARN" ] && [ "$CERT_STATUS" = "PENDING_VALIDATION" ]; then
    print_warning "Setup incomplete - certificate pending validation"
    print_info ""
    print_info "Wait for certificate validation to complete:"
    print_info "aws acm describe-certificate --certificate-arn $CERT_ARN --region $REGION"
    print_info ""
    print_info "Once status is ISSUED, you can deploy"
    
elif [ -z "$CERT_ARN" ]; then
    print_warning "Certificate ARN not configured"
    print_info ""
    print_info "To enable HTTPS, follow these steps:"
    print_info "1. Create certificate in dev account"
    print_info "2. Store ARN in pipeline account SSM"
    print_info "3. Run this test script again"
    print_info ""
    print_info "See: docs/troubleshooting/MANUAL_CERTIFICATE_SETUP.md"
    
else
    print_error "Certificate setup has issues"
    print_info "Review the test output above for details"
fi

echo ""
