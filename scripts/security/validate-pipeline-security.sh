#!/bin/bash

# Pipeline Security Validation Script
# This script validates security configurations before deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

# Helper functions
log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((CHECKS_PASSED++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((CHECKS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNINGS++))
}

log_info() {
    echo -e "ℹ️  $1"
}

# Security validation functions
check_secrets_in_code() {
    log_info "Checking for hardcoded secrets..."
    
    # Common secret patterns
    SECRET_PATTERNS=(
        "password\s*=\s*['\"][^'\"]{8,}"
        "secret\s*=\s*['\"][^'\"]{8,}"
        "key\s*=\s*['\"][^'\"]{8,}"
        "token\s*=\s*['\"][^'\"]{8,}"
        "AKIA[0-9A-Z]{16}"  # AWS Access Key
        "aws_secret_access_key"
    )
    
    SECRETS_FOUND=false
    
    for pattern in "${SECRET_PATTERNS[@]}"; do
        if grep -r -E "$pattern" --exclude-dir=".git" --exclude-dir="node_modules" --exclude="*.md" . 2>/dev/null; then
            SECRETS_FOUND=true
        fi
    done
    
    if [ "$SECRETS_FOUND" = true ]; then
        log_error "Potential secrets found in code"
    else
        log_success "No hardcoded secrets detected"
    fi
}

check_aws_account_ids() {
    log_info "Checking for hardcoded AWS account IDs..."
    
    # Look for 12-digit numbers that might be account IDs
    if grep -r -E "[^0-9][0-9]{12}[^0-9]" --exclude-dir=".git" --exclude-dir="node_modules" --exclude="*.md" --exclude="validate-pipeline-security.sh" . 2>/dev/null; then
        log_warning "Potential AWS account IDs found in code - ensure they're properly configured as variables"
    else
        log_success "No hardcoded AWS account IDs found"
    fi
}

check_github_secrets() {
    log_info "Validating GitHub Actions workflow security..."
    
    # Check if workflow uses proper secret references
    if grep -r "secrets\." .github/workflows/ 2>/dev/null | grep -v "add-mask" >/dev/null; then
        log_success "GitHub secrets properly referenced in workflows"
    else
        log_warning "No GitHub secrets found in workflows - ensure AWS_OIDC_ROLE is configured"
    fi
    
    # Check for proper masking
    if grep -r "add-mask" .github/workflows/ >/dev/null 2>&1; then
        log_success "Secret masking implemented in workflows"
    else
        log_error "No secret masking found in workflows"
    fi
}

check_permissions() {
    log_info "Checking GitHub Actions permissions..."
    
    # Check if minimal permissions are set
    if grep -A 5 "permissions:" .github/workflows/*.yml | grep -E "(id-token: write|contents: read)" >/dev/null; then
        log_success "Minimal permissions configured in workflows"
    else
        log_warning "Review GitHub Actions permissions - ensure minimal access"
    fi
}

check_environment_protection() {
    log_info "Checking environment protection..."
    
    # Check if environment is specified in jobs
    if grep -r "environment:" .github/workflows/ >/dev/null 2>&1; then
        log_success "Environment protection configured"
    else
        log_warning "No environment protection found - consider adding for production deployments"
    fi
}

check_input_validation() {
    log_info "Checking input validation..."
    
    # Check if workflow has input validation
    if grep -A 10 "workflow_dispatch:" .github/workflows/*.yml | grep -E "(type: choice|options:)" >/dev/null; then
        log_success "Input validation configured"
    else
        log_warning "Limited input validation found"
    fi
}

check_cdk_security() {
    log_info "Checking CDK security configurations..."
    
    # Check for CDK Nag usage
    if find infrastructure -name "*.ts" -exec grep -l "cdk-nag\|AwsSolutions" {} \; 2>/dev/null | head -1 >/dev/null; then
        log_success "CDK Nag security checks found"
    else
        log_warning "CDK Nag not detected - consider adding security rule validation"
    fi
    
    # Check for proper IAM configurations
    if find infrastructure -name "*.ts" -exec grep -l "PolicyDocument\|Role\|Policy" {} \; 2>/dev/null | head -1 >/dev/null; then
        log_success "IAM configurations found in CDK code"
    else
        log_warning "No IAM configurations detected"
    fi
}

check_dependencies() {
    log_info "Checking dependency security..."
    
    # Check if package.json exists and has security-related scripts
    if [ -f "package.json" ]; then
        if grep -E "(audit|security)" package.json >/dev/null 2>&1; then
            log_success "Security scripts found in package.json"
        else
            log_warning "No security scripts in package.json - consider adding 'npm audit'"
        fi
    fi
    
    # Check for yarn.lock or package-lock.json
    if [ -f "yarn.lock" ] || [ -f "package-lock.json" ]; then
        log_success "Dependency lock file found"
    else
        log_error "No dependency lock file found - this is a security risk"
    fi
}

# Main execution
main() {
    echo "🔒 Pipeline Security Validation"
    echo "=============================="
    echo ""
    
    check_secrets_in_code
    check_aws_account_ids
    check_github_secrets
    check_permissions
    check_environment_protection
    check_input_validation
    check_cdk_security
    check_dependencies
    
    echo ""
    echo "📊 Security Validation Summary"
    echo "=============================="
    echo -e "${GREEN}Checks Passed: $CHECKS_PASSED${NC}"
    echo -e "${RED}Checks Failed: $CHECKS_FAILED${NC}"
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
    echo ""
    
    if [ $CHECKS_FAILED -gt 0 ]; then
        echo -e "${RED}❌ Security validation failed. Please address the issues above.${NC}"
        exit 1
    elif [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Security validation passed with warnings. Review recommendations above.${NC}"
        exit 0
    else
        echo -e "${GREEN}✅ All security checks passed!${NC}"
        exit 0
    fi
}

# Run main function
main "$@"