<!-- @format -->

# AWS CDK Infrastructure as Code

Production-ready AWS infrastructure using CDK with automated CI/CD pipelines for multi-account deployments.

---

## Project Phases

This project is developed in phases, each demonstrating different aspects of cloud infrastructure and DevOps.

| Phase       | Focus                   | Status   | Link                                                                                   |
| ----------- | ----------------------- | -------- | -------------------------------------------------------------------------------------- |
| **Phase 1** | CI/CD Pipeline          | Complete | [View Code](https://github.com/Nelson-Lamounier/portfolio-iac/tree/v1.0-cicd-pipeline) |
| **Phase 2** | Container Orchestration | Planned  | Coming Soon                                                                            |
| **Phase 3** | Data Layer              | Planned  | Coming Soon                                                                            |

### Phase 1: CI/CD Pipeline (Current)

Automated deployment pipelines with GitHub Actions, multi-account AWS setup, and security best practices.

**Highlights:**

- GitHub Actions CI/CD workflows
- OIDC authentication (no long-lived credentials)
- Multi-environment deployment (dev/staging/prod)
- Automated testing with 100% coverage
- CDK diff preview in PR comments

[View Phase 1 Documentation](PHASE1_CICD.md)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [CI/CD Pipeline](#cicd-pipeline)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)

## Overview

This project demonstrates production-ready AWS infrastructure management using modern DevOps practices. Built as a portfolio piece to showcase CI/CD pipeline expertise, infrastructure as code, and AWS multi-account architecture.

### 🎓 Skills Demonstrated

**DevOps & CI/CD:**

- GitHub Actions workflows with OIDC authentication
- Multi-environment deployment pipelines (dev/staging/prod)
- Automated testing and security scanning
- Infrastructure drift detection with CDK diff
- Concurrency control and deployment gates

**AWS Architecture:**

- Multi-account strategy with cross-account IAM roles
- Infrastructure as Code using AWS CDK (TypeScript)
- SSM Parameter Store for configuration management
- ECR with vulnerability scanning and lifecycle policies
- Automated bootstrap verification

**Security & Best Practices:**

- No long-lived credentials (OIDC only)
- Secrets masking and secure parameter storage
- Immutable infrastructure patterns
- Comprehensive test coverage (100%)
- Production approval gates

### Key Features

- **Multi-Account Strategy**: Separate AWS accounts for dev, staging, and production
- **Automated CI/CD**: GitHub Actions workflows for testing and deployment
- **Infrastructure as Code**: Type-safe infrastructure using AWS CDK
- **Security First**: Image scanning, immutable tags, cross-account access controls
- **Cost Optimized**: Lifecycle policies, resource tagging, efficient deployments

### Current Infrastructure

- **ECR Repository**: Container image registry with vulnerability scanning and lifecycle management
  - Automatically stores repository information in SSM Parameter Store
  - Enables dynamic discovery by other pipelines (frontend, backend, etc.)
  - See [docs/SSM_PARAMETERS.md](docs/SSM_PARAMETERS.md) for usage examples

## 🏗️ Architecture

### Multi-Account Setup

<!--
TODO: Add architecture diagram image here
Suggested: Create a diagram showing the multi-account setup
Tool recommendations: draw.io, Lucidchart, or AWS Architecture Icons
Save as: .github/assets/architecture.png
Then uncomment: ![Architecture Diagram](.github/assets/architecture.png)
-->

```
┌─────────────────────────────────────────────────────────────┐
│ GitHub Repository                                            │
│   └─ GitHub Actions (OIDC Authentication)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Pipeline Account (CI/CD)                                     │
│   └─ github-actions-workflow-role                           │
│      └─ Assumes roles in target accounts                    │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Development  │ │   Staging    │ │ Production   │
│   Account    │ │   Account    │ │   Account    │
│              │ │              │ │              │
│ - ECR Stack  │ │ - ECR Stack  │ │ - ECR Stack  │
│ - ECS (soon) │ │ - ECS (soon) │ │ - ECS (soon) │
└──────────────┘ └──────────────┘ └──────────────┘
```

### Security Model

- **OIDC Authentication**: No long-lived credentials, GitHub Actions authenticates via OIDC
- **Cross-Account Roles**: Pipeline account assumes deployment roles in target accounts
- **Least Privilege**: Each role has minimal required permissions
- **Immutable Infrastructure**: No manual changes, all via CDK deployments

## 🔄 CI/CD Pipeline

### Pipeline Overview

```
develop branch → CI Validation → PR to main → Review → Merge → Auto-Deploy
```

### Branching Strategy: Two-Branch Workflow

This project uses a **Two-Branch Strategy** (also known as Simplified Git Flow or Trunk-Based Development Lite), which balances simplicity with safety for infrastructure deployments.

**Why this strategy?**

Infrastructure as Code requires careful change management. This strategy provides:

- **Safety**: All changes reviewed before reaching production-ready `main` branch
- **Simplicity**: Only two branches to manage, reducing cognitive overhead
- **Automation**: Clear trigger points for CI/CD pipelines
- **Flexibility**: Easy to understand and adapt for small to medium teams

**How it works:**

- `develop`: Active development happens here, CI validates every push
- `main`: Production-ready code only, triggers automatic deployment to development environment

This approach is ideal for infrastructure projects where changes need validation but you want to avoid the complexity of full Git Flow with multiple long-lived branches.

### Workflow Files

#### 1. CI Workflow (`.github/workflows/ci.yml`)

**Purpose**: Validate code quality and preview infrastructure changes

**Triggers**:

- Pull requests to `main` or `develop`
- Pushes to `develop` branch

**Jobs**:

**Job 1: lint-and-build**

```yaml
Steps:
1. Checkout code
2. Setup Node.js 22
3. Install dependencies
4. Build TypeScript
5. Type check
6. Run tests with coverage
7. Upload coverage to Codecov
```

**Job 2: cdk-diff** (PRs only)

```yaml
Steps:
1. Build project
2. Authenticate to AWS
3. Fetch account IDs from Parameter Store
4. Run CDK synth
5. Run CDK diff (preview changes)
6. Post diff as PR comment
```

**What it does NOT do**: Deploy to AWS (read-only operations)

#### 2. Deploy Workflow (`.github/workflows/deploy.yml`)

**Purpose**: Deploy infrastructure to AWS environments

**Triggers**:

- Push to `main` branch → Auto-deploys to development
- Manual trigger → Choose environment (dev/staging/prod)

**Jobs**:

**Job: deploy**

```yaml
Steps:
1. Checkout code
2. Setup Node.js 22
3. Install dependencies
4. Build TypeScript
5. Authenticate to AWS
6. Fetch environment-specific parameters
7. Run CDK synth
8. Run CDK deploy (creates/updates resources)
```

**Protection**:

- Uses GitHub Environments for approval gates
- Production requires manual approval
- Concurrency control prevents simultaneous deployments

### Pipeline Flow Diagram

<!--
TODO: Add CI/CD pipeline screenshot here
Suggested: Screenshot of successful GitHub Actions run
Save as: .github/assets/pipeline-success.png
Then uncomment: ![CI/CD Pipeline](.github/assets/pipeline-success.png)
-->

```
┌─────────────────────────────────────────────────────────────┐
│ Two-Branch Workflow                                          │
└─────────────────────────────────────────────────────────────┘

1. Work on develop branch
   ├─ git checkout develop
   ├─ git pull origin develop
   └─ Make changes (CDK code, tests, docs)

2. Push to develop
   ├─ git push origin develop
   └─ CI Workflow Triggers
      ├─ ✓ Build & Test
      ├─ ✓ Type Check
      └─ ✓ Build validation

3. Create Pull Request (develop → main)
   ├─ Open PR on GitHub
   └─ CI Workflow Triggers
      ├─ ✓ Build & Test
      ├─ ✓ Type Check
      └─ ✓ CDK Diff (shows infrastructure changes)

4. Review & Approve
   ├─ Review CDK diff in PR comments
   ├─ Verify infrastructure changes
   └─ Approve PR (if team policy)

5. Merge to main
   └─ Deploy Workflow Triggers
      └─ Automatic deployment to Development environment

6. Promote to higher environments (when ready)
   ├─ Manually trigger deploy workflow
   ├─ Select staging → Deploy (no approval needed)
   └─ Select production → Requires approval → Deploy

┌─────────────────────────────────────────────────────────────┐
│ Automated Gates                                              │
└─────────────────────────────────────────────────────────────┘

✓ All tests must pass on develop
✓ Type checking must succeed
✓ CDK diff must be reviewed before merge
✓ Code review approval (team policy)
✓ Production deployments require manual approval
```

## 🚀 Getting Started

### Prerequisites

- **Node.js 22+**: Runtime for CDK and TypeScript
- **Yarn 4.0.2**: Package manager (via Corepack)
- **AWS CLI**: Configured with appropriate profiles
- **AWS CDK CLI**: `npm install -g aws-cdk`
- **AWS Accounts**: Separate accounts for pipeline, dev, staging, prod

### Initial Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd <repository-name>
   ```

2. **Enable Corepack** (for Yarn 4)

   ```bash
   corepack enable
   ```

3. **Install dependencies**

   ```bash
   yarn install
   ```

4. **Configure environment variables**

   Create a `.env` file (for local development only):

   ```bash
   # AWS Account IDs
   AWS_ACCOUNT_ID_DEV=123456789012
   AWS_ACCOUNT_ID_STAGING=234567890123
   AWS_ACCOUNT_ID_PROD=345678901234
   AWS_PIPELINE_ACCOUNT_ID=456789012345

   # AWS Region
   AWS_REGION=eu-west-1
   ```

   **Note**: Never commit `.env` to source control!

5. **Bootstrap AWS accounts**

   Bootstrap each target account with cross-account trust using AWS SSO profiles.

   **Prerequisites:**

   - AWS CLI configured with SSO profiles for each account
   - Administrator or sufficient permissions in each account

   **Bootstrap commands:**

   ```bash
   # Bootstrap development account
   cdk bootstrap aws://123456789012/eu-west-1 \
     --profile dev-sso \
     --trust 456789012345 \
     --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess

   # Bootstrap staging account
   cdk bootstrap aws://234567890123/eu-west-1 \
     --profile staging-sso \
     --trust 456789012345 \
     --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess

   # Bootstrap production account
   cdk bootstrap aws://345678901234/eu-west-1 \
     --profile prod-sso \
     --trust 456789012345 \
     --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
   ```

   Replace:

   - Account IDs with your actual AWS account IDs
   - `456789012345` with your pipeline account ID
   - Profile names with your SSO profile names
   - Region if different from `eu-west-1`

   **What this does:**

   - Creates CDK toolkit stack (S3, ECR, IAM roles)
   - Configures trust relationship with pipeline account
   - Enables cross-account deployments from CI/CD

   See [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md) for detailed instructions.

6. **Configure GitHub Secrets**

   In your GitHub repository settings, add:

   - `AWS_OIDC_ROLE`: ARN of the GitHub Actions role in pipeline account

   In GitHub Variables, add:

   - `AWS_REGION`: Your AWS region (e.g., `eu-west-1`)

7. **Configure AWS Parameter Store**

   Store account IDs in AWS Systems Manager Parameter Store in your **pipeline account**.

   **Why use SSM Parameter Store?**

   ✅ **Centralized configuration** - Single source of truth for account IDs  
   ✅ **No hardcoded values** - Account IDs not stored in GitHub Secrets or code  
   ✅ **IAM-controlled access** - Only authorized roles can read parameters  
   ✅ **Audit trail** - CloudTrail logs all parameter access  
   ✅ **Version history** - Track changes to parameter values  
   ✅ **AWS best practice** - Recommended for configuration management

   This approach is superior to GitHub Secrets because:

   - Parameters are managed in AWS (closer to resources)
   - No need to update GitHub Secrets when accounts change
   - Supports multiple CI/CD tools (not locked to GitHub)
   - Better separation of concerns (AWS config in AWS)

   **Create parameters:**

   ```bash
   # Use your pipeline account SSO profile
   aws ssm put-parameter \
     --name "/github-actions/accounts/dev" \
     --value "123456789012" \
     --type "String" \
     --profile pipeline-sso

   aws ssm put-parameter \
     --name "/github-actions/accounts/test" \
     --value "234567890123" \
     --type "String" \
     --profile pipeline-sso

   aws ssm put-parameter \
     --name "/github-actions/accounts/prod" \
     --value "345678901234" \
     --type "String" \
     --profile pipeline-sso

   aws ssm put-parameter \
     --name "/github-actions/accounts/pipeline" \
     --value "456789012345" \
     --type "String" \
     --profile pipeline-sso
   ```

   **Note**: These parameters are stored in the pipeline account and accessed by GitHub Actions during deployments.

## 📦 Deployment

### Local Deployment

```bash
# Build the project
yarn build

# Synthesize CloudFormation template
ENVIRONMENT=development yarn cdk synth

# Preview changes
ENVIRONMENT=development yarn cdk diff

# Deploy to development
ENVIRONMENT=development yarn cdk deploy

# Deploy to production
ENVIRONMENT=production yarn cdk deploy
```

### CI/CD Deployment

#### Automatic Deployment

1. Merge to `main` branch
2. Deploy workflow automatically deploys to development

#### Manual Deployment

1. Go to GitHub Actions tab
2. Select "Deploy" workflow
3. Click "Run workflow"
4. Choose environment (development/staging/production)
5. Click "Run workflow"
6. For production, approve the deployment when prompted

### Deployment Environments

| Environment | Trigger                 | Approval Required | Purpose                |
| ----------- | ----------------------- | ----------------- | ---------------------- |
| Development | Auto on merge to `main` | No                | Active development     |
| Staging     | Manual                  | No                | Pre-production testing |
| Production  | Manual                  | Yes               | Live environment       |

## 📁 Project Structure

```
.
├── .github/
│   └── workflows/
│       ├── ci.yml              # CI validation workflow
│       └── deploy.yml          # Deployment workflow
│
├── bin/
│   └── app.ts                  # CDK app entry point
│
├── lib/
│   ├── constructs/
│   │   └── ecr-construct.ts    # Reusable ECR construct
│   ├── stacks/
│   │   └── ecr-stack.ts        # ECR stack definition
│   └── index.ts                # Public API exports
│
├── config/
│   └── environments.ts         # Environment configurations
│
├── test/
│   ├── constructs/
│   │   └── ecr-construct.test.ts
│   └── stacks/
│       └── ecr-stack.test.ts
│
├── scripts/
│   └── diagnose-permissions.sh # Permission diagnostic tool
│
├── docs/
│   ├── BOOTSTRAP.md            # Bootstrap guide
│   ├── CROSS_ACCOUNT_SETUP.md  # Cross-account setup
│   └── SECURITY.md             # Security guidelines
│
├── cdk.json                    # CDK configuration
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── jest.config.js              # Test configuration
```

## 🔧 Development Workflow

### Two-Branch Strategy in Action

This project follows a **Two-Branch Strategy** (Simplified Git Flow / Trunk-Based Development Lite) for safe, streamlined infrastructure deployments.

**The Strategy:**

- **`develop`** → Active development, experimentation, and iteration
- **`main`** → Production-ready code, triggers deployments

**Why we chose this:**
Infrastructure changes carry risk. This strategy provides a safety gate (PR review + CDK diff) before changes reach the deployment-ready `main` branch, while avoiding the complexity of managing multiple feature branches or release branches. It's ideal for small to medium teams managing infrastructure as code.

### Daily Development Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Work on develop branch                                   │
└─────────────────────────────────────────────────────────────┘

git checkout develop
git pull origin develop

# Make your changes
# - Edit CDK code
# - Add/update tests
# - Update documentation

# Validate locally
yarn test                              # Run tests
yarn tsc --noEmit                      # Type check
yarn build                             # Build
ENVIRONMENT=development yarn cdk diff  # Preview changes

# Commit and push
git add .
git commit -m "feat: add ECS stack"
git push origin develop

┌─────────────────────────────────────────────────────────────┐
│ 2. CI validates automatically                               │
└─────────────────────────────────────────────────────────────┘

✓ Tests run
✓ TypeScript type checking
✓ Build validation
✓ Fix any issues and push again

┌─────────────────────────────────────────────────────────────┐
│ 3. Create PR when ready for deployment                      │
└─────────────────────────────────────────────────────────────┘

# On GitHub: Create PR from develop → main
# CI automatically runs CDK diff
# Review infrastructure changes in PR comments
# Discuss with team if needed

┌─────────────────────────────────────────────────────────────┐
│ 4. Merge triggers automatic deployment                      │
└─────────────────────────────────────────────────────────────┘

# Merge PR to main
# Deploy workflow automatically deploys to development
# Monitor in GitHub Actions tab

┌─────────────────────────────────────────────────────────────┐
│ 5. Promote to staging/production (when ready)               │
└─────────────────────────────────────────────────────────────┘

# GitHub Actions → Deploy workflow → Run workflow
# Select environment (staging or production)
# Production requires manual approval
```

### Quick Reference

```bash
# Daily workflow
git checkout develop
git pull origin develop
# ... make changes ...
yarn test && yarn build
git add . && git commit -m "feat: your change"
git push origin develop

# Create PR on GitHub: develop → main
# Review CDK diff, merge when ready
# Deployment happens automatically
```

### Merge Checklist

Before merging `develop` → `main`:

✅ **Required:**

- [ ] All CI checks pass (tests, type checking, build)
- [ ] CDK diff reviewed and understood
- [ ] Changes tested locally
- [ ] Documentation updated (if needed)

✅ **Recommended:**

- [ ] Code review completed (team policy)
- [ ] Breaking changes documented
- [ ] Rollback plan considered

❌ **Never merge when:**

- Tests are failing
- Breaking changes without migration plan
- Incomplete features (unless behind feature flag)
- Untested infrastructure changes

## 🧪 Testing

### Test Structure

```typescript
// Unit tests for constructs
test/constructs/ecr-construct.test.ts

// Integration tests for stacks
test/stacks/ecr-stack.test.ts

// Snapshot tests for CloudFormation templates
test/**/__snapshots__/*.snap
```

### Running Tests

```bash
# All tests
yarn test

# Watch mode
yarn test:watch

# Coverage report
yarn test:coverage

# Update snapshots
yarn test -u
```

### Test Coverage

Current coverage: 100% (18/18 tests passing)

## 🤖 Automated Dependency Updates

### Dependabot Configuration

This project uses **Dependabot** (`.github/dependabot.yml`) for automated dependency management:

**What it does:**

- Monitors `package.json` for outdated dependencies
- Checks for security vulnerabilities (CVEs)
- Automatically creates PRs with updates
- Monitors GitHub Actions versions

**How it works:**

1. Runs weekly (every Monday at 9 AM)
2. Creates PRs for outdated packages
3. Groups related updates (e.g., all AWS CDK packages together)
4. Your CI automatically tests the updates
5. You review and merge (or close) the PR

**Benefits:**

- ✅ Automatic security vulnerability alerts
- ✅ Keeps dependencies up-to-date
- ✅ Reduces manual maintenance work
- ✅ CI tests updates before you merge

**Note:** Even though this project uses Yarn, Dependabot uses `package-ecosystem: "npm"` because it reads `package.json` (works with Yarn, npm, pnpm).

## 🔍 Troubleshooting

### Common Issues

#### 1. "User is not authorized to perform: sts:AssumeRole"

**Problem**: Cross-account trust not configured

**Solution**:

```bash
# Re-bootstrap with trust using your SSO profile
cdk bootstrap aws://TARGET_ACCOUNT_ID/REGION \
  --profile your-sso-profile \
  --trust PIPELINE_ACCOUNT_ID \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess

# Run diagnostic to check permissions
./scripts/diagnose-permissions.sh
```

See [docs/CROSS_ACCOUNT_SETUP.md](docs/CROSS_ACCOUNT_SETUP.md)

#### 2. "Parameter not found" in GitHub Actions

**Problem**: AWS Parameter Store parameters missing

**Solution**: Create parameters in AWS SSM:

```bash
aws ssm put-parameter \
  --name "/github-actions/accounts/dev" \
  --value "YOUR_ACCOUNT_ID" \
  --type "String"
```

#### 3. Yarn version mismatch

**Problem**: Project uses Yarn 4.0.2 but system has Yarn 1.x

**Solution**:

```bash
corepack enable
```

#### 4. CDK diff shows no changes but resources exist

**Problem**: Stack drift or manual changes

**Solution**:

```bash
# Import existing resources or recreate stack
cdk deploy --force
```

### Debug Commands

```bash
# Check CDK version
cdk --version

# List all stacks
cdk list

# Show CloudFormation template
cdk synth

# Validate CDK app
cdk doctor

# Check AWS credentials
aws sts get-caller-identity
```

## 📚 Additional Documentation

- [Bootstrap Guide](docs/BOOTSTRAP.md) - Detailed CDK bootstrap instructions
- [Cross-Account Setup](docs/CROSS_ACCOUNT_SETUP.md) - Multi-account configuration
- [Security Guidelines](docs/SECURITY.md) - Security best practices
- [Security Audit Report](docs/SECURITY_AUDIT.md) - Comprehensive security analysis
- [Production Checklist](docs/PRODUCTION_CHECKLIST.md) - Pre-deployment checklist
- [SSM Parameters Usage](docs/SSM_PARAMETERS.md) - How to use ECR repository info in other pipelines
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) - Common issues and solutions

## 🛠️ Available Scripts

```bash
# Build
yarn build              # Compile TypeScript
yarn watch              # Watch mode compilation

# Testing
yarn test               # Run all tests
yarn test:watch         # Watch mode
yarn test:coverage      # With coverage report

# CDK Commands
yarn cdk synth          # Synthesize CloudFormation
yarn cdk diff           # Preview changes
yarn cdk deploy         # Deploy stack
yarn cdk destroy        # Delete stack

# Utilities
yarn tsc --noEmit       # Type check without compilation
```

## 🔐 Security Considerations

### Secrets Management

- **Never commit** `.env` files or credentials
- Use **AWS Parameter Store** for account IDs (centralized, auditable, IAM-controlled)
- Use **GitHub Secrets** for OIDC role ARN only
- Use **OIDC** instead of long-lived credentials

**Why SSM Parameter Store for Account IDs?**

This project stores AWS account IDs in SSM Parameter Store rather than GitHub Secrets, following AWS best practices:

1. **Centralized Management**: Single source of truth in AWS, not scattered across CI/CD tools
2. **IAM Access Control**: Fine-grained permissions on who can read parameters
3. **Audit Trail**: CloudTrail logs every parameter access for compliance
4. **Version History**: Track changes to account IDs over time
5. **Multi-Tool Support**: Works with any CI/CD tool, not locked to GitHub
6. **Separation of Concerns**: AWS configuration managed in AWS, not in GitHub

**Security Model:**

```
GitHub Actions (OIDC) → Pipeline Account → Read SSM Parameters → Deploy to Target Accounts
```

This approach is more secure and maintainable than storing account IDs in GitHub Secrets.

### IAM Best Practices

- **Least privilege**: Roles have minimal required permissions
- **Cross-account roles**: Separate pipeline and target accounts
- **MFA for production**: Require MFA for production deployments
- **Audit logging**: CloudTrail enabled for all accounts

### Infrastructure Security

- **Image scanning**: Automatic vulnerability scanning on push
- **Immutable tags**: Prevents tag overwrites
- **Encryption**: Enable encryption at rest (future enhancement)
- **Network isolation**: VPC with private subnets (future enhancement)

## 🚦 CI/CD Best Practices

### Branch Strategy

This project uses a **simplified Git Flow** strategy with two main branches:

```
develop (active development)
   ↓
   ↓ (merge when ready)
   ↓
main (production-ready)
   ↓
   ↓ (auto-deploy)
   ↓
AWS Development Environment
```

**Branch Roles:**

- **`develop`**: Active development branch
  - All development work happens here
  - CI runs on every push (tests, type checking)
  - CDK diff runs on PRs to `main`
- **`main`**: Production-ready code
  - Only receives merges from `develop`
  - Automatically deploys to development environment
  - Source for manual deployments to staging/production

**Workflow:**

1. Make changes on `develop` branch
2. Push to `develop` → CI validates (tests, build)
3. Create PR from `develop` to `main`
4. Review CDK diff in PR comments
5. Merge to `main` → Auto-deploys to development
6. Manually promote to staging/production when ready

**Why this strategy?**

✅ **Simple**: Only two branches to manage  
✅ **Clear separation**: Development vs production-ready code  
✅ **Safe**: All changes reviewed before reaching `main`  
✅ **Flexible**: Can hotfix directly on `main` if needed  
✅ **DevOps-friendly**: Aligns with continuous delivery principles

**Alternative strategies considered:**

- **Trunk-Based Development**: Single `main` branch (too risky for infrastructure)
- **Git Flow**: Multiple branches (feature/release/hotfix) - overkill for small teams
- **GitHub Flow**: Feature branches to `main` - works but less organized for infrastructure

### Deployment Strategy

| Environment | Trigger   | Source          | Approval                 |
| ----------- | --------- | --------------- | ------------------------ |
| Development | Automatic | Merge to `main` | No                       |
| Staging     | Manual    | `main` branch   | No                       |
| Production  | Manual    | `main` branch   | Yes (GitHub Environment) |

**Deployment Flow:**

```
develop → main → Development (auto)
              ↓
              → Staging (manual)
              ↓
              → Production (manual + approval)
```

### Rollback Strategy

**Option 1: Revert commit**

```bash
# Revert the problematic commit
git revert <commit-hash>
git push origin main

# Automatic deployment will roll back
```

**Option 2: Redeploy previous version**

```bash
# Checkout previous working commit
git checkout <previous-commit>

# Deploy manually
ENVIRONMENT=production cdk deploy

# Return to main
git checkout main
```

**Option 3: Emergency hotfix**

```bash
# Make fix directly on main
git checkout main
git commit -m "hotfix: critical issue"
git push origin main

# Sync back to develop
git checkout develop
git merge main
```

## 📈 Future Enhancements

- [ ] ECS Fargate stack for container orchestration
- [ ] VPC stack with public/private subnets
- [ ] RDS/DynamoDB stacks for data persistence
- [ ] CloudWatch dashboards and alarms
- [ ] Application Load Balancer
- [ ] Auto-scaling policies
- [ ] Grafana for observability
- [ ] Multi-region deployments
- [ ] Blue/green deployments
- [ ] Automated rollback on failure

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Add tests
4. Update documentation
5. Create a pull request
6. Wait for CI to pass
7. Get code review approval
8. Merge to main

## 📝 For Recruiters & Hiring Managers

### What This Project Demonstrates

This infrastructure project showcases real-world DevOps and cloud engineering skills:

**1. CI/CD Pipeline Expertise**

- Designed and implemented GitHub Actions workflows
- Automated testing, building, and deployment
- Environment-specific deployment strategies
- Approval gates and concurrency control

**2. AWS Cloud Architecture**

- Multi-account AWS Organizations setup
- Cross-account IAM role assumption
- Infrastructure as Code with AWS CDK
- Security best practices (OIDC, SSM, image scanning)

**3. Infrastructure as Code**

- TypeScript-based AWS CDK
- Reusable constructs and stacks
- Comprehensive unit and integration tests
- Snapshot testing for infrastructure changes

**4. Security & Compliance**

- No hardcoded credentials or secrets
- OIDC authentication for GitHub Actions
- Automated security scanning
- Audit trails via CloudTrail and GitHub logs

**5. Documentation & Best Practices**

- Comprehensive README and guides
- Troubleshooting documentation
- Security audit reports
- Production readiness checklists

### Pipeline Highlights

**CI Pipeline** (`.github/workflows/ci.yml`):

- Runs on every PR and push to develop
- Automated testing with coverage reports
- TypeScript type checking
- CDK diff preview in PR comments
- Security vulnerability scanning

**Deploy Pipeline** (`.github/workflows/deploy.yml`):

- Automatic deployment to development on merge
- Manual deployment to staging/production
- Bootstrap verification before deployment
- SSM parameter validation
- Deployment verification steps

### Technical Stack

- **IaC:** AWS CDK (TypeScript)
- **CI/CD:** GitHub Actions
- **Cloud:** AWS (Multi-account)
- **Testing:** Jest with 100% coverage
- **Security:** OIDC, SSM Parameter Store, ECR scanning
- **Package Manager:** Yarn 4 with Corepack

### Project Evolution

This is a foundational infrastructure project. As the application grows, additional services will be added:

- ECS Fargate for container orchestration
- Application Load Balancer
- RDS/DynamoDB for data persistence
- CloudWatch dashboards and alarms
- VPC with public/private subnets

### Adding Visuals to This README

Want to make this README even more impressive? Consider adding:

- 📊 Architecture diagram (multi-account setup)
- 📸 CI/CD pipeline screenshots
- 🎥 Demo video walkthrough
- 📈 Test coverage reports

See `.github/VISUAL_GUIDE.md` for detailed instructions on adding images and videos.

### Contact

**Nelson Lamounier**  
[Your Email] | [LinkedIn] | [GitHub]

---

**Questions about this project?** Feel free to reach out or open an issue.
