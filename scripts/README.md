<!-- @format -->

# Deployment Scripts

This directory contains bash scripts used by GitHub Actions workflows and the Makefile for deployment operations.

## Scripts

### check-infrastructure.sh

Checks if infrastructure exists by verifying ECR parameter in SSM Parameter Store.

**Usage:**

```bash
export ENVIRONMENT=development
export AWS_REGION=eu-west-1
./scripts/check-infrastructure.sh
```

**Outputs:**

- `exists=true` or `exists=false` to `$GITHUB_OUTPUT` (or stdout if not in GitHub Actions)

### fetch-ecr-uri.sh

Fetches ECR repository URI from Parameter Store and parses components.

**Usage:**

```bash
export ENVIRONMENT=development
export AWS_REGION=eu-west-1
./scripts/fetch-ecr-uri.sh
```

**Outputs:**

- `repository-uri` - Full ECR repository URI
- `repository-name` - Repository name only
- `registry` - ECR registry URL
- `target-account` - AWS account ID

### fetch-aws-accounts.sh

Fetches AWS account IDs from Parameter Store based on environment.

**Usage:**

```bash
export ENVIRONMENT=development
./scripts/fetch-aws-accounts.sh
```

**Outputs (to `$GITHUB_ENV` or stdout):**

- `AWS_ACCOUNT_ID_DEV` / `AWS_ACCOUNT_ID_STAGING` / `AWS_ACCOUNT_ID_PROD`
- `AWS_PIPELINE_ACCOUNT_ID`
- `TARGET_ACCOUNT_ID`

### verify-cdk-bootstrap.sh

Verifies CDK bootstrap stack exists and is properly configured.

**Usage:**

```bash
export ENVIRONMENT=development
export AWS_REGION=eu-west-1
export TARGET_ACCOUNT_ID=123456789012
export AWS_PIPELINE_ACCOUNT_ID=987654321098
./scripts/verify-cdk-bootstrap.sh
```

**Exits:**

- `0` if bootstrap is valid
- `1` if bootstrap is missing or invalid

### docker-build-push.sh

Builds and pushes Docker image to ECR with multiple tags.

**Usage:**

```bash
export ECR_REPO_URI=123456789012.dkr.ecr.eu-west-1.amazonaws.com/my-repo
export IMAGE_TAG=abc123
export ENVIRONMENT=development
./scripts/docker-build-push.sh
```

**Tags created:**

- `${IMAGE_TAG}` - Specific version (e.g., git SHA)
- `latest` - Latest version
- `${ENVIRONMENT}-latest` - Latest for environment

## Common Patterns

### Error Handling

All scripts use:

```bash
set -euo pipefail
```

This ensures:

- `set -e` - Exit on error
- `set -u` - Exit on undefined variable
- `set -o pipefail` - Exit on pipe failure

### Required Variables

Scripts validate required environment variables:

```bash
: "${ENVIRONMENT:?ENVIRONMENT must be set}"
: "${AWS_REGION:?AWS_REGION must be set}"
```

### GitHub Actions Integration

Scripts detect GitHub Actions environment and adapt output:

```bash
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "key=value" >> "${GITHUB_OUTPUT}"
else
  echo "KEY=value"
fi
```

### Masking Sensitive Data

Scripts mask sensitive values in GitHub Actions:

```bash
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "::add-mask::${SENSITIVE_VALUE}"
fi
```

## Testing Locally

### Prerequisites

1. AWS CLI configured with credentials
2. Required environment variables set
3. Appropriate AWS permissions

### Example Test Session

```bash
# Configure AWS
aws configure

# Set environment variables
export ENVIRONMENT=development
export AWS_REGION=eu-west-1

# Test check infrastructure
./scripts/check-infrastructure.sh

# Test fetch ECR URI (requires infrastructure to exist)
./scripts/fetch-ecr-uri.sh

# Test fetch AWS accounts
./scripts/fetch-aws-accounts.sh

# Test verify CDK bootstrap (requires account IDs)
export TARGET_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_PIPELINE_ACCOUNT_ID=987654321098
./scripts/verify-cdk-bootstrap.sh
```

## Troubleshooting

### Permission Denied

Make scripts executable:

```bash
chmod +x scripts/*.sh
```

### Variable Not Set

Ensure all required environment variables are exported:

```bash
export ENVIRONMENT=development
export AWS_REGION=eu-west-1
```

### AWS Credentials

Configure AWS CLI:

```bash
aws configure
# or
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
```

### Parameter Not Found

Ensure infrastructure is deployed and parameters exist:

```bash
aws ssm get-parameter --name "/ecr/development/repository-uri"
```

## Integration

### Makefile

Scripts are called by Makefile targets:

```makefile
check-infra:
	@./scripts/check-infrastructure.sh
```

### GitHub Actions

Scripts are called by composite actions:

```yaml
- name: Check infrastructure
  shell: bash
  env:
    ENVIRONMENT: ${{ inputs.environment }}
    AWS_REGION: ${{ inputs.aws-region }}
  run: ./scripts/check-infrastructure.sh
```

### Direct Usage

Scripts can be called directly:

```bash
ENVIRONMENT=development AWS_REGION=eu-west-1 ./scripts/check-infrastructure.sh
```

## Best Practices

1. **Always validate inputs**: Check required environment variables
2. **Provide feedback**: Echo progress messages
3. **Handle errors**: Exit with appropriate codes
4. **Mask secrets**: Use `::add-mask::` in GitHub Actions
5. **Test locally**: Run scripts locally before committing
6. **Document changes**: Update this README when adding scripts

## Related Documentation

- [Makefile and Actions Guide](../docs/MAKEFILE_AND_ACTIONS.md)
- [Refactoring Summary](../docs/REFACTORING_SUMMARY.md)
- [Testing Workflows Locally](../docs/TESTING_WORKFLOWS_LOCALLY.md)
