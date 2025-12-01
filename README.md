<!-- @format -->

# Portfolio Monorepo

**A production-ready personal portfolio application with automated AWS infrastructure deployment**

[![CI](https://github.com/Nelson-Lamounier/portfolio-monorepo/workflows/CI/badge.svg)](https://github.com/Nelson-Lamounier/portfolio-monorepo/actions)
[![Deploy](https://github.com/Nelson-Lamounier/portfolio-monorepo/workflows/Deploy/badge.svg)](https://github.com/Nelson-Lamounier/portfolio-monorepo/actions)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Development](#development)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [CI/CD Pipeline](#cicd-pipeline)
- [Documentation](#documentation)

---

## 🎯 Overview

This monorepo contains a complete personal portfolio application with two main components:

1. **Frontend** - Modern Next.js 15 portfolio website with MDX blog support
2. **Infrastructure** - AWS CDK TypeScript infrastructure for automated deployments

### What Makes This Special

- **Monorepo Architecture** - Unified codebase for frontend and infrastructure
- **Type-Safe Infrastructure** - AWS CDK with TypeScript for infrastructure as code
- **Modern Frontend** - Next.js 15 with React 19, Tailwind CSS 4, and MDX
- **Automated CI/CD** - GitHub Actions with multi-environment deployments
- **Production-Ready** - Comprehensive testing, security scanning, and monitoring
- **Multi-Account AWS** - Separate accounts for dev, staging, and production

### Key Features

✅ **Frontend**

- Server-side rendering with Next.js 15
- MDX-powered blog with syntax highlighting
- Dark mode support
- Responsive design with Tailwind CSS 4
- 248 comprehensive tests with Jest
- Docker containerization

✅ **Infrastructure**

- AWS CDK for infrastructure as code
- ECR for container registry
- Multi-environment support (dev/staging/prod)
- Automated deployments via GitHub Actions
- Cross-account IAM roles with OIDC
- 100% test coverage

✅ **DevOps**

- Automated CI/CD pipelines
- Path-based workflow triggers
- CDK diff preview in pull requests
- Automated dependency updates
- Security scanning and vulnerability detection

---

## 🏗️ Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│                  (Monorepo with Workspaces)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ├─── frontend/          (Next.js App)
                     │    └─ Dockerfile
                     │
                     └─── infrastructure/    (AWS CDK)
                          └─ ECR Stack

                     ↓ (GitHub Actions)

┌─────────────────────────────────────────────────────────────┐
│                    Pipeline Account (AWS)                    │
│                  GitHub Actions OIDC Role                    │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Development  │ │   Staging    │ │ Production   │
│              │ │              │ │              │
│ ECR Registry │ │ ECR Registry │ │ ECR Registry │
│ Docker Image │ │ Docker Image │ │ Docker Image │
│              │ │              │ │              │
│ (Future:     │ │ (Future:     │ │ (Future:     │
│  ECS/Fargate)│ │  ECS/Fargate)│ │  ECS/Fargate)│
└──────────────┘ └──────────────┘ └──────────────┘
```

### Deployment Flow

```
1. Developer pushes code to develop branch
   ↓
2. CI runs tests for changed workspaces
   ↓
3. Developer creates PR to main
   ↓
4. CI runs CDK diff (shows infrastructure changes)
   ↓
5. PR merged to main
   ↓
6. Frontend: Build Docker image → Push to ECR
   ↓
7. Infrastructure: Deploy CDK stacks
   ↓
8. Application deployed to development environment
```

### Monorepo Structure

This project uses **Yarn Workspaces** to manage multiple packages in a single repository:

- **Root** - Workspace configuration and shared scripts
- **frontend/** - Next.js application (independent package)
- **infrastructure/** - AWS CDK infrastructure (independent package)

**Benefits:**

- Single `yarn install` for all dependencies
- Shared tooling and configuration
- Atomic commits across frontend and infrastructure
- Simplified CI/CD pipelines

---

## 🛠️ Technology Stack

### Frontend

| Technology       | Version | Purpose                     |
| ---------------- | ------- | --------------------------- |
| **Next.js**      | 15.x    | React framework with SSR    |
| **React**        | 19.x    | UI library                  |
| **TypeScript**   | 5.8.x   | Type-safe JavaScript        |
| **Tailwind CSS** | 4.1.x   | Utility-first CSS framework |
| **MDX**          | 3.1.x   | Markdown with JSX for blog  |
| **Headless UI**  | 2.2.x   | Accessible UI components    |
| **Jest**         | 30.x    | Testing framework           |
| **Docker**       | -       | Containerization            |

### Infrastructure

| Technology       | Version | Purpose                       |
| ---------------- | ------- | ----------------------------- |
| **AWS CDK**      | 2.150.x | Infrastructure as code        |
| **TypeScript**   | 5.3.x   | Type-safe infrastructure      |
| **Jest**         | 29.x    | Testing framework             |
| **AWS Services** | -       | ECR, IAM, SSM Parameter Store |

### DevOps

| Tool               | Purpose                         |
| ------------------ | ------------------------------- |
| **GitHub Actions** | CI/CD automation                |
| **Yarn 4**         | Package manager with workspaces |
| **ESLint**         | Code linting                    |
| **Prettier**       | Code formatting                 |
| **Dependabot**     | Automated dependency updates    |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 22+** - [Download](https://nodejs.org/)
- **Yarn 4** - Enabled via Corepack (included with Node.js)
- **Docker** - [Download](https://www.docker.com/) (for local testing)
- **AWS CLI** - [Install Guide](https://aws.amazon.com/cli/) (for infrastructure)
- **AWS CDK CLI** - `npm install -g aws-cdk` (for infrastructure)

### Quick Start

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd portfolio-monorepo
   ```

2. **Enable Corepack** (for Yarn 4)

   ```bash
   corepack enable
   ```

3. **Install dependencies**

   ```bash
   yarn install
   ```

   This installs dependencies for all workspaces (frontend + infrastructure).

4. **Start development**

   ```bash
   # Start frontend development server
   yarn frontend:dev

   # Open http://localhost:3000
   ```

---

## 💻 Development

### Frontend Development

```bash
# Start development server
yarn frontend:dev

# Run tests
yarn workspace frontend test

# Run tests in watch mode
yarn workspace frontend test:watch

# Run linter
yarn workspace frontend lint

# Build for production
yarn workspace frontend build

# Start production server
yarn workspace frontend start
```

### Infrastructure Development

```bash
# Build infrastructure code
yarn workspace infrastructure build

# Run tests
yarn workspace infrastructure test

# Run tests with coverage
yarn workspace infrastructure test:coverage

# Synthesize CloudFormation template
yarn infra:synth

# Preview infrastructure changes
ENVIRONMENT=development yarn workspace infrastructure cdk diff

# Deploy to development
ENVIRONMENT=development yarn infra:deploy
```

### Local Load Balancer Testing

Test the Application Load Balancer locally before production deployment:

```bash
# 1. Login to AWS SSO (required first)
aws sso login --profile github-actions

# 2. Quick HTTP-only deployment (fastest)
make deploy-lb-http ENV=development

# 3. Full deployment with HTTPS (requires domain)
make deploy-lb-local ENV=development

# 4. Test the load balancer
curl -I http://<ALB-DNS-NAME>

# 5. Clean up after testing
make delete-stacks ENV=development
```

**Note:** Scripts use the `github-actions` AWS profile (same permissions as CI/CD).

See [docs/LOCAL_LB_TESTING.md](docs/LOCAL_LB_TESTING.md) for detailed testing guide and [docs/AWS_PROFILE_SETUP.md](docs/AWS_PROFILE_SETUP.md) for profile configuration.

### Working with Docker

```bash
# Build Docker image locally
cd frontend
docker build -t portfolio:local .

# Run container
docker run -p 3000:3000 portfolio:local

# Test multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t portfolio:test .
```

### Environment Variables

#### Frontend (.env.local)

Create `frontend/.env.local` for local development:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

#### Infrastructure (.env)

Create `infrastructure/.env` for local CDK operations:

```bash
# AWS Account IDs
AWS_ACCOUNT_ID_DEV=123456789012
AWS_ACCOUNT_ID_STAGING=234567890123
AWS_ACCOUNT_ID_PROD=345678901234
AWS_PIPELINE_ACCOUNT_ID=456789012345

# AWS Region
AWS_REGION=eu-west-1

# Environment (development, staging, production)
ENVIRONMENT=development
```

**⚠️ Important:** Never commit `.env` or `.env.local` files to version control!

---

## 📦 Deployment

### Deployment Environments

| Environment     | Branch | Trigger   | Approval | Purpose                    |
| --------------- | ------ | --------- | -------- | -------------------------- |
| **Development** | `main` | Automatic | No       | Active development testing |
| **Staging**     | `main` | Manual    | No       | Pre-production validation  |
| **Production**  | `main` | Manual    | Yes      | Live environment           |

### Automatic Deployment

Push to `main` branch automatically deploys to development:

```bash
git checkout main
git merge develop
git push origin main
```

GitHub Actions will:

1. Run all tests
2. Build frontend Docker image
3. Push image to ECR
4. Deploy infrastructure with CDK
5. Update development environment

### Manual Deployment

Deploy to staging or production via GitHub Actions:

1. Go to **Actions** tab in GitHub
2. Select **Deploy** workflow
3. Click **Run workflow**
4. Choose environment (staging/production)
5. Click **Run workflow**
6. For production, approve when prompted

### Deployment via CLI

```bash
# Install GitHub CLI
brew install gh

# Deploy to staging
gh workflow run deploy.yml -f environment=staging

# Deploy to production (requires approval)
gh workflow run deploy.yml -f environment=production
```

### First-Time Setup

Before deploying, you need to:

1. **Bootstrap AWS accounts** - See [infrastructure/docs/BOOTSTRAP.md](infrastructure/docs/BOOTSTRAP.md)
2. **Configure GitHub secrets** - Add `AWS_OIDC_ROLE` to repository secrets
3. **Configure AWS Parameter Store** - Store account IDs in SSM
4. **Set up GitHub Environments** - Configure protection rules

Detailed setup instructions: [infrastructure/README.md](infrastructure/README.md)

---

## 📁 Project Structure

```
portfolio-monorepo/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # CI validation workflow
│   │   └── deploy.yml                # Deployment workflow
│   └── dependabot.yml                # Dependency updates config
│
├── frontend/                         # Next.js Application
│   ├── src/
│   │   ├── app/                      # Next.js 15 app directory
│   │   │   ├── (main)/               # Main layout group
│   │   │   ├── blog/                 # Blog pages
│   │   │   ├── layout.tsx            # Root layout
│   │   │   └── page.tsx              # Home page
│   │   ├── components/               # React components
│   │   │   ├── ui/                   # UI components
│   │   │   └── ...
│   │   └── lib/                      # Utilities and helpers
│   ├── public/                       # Static assets
│   ├── __tests__/                    # Jest tests (248 tests)
│   ├── Dockerfile                    # Multi-stage Docker build
│   ├── next.config.mjs               # Next.js configuration
│   ├── tailwind.config.ts            # Tailwind CSS config
│   ├── jest.config.ts                # Jest configuration
│   ├── package.json                  # Frontend dependencies
│   └── README.md                     # Frontend documentation
│
├── infrastructure/                   # AWS CDK Infrastructure
│   ├── bin/
│   │   └── app.ts                    # CDK app entry point
│   ├── lib/
│   │   ├── constructs/
│   │   │   └── ecr-construct.ts      # Reusable ECR construct
│   │   ├── stacks/
│   │   │   └── ecr-stack.ts          # ECR stack definition
│   │   └── index.ts                  # Public exports
│   ├── config/
│   │   └── environments.ts           # Environment configurations
│   ├── test/                         # Jest tests (18 tests, 100% coverage)
│   ├── docs/                         # Infrastructure documentation
│   ├── cdk.json                      # CDK configuration
│   ├── package.json                  # Infrastructure dependencies
│   └── README.md                     # Infrastructure documentation
│
├── docs/                             # Project documentation
│   ├── MONOREPO_MIGRATION.md         # Migration documentation
│   └── WORKFLOW_INTEGRATION.md       # CI/CD integration guide
│
├── .gitignore                        # Root gitignore
├── .yarnrc.yml                       # Yarn 4 configuration
├── package.json                      # Workspace root configuration
└── README.md                         # This file
```

### Workspace Organization

The monorepo is organized into two independent workspaces:

**Frontend Workspace** (`frontend/`)

- Complete Next.js application
- Independent package.json and dependencies
- Own test suite and configuration
- Dockerfile for containerization

**Infrastructure Workspace** (`infrastructure/`)

- Complete AWS CDK application
- Independent package.json and dependencies
- Own test suite and configuration
- CDK stacks and constructs

**Root Workspace**

- Workspace configuration
- Shared scripts for convenience
- CI/CD workflows
- Project-wide documentation

---

## 🧪 Testing

### Frontend Tests

The frontend has **248 comprehensive tests** covering:

- Component rendering
- User interactions
- Routing and navigation
- MDX blog functionality
- Utility functions
- Integration tests

```bash
# Run all frontend tests
yarn workspace frontend test

# Run with coverage
yarn workspace frontend test --coverage

# Watch mode
yarn workspace frontend test:watch

# Update snapshots
yarn workspace frontend test -u
```

**Test Coverage:**

- Components: Comprehensive coverage
- Pages: All routes tested
- Utilities: 100% coverage
- Integration: Key user flows

### Infrastructure Tests

The infrastructure has **18 tests with 100% coverage** covering:

- Stack synthesis
- Resource creation
- IAM policies
- Tagging
- Snapshot tests

```bash
# Run all infrastructure tests
yarn workspace infrastructure test

# Run with coverage
yarn workspace infrastructure test:coverage

# Watch mode
yarn workspace infrastructure test:watch

# Update snapshots
yarn workspace infrastructure test:update
```

**Test Coverage:**

- Constructs: 100%
- Stacks: 100%
- Configurations: 100%

### Running All Tests

```bash
# Run tests in all workspaces
yarn workspaces foreach run test

# Run with coverage
yarn workspaces foreach run test --coverage
```

---

## 🔄 CI/CD Pipeline

### Workflow Overview

This monorepo uses **path-based workflow triggers** to run only relevant jobs:

```
┌─────────────────────────────────────────────────────────────┐
│ Push to develop or PR to main                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Detect Changes (path filters)                               │
│   - frontend/**  → frontend changed                         │
│   - infrastructure/** → infrastructure changed              │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Frontend CI  │ │Infrastructure│ │   CDK Diff   │
│              │ │      CI      │ │  (PRs only)  │
│ - Lint       │ │ - Build      │ │              │
│ - Test (248) │ │ - Test (18)  │ │ - Synth      │
│ - Build      │ │ - Type check │ │ - Diff       │
│ - Docker     │ │ - Audit      │ │ - PR comment │
└──────────────┘ └──────────────┘ └──────────────┘
```

### CI Workflow

**Triggers:**

- Pull requests to `main` or `develop`
- Pushes to `develop`

**Jobs:**

1. **detect-changes** - Determines which workspaces changed
2. **frontend-ci** - Runs if frontend changed (lint, test, build, Docker validation)
3. **infrastructure-ci** - Runs if infrastructure changed (build, test, type check)
4. **cdk-diff** - Runs on PRs if infrastructure changed (shows infrastructure changes)

### Deploy Workflow

**Triggers:**

- Push to `main` → Auto-deploy to development
- Push to `develop` → Auto-deploy to development
- Manual trigger → Choose environment

**Jobs:**

1. **detect-changes** - Determines what needs deployment
2. **build-frontend** - Builds and pushes Docker image to ECR
3. **deploy-infrastructure** - Deploys CDK stacks with new image

### Branching Strategy

This project uses a **two-branch strategy**:

- **`develop`** - Active development, CI validates every push
- **`main`** - Production-ready code, triggers deployments

**Workflow:**

```bash
# Daily development
git checkout develop
git pull origin develop
# ... make changes ...
git add . && git commit -m "feat: add feature"
git push origin develop  # CI validates

# When ready to deploy
# Create PR: develop → main
# Review CDK diff in PR comments
# Merge → Auto-deploys to development
```

**Benefits:**

- ✅ Simple to understand and follow
- ✅ Clear separation between development and production-ready code
- ✅ All changes reviewed before deployment
- ✅ Automated testing at every stage

---

## 📚 Documentation

### Project Documentation

- **[MONOREPO_MIGRATION.md](docs/MONOREPO_MIGRATION.md)** - How we migrated to monorepo
- **[WORKFLOW_INTEGRATION.md](docs/WORKFLOW_INTEGRATION.md)** - CI/CD integration details
- **[PHASE1_CICD.md](PHASE1_CICD.md)** - Phase 1 implementation guide

### Frontend Documentation

- **[frontend/README.md](frontend/README.md)** - Frontend-specific documentation
- **[frontend/docs/](frontend/docs/)** - Additional frontend guides

### Infrastructure Documentation

- **[infrastructure/README.md](infrastructure/README.md)** - Complete infrastructure guide
- **[infrastructure/docs/BOOTSTRAP.md](infrastructure/docs/BOOTSTRAP.md)** - AWS account setup
- **[infrastructure/docs/CROSS_ACCOUNT_SETUP.md](infrastructure/docs/CROSS_ACCOUNT_SETUP.md)** - Multi-account configuration
- **[infrastructure/docs/SECURITY.md](infrastructure/docs/SECURITY.md)** - Security best practices
- **[infrastructure/docs/SSM_PARAMETERS.md](infrastructure/docs/SSM_PARAMETERS.md)** - Parameter Store usage

---

## 🔐 Security

### Security Features

- **No Long-Lived Credentials** - OIDC authentication for GitHub Actions
- **Secrets Management** - AWS Parameter Store for configuration
- **Image Scanning** - Automatic vulnerability scanning in ECR
- **Least Privilege IAM** - Minimal required permissions
- **Encrypted Storage** - ECR images encrypted at rest
- **Audit Logging** - CloudTrail logs all AWS API calls

### Security Best Practices

1. **Never commit secrets** - Use `.env` files (gitignored)
2. **Use OIDC** - No AWS access keys in GitHub
3. **Rotate credentials** - Regular rotation of any credentials
4. **Review dependencies** - Dependabot alerts for vulnerabilities
5. **Scan images** - ECR scans on push
6. **Least privilege** - Minimal IAM permissions

---

## 🤝 Contributing

### Development Workflow

1. **Create a branch from develop**

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature
   ```

2. **Make your changes**
   - Write code
   - Add tests
   - Update documentation

3. **Test locally**

   ```bash
   yarn workspace frontend test
   yarn workspace infrastructure test
   ```

4. **Commit and push**

   ```bash
   git add .
   git commit -m "feat: add your feature"
   git push origin feature/your-feature
   ```

5. **Create pull request**
   - Target: `develop` branch
   - Wait for CI to pass
   - Review CDK diff (if infrastructure changed)
   - Get code review

6. **Merge to develop**
   - CI validates again
   - Ready for deployment

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix bug
docs: update documentation
test: add tests
chore: update dependencies
refactor: refactor code
style: format code
```

---

## 📈 Roadmap

### Phase 1: CI/CD Pipeline ✅ (Complete)

- [x] GitHub Actions workflows
- [x] Multi-environment deployments
- [x] ECR container registry
- [x] Automated testing
- [x] Security scanning

### Phase 2: Container Orchestration (In Progress)

- [ ] ECS Fargate service
- [ ] Application Load Balancer
- [ ] Auto-scaling policies
- [ ] CloudWatch monitoring
- [ ] Custom domain with Route 53

### Phase 3: Data Layer (Planned)

- [ ] DynamoDB for data persistence
- [ ] S3 for file storage
- [ ] CloudFront CDN
- [ ] Lambda functions for API
- [ ] API Gateway

### Phase 4: Observability (Planned)

- [ ] CloudWatch dashboards
- [ ] X-Ray tracing
- [ ] Grafana integration
- [ ] Automated alerts
- [ ] Performance monitoring

---

## 📝 License

This project uses:

- **Frontend Template**: [Tailwind Plus License](https://tailwindcss.com/plus/license) (Commercial)
- **Infrastructure Code**: MIT License (Custom code)

---

## 🙋 Support

### Getting Help

- **Issues**: [GitHub Issues](https://github.com/Nelson-Lamounier/portfolio-monorepo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Nelson-Lamounier/portfolio-monorepo/discussions)
- **Documentation**: See [docs/](docs/) directory

### Common Issues

#### Stack Management

- **Stack stuck in rollback**: `make fix-rollback ENV=development`
- **Cannot delete export error**: `make delete-stacks ENV=development`
- **Fresh start needed**: `make delete-stacks ENV=development && make cdk-deploy ENV=development`

See [docs/STACK_RECOVERY_QUICK_REFERENCE.md](docs/STACK_RECOVERY_QUICK_REFERENCE.md) for quick solutions.

#### Detailed Guides

- [Stack Management Guide](docs/STACK_MANAGEMENT_GUIDE.md) - Complete troubleshooting guide
- [SSM Parameter Configuration](docs/SSM_PARAMETER_CONFIGURATION.md) - Parameter Store setup
- [Domain Setup Guide](docs/DOMAIN_SETUP_GUIDE.md) - HTTPS configuration

---

## 👨‍💻 Author

**Nelson Lamounier**

- Portfolio: [Your Portfolio URL]
- GitHub: [@Nelson-Lamounier](https://github.com/Nelson-Lamounier)
- LinkedIn: [Your LinkedIn]

---

## 🌟 Acknowledgments

- **Tailwind Plus** - Frontend template
- **AWS CDK** - Infrastructure as code framework
- **Next.js** - React framework
- **Vercel** - Next.js creators

---

**Built with ❤️ using Next.js, AWS CDK, and TypeScript**
