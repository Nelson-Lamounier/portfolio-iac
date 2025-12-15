<!-- @format -->

# Enhanced Workflow Dispatch Implementation

## Overview

Successfully implemented intelligent job selection capabilities for the deploy pipeline, allowing for selective job execution, re-running failed jobs from previous runs, and advanced workflow control.

## New Workflow Dispatch Inputs

### 1. `jobs_to_run` (String)

**Description**: "Jobs to run (comma-separated or 'all' or 'failed')"
**Default**: "all"
**Examples**:

- `"all"` - Run all jobs (default behavior)
- `"security,lint,build"` - Run only security, lint, and build jobs
- `"deploy"` - Run all deployment-related jobs (auto-includes dependencies)
- `"networking,efs"` - Run networking and EFS deployment jobs
- `"health"` - Run health checks (auto-includes dependencies)

### 2. `rerun_failed_from` (String)

**Description**: "Run ID to re-run failed jobs from (leave empty for normal run)"
**Default**: ""
**Usage**: Provide a GitHub Actions run ID to automatically re-run only the jobs that failed in that run

### 3. Enhanced `stack` (Choice)

**Description**: "Stack to deploy"
**Options**: networking, monitoring-efs, monitoring-infra, monitoring-services, vpc-peering, destroy-all
**Behavior**: Now works in conjunction with job selection for more granular control

### 4. `skip_validation` (Boolean)

**Description**: "Skip pre-deployment validation"
**Default**: false
**Behavior**: Preserved from original implementation

## New Job: `determine-jobs`

### Purpose

Intelligently determines which jobs should run based on:

- Manual job selection via `jobs_to_run` input
- Failed job detection from previous runs via `rerun_failed_from`
- Stack-specific requirements
- Automatic dependency resolution

### Outputs

The job provides boolean outputs for each pipeline job:

- `run_security_scan`
- `run_lint`
- `run_build`
- `run_validate_setup`
- `run_deploy_networking`
- `run_deploy_efs`
- `run_deploy_peering`
- `run_deploy_infra`
- `run_deploy_services`
- `run_health_checks`
- `run_destroy_all`
- `run_rollback`

### Logic Flow

#### 1. Re-run Failed Jobs Mode

When `rerun_failed_from` is provided:

1. Uses GitHub CLI to query the specified run ID
2. Identifies jobs with `conclusion == "failure"`
3. Enables only failed jobs for re-execution
4. Automatically includes dependencies for deployment jobs
5. Provides detailed logging of failed jobs found

#### 2. Selective Job Mode

When `jobs_to_run` contains specific job names:

1. Parses comma-separated job list (case-insensitive)
2. Enables matching jobs based on keywords:
   - `security` → Security validation
   - `lint` → Lint & quality checks
   - `build` → Build infrastructure
   - `validate/setup` → Validate & setup
   - `networking` → Deploy networking
   - `efs` → Deploy EFS
   - `peering/vpc` → Deploy VPC peering
   - `infra` → Deploy infrastructure
   - `services` → Deploy services
   - `health` → Health checks
   - `destroy` → Destroy all stacks
   - `rollback` → Rollback operations
3. Auto-enables dependencies for deployment jobs

#### 3. Default Mode

When `jobs_to_run` is "all" or empty:

- Enables all standard deployment jobs
- Excludes destroy and rollback jobs (manual only)

#### 4. Stack-Specific Logic

- `destroy-all` stack automatically enables destroy job and disables deployment jobs
- Other stacks work with job selection for granular control

## Enhanced Job Conditionals

### Pattern

Each job now includes:

```yaml
needs: [determine-jobs, ...other-dependencies...]
if: |
  always() &&
  needs.determine-jobs.outputs.run_[job_name] == 'true' &&
  (dependency conditions with 'skipped' support)
```

### Key Features

1. **Dependency Awareness**: Jobs check if dependencies succeeded OR were skipped
2. **Always Evaluation**: Uses `always()` to evaluate even when dependencies are skipped
3. **Flexible Conditions**: Maintains original stack-based and event-based conditions
4. **Graceful Skipping**: Jobs skip cleanly when not selected

## Usage Examples

### 1. Re-run Failed Jobs

```yaml
# In GitHub Actions UI:
rerun_failed_from: "1234567890" # Previous run ID
jobs_to_run: "" # Leave empty for auto-detection
```

### 2. Run Only Specific Jobs

```yaml
jobs_to_run: "security,lint,build"
stack: "networking"
```

### 3. Run All Deployment Jobs

```yaml
jobs_to_run: "deploy" # Auto-includes security, lint, build, validate
stack: "monitoring-services"
```

### 4. Run Health Checks Only

```yaml
jobs_to_run: "health" # Auto-includes all dependencies
```

### 5. Emergency Rollback

```yaml
jobs_to_run: "rollback"
stack: "networking"
```

## Automatic Dependency Resolution

### Smart Dependencies

The system automatically enables required dependencies:

- **Deployment Jobs** → Auto-enables: security, lint, build, validate
- **Health Checks** → Auto-enables: security, lint, build, validate
- **Failed Job Re-run** → Auto-enables dependencies of failed deployment jobs

### Dependency Chain

```
security-scan → lint-and-quality → build
                                 ↘
                                  validate-setup
                                 ↗
deploy-networking → deploy-efs → deploy-infra → deploy-services → health-checks
                 ↘
                  deploy-peering
```

## Benefits

### 1. Faster Development Cycles

- Re-run only failed jobs instead of entire pipeline
- Skip unnecessary jobs during development
- Focus on specific components

### 2. Cost Optimization

- Reduce compute time by running only required jobs
- Avoid redundant validation when debugging specific issues

### 3. Improved Debugging

- Isolate specific pipeline stages
- Re-run failed jobs with same environment
- Maintain full traceability

### 4. Enhanced Flexibility

- Support for various development workflows
- Emergency procedures (rollback, destroy)
- Granular control over pipeline execution

## Security Considerations

### GitHub CLI Access

- Added `actions: read` permission for GitHub CLI
- Uses `github.token` for authentication
- Limited to reading workflow run information

### Input Validation

- Case-insensitive job matching prevents typos
- Automatic dependency resolution prevents incomplete deployments
- Stack-specific logic prevents conflicting operations

### Error Handling

- Graceful handling of invalid run IDs
- Fallback to full pipeline if failed job detection fails
- Clear logging of all decisions

## Monitoring and Observability

### Detailed Logging

The `determine-jobs` job provides comprehensive logging:

- Input parameter values
- Failed job detection results
- Dependency resolution decisions
- Final execution plan

### Job Summary

Each execution shows:

- Which jobs will run/skip
- Reason for each decision
- Dependency relationships
- Execution strategy

## Future Enhancements

### 1. Job Grouping

- Pre-defined job groups (e.g., "validation", "deployment", "monitoring")
- Custom job group definitions

### 2. Conditional Dependencies

- More sophisticated dependency resolution
- Optional dependencies based on conditions

### 3. Pipeline Templates

- Save common job selection patterns
- Quick access to frequent workflows

### 4. Integration with External Systems

- Trigger specific jobs based on external events
- Integration with monitoring systems for automatic re-runs

---

_This implementation provides powerful workflow control while maintaining simplicity and safety through automatic dependency resolution and comprehensive validation._
