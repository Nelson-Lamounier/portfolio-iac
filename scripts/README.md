<!-- @format -->

# Deployment Scripts

Scripts used by GitHub Actions workflows and Makefile for deployment operations.

## Folder Structure

```
scripts/
├── aws/                    # AWS infrastructure scripts
│   ├── check-infrastructure.sh
│   ├── fetch-aws-accounts.sh
│   ├── fetch-ecr-uri.sh
│   ├── recover-stack.sh
│   └── verify-cdk-bootstrap.sh
├── deploy/                 # Deployment scripts
│   ├── dev-with-monitoring.sh
│   └── lb-local.sh
├── docker/                 # Docker build scripts
│   ├── build-push.sh
│   └── cleanup-buildcache.sh
├── monitoring/             # Monitoring configuration scripts
│   ├── generate-grafana-datasources.sh
│   ├── generate-prometheus-config.sh
│   ├── setup-multi-account.sh
│   ├── test-setup.sh
│   └── update-prometheus-config.sh
└── setup/                  # Initial setup scripts
    ├── domain-parameters.sh
    └── ecr.sh
```

## Scripts by Category

### AWS Scripts (`scripts/aws/`)

| Script                    | Purpose                              | Used By             |
| ------------------------- | ------------------------------------ | ------------------- |
| `check-infrastructure.sh` | Check if infrastructure exists       | Makefile            |
| `fetch-aws-accounts.sh`   | Fetch AWS account IDs                | Makefile, Workflows |
| `fetch-ecr-uri.sh`        | Fetch ECR repository URI             | Makefile, Workflows |
| `recover-stack.sh`        | Recover failed CloudFormation stacks | Makefile, Workflows |
| `verify-cdk-bootstrap.sh` | Verify CDK bootstrap                 | Makefile, Workflows |

### Deploy Scripts (`scripts/deploy/`)

| Script                   | Purpose                    | Used By  |
| ------------------------ | -------------------------- | -------- |
| `dev-with-monitoring.sh` | Deploy dev with monitoring | Makefile |
| `lb-local.sh`            | Local LB deployment        | Makefile |

### Docker Scripts (`scripts/docker/`)

| Script                  | Purpose                     | Used By  |
| ----------------------- | --------------------------- | -------- |
| `build-push.sh`         | Build and push Docker image | Makefile |
| `cleanup-buildcache.sh` | Clean ECR buildcache tags   | Makefile |

### Monitoring Scripts (`scripts/monitoring/`)

| Script                            | Purpose                        | Used By  |
| --------------------------------- | ------------------------------ | -------- |
| `generate-grafana-datasources.sh` | Generate Grafana config        | Makefile |
| `generate-prometheus-config.sh`   | Generate Prometheus config     | Makefile |
| `setup-multi-account.sh`          | Setup multi-account monitoring | Makefile |
| `test-setup.sh`                   | Test monitoring E2E            | Makefile |
| `update-prometheus-config.sh`     | Update Prometheus config       | Makefile |

### Setup Scripts (`scripts/setup/`)

| Script                 | Purpose                     | Used By  |
| ---------------------- | --------------------------- | -------- |
| `domain-parameters.sh` | Setup domain SSM parameters | Makefile |
| `ecr.sh`               | Manual ECR repository setup | Manual   |

## Common Patterns

### Error Handling

All scripts use:

```bash
set -euo pipefail
```

### Required Variables

Scripts validate required environment variables:

```bash
: "${ENVIRONMENT:?ENVIRONMENT must be set}"
```

### GitHub Actions Integration

Scripts detect GitHub Actions and adapt output:

```bash
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "key=value" >> "${GITHUB_OUTPUT}"
fi
```

## Testing Locally

```bash
# Configure AWS
aws configure

# Set environment
export ENVIRONMENT=development
export AWS_REGION=eu-west-1

# Test scripts
./scripts/aws/check-infrastructure.sh
./scripts/aws/fetch-ecr-uri.sh
```

## Troubleshooting

### Permission Denied

```bash
chmod +x scripts/**/*.sh
```

### Variable Not Set

```bash
export ENVIRONMENT=development
export AWS_REGION=eu-west-1
```

### Parameter Not Found

```bash
aws ssm get-parameter --name "/ecr/development/repository-uri"
```
