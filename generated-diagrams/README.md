<!-- @format -->

# Architecture Diagrams

This directory contains auto-generated architecture diagrams for the Phase 2 monorepo CI/CD pipeline.

## Diagrams

### 1. CI Pipeline Architecture

**File:** `ci_pipeline_architecture.png`

Shows the continuous integration pipeline flow including:

- Path-based change detection
- Parallel execution of frontend and infrastructure CI
- CDK diff generation for pull requests
- Cross-account OIDC authentication
- SSM parameter fetching

**Use Case:** Understanding how CI validates changes before merge

---

### 2. Deployment Pipeline Architecture

**File:** `deployment_pipeline_architecture.png`

Shows the deployment pipeline flow including:

- Frontend Docker build and push to ECR
- Manual approval gates for infrastructure changes
- CDK deployment of all stacks
- Cross-account deployment mechanism
- ECS service updates

**Use Case:** Understanding how code gets deployed to AWS

---

### 3. Cross-Account Authentication Flow

**File:** `cross_account_auth_flow.png`

Shows the secure authentication mechanism including:

- OIDC provider configuration
- GitHub Actions JWT token exchange
- Role assumption flow
- Pipeline account vs target account separation
- CloudTrail audit logging

**Use Case:** Understanding security and authentication architecture

---

### 4. Monorepo Complete Flow

**File:** `monorepo_complete_flow.png`

Shows the end-to-end developer workflow including:

- Developer commit to PR creation
- CI validation and feedback
- Merge to main branch
- Deployment trigger and execution
- Caching layers integration
- AWS infrastructure deployment

**Use Case:** High-level overview of the entire CI/CD process

---

### 5. Caching Strategy

**File:** `caching_strategy.png`

Shows the multi-layer caching architecture including:

- Yarn dependency caching
- Turborepo build output caching
- Docker layer caching
- Performance metrics and improvements
- Cache hit/miss flows

**Use Case:** Understanding performance optimizations

---

## Regenerating Diagrams

These diagrams are generated using the AWS Diagram MCP server with the Python `diagrams` library.

To regenerate:

```bash
# Install dependencies (if needed)
pip install diagrams

# Regenerate all diagrams
# (Use the MCP tool or run the Python code directly)
```

## Usage in Documentation

These diagrams are referenced in:

- `PHASE2_MONOREPO_PIPELINE.md` - Main Phase 2 documentation
- Presentations and portfolio showcases
- Interview preparation materials

## Diagram Format

- **Format:** PNG
- **Direction:** LR (Left-to-Right) or TB (Top-to-Bottom)
- **Icons:** Official AWS service icons
- **Style:** Professional, clean, color-coded

---

**Generated:** November 30, 2024  
**Tool:** AWS Diagram MCP Server  
**Library:** Python diagrams package
