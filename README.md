<!-- @format -->

# AWS CDK TypeScript Application

Multi-environment AWS CDK application with ECR service, managed by Yarn 4.

## Prerequisites

- Node.js 20+
- AWS CLI configured
- Yarn 4 (managed via Corepack)

## Setup

1. Install dependencies:

```bash
yarn install
```

2. Build the project:

```bash
yarn build
```

## Configuration

Set up your environment variables in GitHub Secrets:

- `AWS_ROLE_ARN` - OIDC role ARN for GitHub Actions
- `AWS_ACCOUNT_ID_DEV` - Development account ID
- `AWS_ACCOUNT_ID_STAGING` - Staging account ID
- `AWS_ACCOUNT_ID_PROD` - Production account ID
- `AWS_PIPELINE_ACCOUNT_ID` - Pipeline/shared services account ID

Set up GitHub Variables:

- `AWS_REGION` - AWS region (default: us-east-1)

## Deployment

### Local Deployment

```bash
export ENVIRONMENT=development
export AWS_ACCOUNT_ID_DEV=123456789012
export AWS_PIPELINE_ACCOUNT_ID=987654321098
yarn cdk deploy
```

### GitHub Actions

The workflow automatically deploys on push to main/develop branches using the development environment. Use workflow_dispatch to deploy to other environments.

## Project Structure

- `bin/` - CDK app entry point
- `lib/` - CDK stack definitions
- `config/` - Environment configurations
- `.github/workflows/` - GitHub Actions workflows
