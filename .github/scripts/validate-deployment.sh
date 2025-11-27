#!/bin/bash
set -e

echo "🔍 Validating Deployment Configuration..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Check Node.js version
echo "Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -eq 22 ]; then
    check_pass "Node.js version 22 detected"
else
    check_warn "Node.js version $NODE_VERSION detected, expected 22"
fi
echo ""

# 2. Check Yarn version
echo "Checking Yarn version..."
if command -v yarn &> /dev/null; then
    YARN_VERSION=$(yarn --version)
    check_pass "Yarn $YARN_VERSION installed"
else
    check_fail "Yarn not found"
fi
echo ""

# 3. Check dependencies
echo "Checking dependencies..."
if [ -f "yarn.lock" ]; then
    check_pass "yarn.lock exists"
else
    check_fail "yarn.lock not found"
fi

if [ -d "node_modules" ]; then
    check_pass "node_modules directory exists"
else
    check_warn "node_modules not found, run 'yarn install'"
fi
echo ""

# 4. Run linter
echo "Running ESLint..."
if yarn lint; then
    check_pass "Linting passed"
else
    check_fail "Linting failed"
fi
echo ""

# 5. Run tests
echo "Running tests..."
if yarn test --ci --passWithNoTests; then
    check_pass "All tests passed"
else
    check_fail "Tests failed"
fi
echo ""

# 6. Build application
echo "Building Next.js application..."
if yarn build; then
    check_pass "Build successful"
else
    check_fail "Build failed"
fi
echo ""

# 7. Check for standalone output
echo "Checking standalone output..."
if [ -f ".next/standalone/server.js" ]; then
    check_pass "Standalone server.js exists"
else
    check_fail "Standalone output not found - check next.config.mjs"
fi
echo ""

# 8. Check Dockerfile
echo "Checking Dockerfile..."
if [ -f "Dockerfile" ]; then
    check_pass "Dockerfile exists"
    
    # Check for multi-stage build
    if grep -q "FROM.*AS base" Dockerfile; then
        check_pass "Multi-stage build configured"
    else
        check_warn "Multi-stage build not detected"
    fi
    
    # Check for non-root user
    if grep -q "USER nextjs" Dockerfile; then
        check_pass "Non-root user configured"
    else
        check_warn "Non-root user not configured"
    fi
    
    # Check for health check
    if grep -q "HEALTHCHECK" Dockerfile; then
        check_pass "Health check configured"
    else
        check_warn "Health check not configured"
    fi
else
    check_fail "Dockerfile not found"
fi
echo ""

# 9. Check workflow files
echo "Checking GitHub Actions workflows..."
if [ -f ".github/workflows/ci.yml" ]; then
    check_pass "CI workflow exists"
else
    check_fail "CI workflow not found"
fi

if [ -f ".github/workflows/deploy.yml" ]; then
    check_pass "Deploy workflow exists"
    
    # Check for OIDC permissions
    if grep -q "id-token: write" .github/workflows/deploy.yml; then
        check_pass "OIDC permissions configured"
    else
        check_fail "OIDC permissions not configured"
    fi
    
    # Check for test job
    if grep -q "needs: test" .github/workflows/deploy.yml; then
        check_pass "Test gate configured"
    else
        check_fail "Test gate not configured"
    fi
else
    check_fail "Deploy workflow not found"
fi
echo ""

# 10. Check health endpoint
echo "Checking health endpoint..."
if [ -f "src/app/api/health/route.ts" ]; then
    check_pass "Health endpoint exists"
else
    check_warn "Health endpoint not found"
fi
echo ""

# 11. Check documentation
echo "Checking documentation..."
DOCS_COUNT=0
[ -f "docs/DEPLOYMENT_SETUP.md" ] && ((DOCS_COUNT++))
[ -f "docs/DEPLOYMENT_CHECKLIST.md" ] && ((DOCS_COUNT++))
[ -f "docs/PRODUCTION_READY_SUMMARY.md" ] && ((DOCS_COUNT++))

if [ $DOCS_COUNT -eq 3 ]; then
    check_pass "All deployment documentation exists"
else
    check_warn "Some deployment documentation missing ($DOCS_COUNT/3)"
fi
echo ""

# 12. Test Docker build (optional, can be slow)
if [ "${SKIP_DOCKER:-false}" != "true" ]; then
    echo "Testing Docker build..."
    if docker build -t portfolio:validation-test . > /dev/null 2>&1; then
        check_pass "Docker build successful"
        
        # Clean up
        docker rmi portfolio:validation-test > /dev/null 2>&1 || true
    else
        check_fail "Docker build failed"
    fi
    echo ""
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ Validation Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "1. Set up AWS ECR repository"
echo "2. Configure OIDC provider in AWS"
echo "3. Create IAM role with ECR permissions"
echo "4. Add AWS_ROLE_ARN secret to GitHub"
echo "5. Update AWS_REGION and ECR_REPOSITORY in deploy.yml"
echo "6. Push to main branch to trigger deployment"
echo ""
echo "See docs/DEPLOYMENT_SETUP.md for detailed instructions"
