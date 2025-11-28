<!-- @format -->

# Phase 1: CI/CD Pipeline Implementation

Production-ready CI/CD pipeline for AWS infrastructure deployment using GitHub Actions and AWS CDK.

**Phase Status:** Complete  
**View Code at This Phase:** [v1.0-cicd-pipeline](https://github.com/Nelson-Lamounier/portfolio-iac/tree/v1.0-cicd-pipeline)

---

## Overview

This phase establishes the foundation for automated infrastructure deployment with a focus on CI/CD best practices, security, and multi-account AWS architecture.

## What Was Built

### CI/CD Pipelines

**CI Workflow** (`.github/workflows/ci.yml`)

- Automated testing on every push and PR
- TypeScript type checking
- Security vulnerability scanning
- CDK diff preview in PR comments
- 100% test coverage enforcement

**Deploy Workflow** (`.github/workflows/deploy.yml`)

- Automatic deployment to development on merge
- Manual deployment to staging/production
- Bootstrap verification before deployment
- SSM parameter validation
- Approval gates for production

### Infrastructure

**ECR Repository**

- Container image registry
- Automated vulnerability scanning
- Lifecycle policies for cost optimization
- Immutable image tags for security

**SSM Parameter Store Integration**

- Centralized configuration management
- Automatic service discovery
- Cross-pipeline parameter sharing

### Security Implementation

- OIDC authentication (no long-lived credentials)
- Cross-account IAM roles
- Secrets masking in logs
- Dependabot for automated security updates
- Image scanning on push

## Architecture

```
GitHub Repository
    │
    ├── Push to develop
    │   └── CI Workflow
    │       ├── Tests
    │       ├── Type Check
    │       └── Security Scan
    │
    ├── PR to main
    │   └── CI Workflow + CDK Diff
    │       └── Posts infrastructure changes as PR comment
    │
    └── Merge to main
        └── Deploy Workflow
            ├── Bootstrap Verification
            ├── CDK Deploy
            └── SSM Parameter Creation
                    │
                    ▼
            AWS Development Account
                    │
            (Manual Trigger)
                    │
            ├── Staging Account
            └── Production Account (requires approval)
```

## Technical Stack

- **IaC:** AWS CDK (TypeScript)
- **CI/CD:** GitHub Actions
- **Cloud:** AWS (Multi-account)
- **Testing:** Jest (100% coverage)
- **Security:** OIDC, SSM Parameter Store
- **Package Manager:** Yarn 4

## Key Features Demonstrated

### DevOps Practices

- Two-branch workflow (develop → main)
- Automated testing and deployment
- Infrastructure as Code
- GitOps principles

### AWS Architecture

- Multi-account strategy
- Cross-account IAM roles
- OIDC federation with GitHub
- SSM for configuration management

### Security

- No hardcoded credentials
- Automated vulnerability scanning
- Immutable infrastructure
- Audit trails via CloudTrail

## Files Structure

```
.github/
├── workflows/
│   ├── ci.yml              # CI pipeline
│   └── deploy.yml          # Deployment pipeline
├── dependabot.yml          # Automated dependency updates

lib/
├── constructs/
│   └── ecr-construct.ts    # Reusable ECR construct
├── stacks/
│   └── ecr-stack.ts        # ECR stack with SSM integration
└── index.ts                # Public exports

config/
└── environments.ts         # Environment configuration

test/
├── constructs/
│   └── ecr-construct.test.ts
└── stacks/
    └── ecr-stack.test.ts

bin/
└── app.ts                  # CDK app entry point
```

## Test Results

```
Test Suites: 2 passed, 2 total
Tests:       18 passed, 18 total
Snapshots:   2 passed, 2 total
Coverage:    100%
```

## Setup Requirements

1. AWS accounts (pipeline, dev, staging, prod)
2. GitHub repository with Actions enabled
3. OIDC provider configured in AWS
4. SSM parameters for account IDs
5. CDK bootstrap in all accounts

## Skills Demonstrated

- GitHub Actions workflow design
- AWS CDK with TypeScript
- Multi-account AWS architecture
- OIDC authentication setup
- Automated testing strategies
- Security best practices
- Professional documentation

---

## Next Phase

**Phase 2: Container Orchestration**

- ECS Fargate cluster
- Application Load Balancer
- Auto-scaling policies
- CloudWatch monitoring

---

**Author:** Nelson Lamounier  
**Date:** November 2024  
**Repository:** [portfolio-iac](https://github.com/Nelson-Lamounier/portfolio-iac)
