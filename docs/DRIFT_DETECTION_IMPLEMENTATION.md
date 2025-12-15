<!-- @format -->

# Infrastructure Drift Detection Implementation

## Overview

Implemented comprehensive infrastructure drift detection to identify when deployed AWS resources have diverged from their expected CDK configuration. This helps catch manual changes, external modifications, or configuration drift over time.

## Drift Detection Composite Action

### Location

`.github/actions/drift-detection/action.yml`

### Purpose

Detects drift between deployed infrastructure and CDK configuration using both CDK diff analysis and CloudFormation drift detection.

### Key Features

#### 1. Dual Detection Methods

- **CDK Diff Analysis**: Compares current CDK code with deployed infrastructure
- **CloudFormation Drift Detection**: Uses AWS native drift detection for deployed resources
- **Configurable Check Modes**: 'full' (both methods) or 'quick' (CDK diff only)

#### 2. Comprehensive Validation

- **Input Validation**: Validates all parameters with detailed error messages
- **Stack Existence Checks**: Verifies CloudFormation stack exists and is in stable state
- **Environment Setup**: Ensures proper CDK and AWS CLI configuration

#### 3. Intelligent Analysis

- **Change Categorization**: Counts additions, deletions, and modifications
- **Severity Assessment**: Classifies drift as none, low, medium, high, or critical
- **Threshold Management**: Configurable drift tolerance levels
- **Detailed Reporting**: Comprehensive drift analysis with actionable recommendations

### Inputs

| Input             | Description                       | Required | Default |
| ----------------- | --------------------------------- | -------- | ------- |
| `stack-name`      | CDK stack name to check           | Yes      | -       |
| `environment`     | Environment (pipeline, dev, prod) | Yes      | -       |
| `aws-account-id`  | AWS Account ID                    | Yes      | -       |
| `aws-region`      | AWS Region                        | Yes      | -       |
| `dev-vpc-id`      | Development VPC ID                | No       | ""      |
| `dev-account-id`  | Development Account ID            | No       | ""      |
| `drift-threshold` | Max drift count before failing    | No       | "0"     |
| `check-mode`      | Detection mode (full/quick)       | No       | "full"  |

### Outputs

| Output           | Description                                    |
| ---------------- | ---------------------------------------------- |
| `drift-detected` | Whether drift was detected (true/false)        |
| `drift-count`    | Number of resources with drift                 |
| `drift-severity` | Severity level (none/low/medium/high/critical) |

## Pipeline Integration

### New Workflow Inputs

#### `enable_drift_detection` (Boolean)

- **Description**: "Enable infrastructure drift detection after deployment"
- **Default**: `true`
- **Purpose**: Allow users to enable/disable drift detection

#### `drift_threshold` (String)

- **Description**: "Maximum drift count before failing (0 = fail on any drift)"
- **Default**: "5"
- **Purpose**: Configure drift tolerance for the entire pipeline

### Drift Detection Job

#### Job Configuration

- **Name**: `drift-detection`
- **Runs After**: `health-checks` (ensures infrastructure is stable)
- **Condition**: Enabled via `determine-jobs` and `enable_drift_detection` input
- **Environment**: `pipeline` (requires AWS credentials)

#### Per-Stack Detection

The job runs drift detection on each monitoring stack:

1. **NetworkingStack-pipeline**
   - Threshold: 2 drifts
   - Mode: Full detection
   - Critical for VPC and networking resources

2. **MonitoringEfsStack-pipeline**
   - Threshold: 1 drift
   - Mode: Full detection
   - Storage resources are sensitive to changes

3. **VpcPeeringStack-pipeline** (if cross-account configured)
   - Threshold: 1 drift
   - Mode: Full detection
   - Cross-account connectivity is critical

4. **MonitoringInfraStack-pipeline**
   - Threshold: 3 drifts
   - Mode: Full detection
   - Load balancer and infrastructure components

5. **MonitoringServiceStack-pipeline**
   - Threshold: 5 drifts
   - Mode: Full detection
   - ECS services may have more dynamic changes

### Overall Analysis

#### Drift Aggregation

- **Total Drift Count**: Sum of all stack drift counts
- **Stacks with Drift**: Number of stacks showing drift
- **Critical Assessment**: Identifies high-severity drift requiring immediate attention

#### Status Classification

- **Clean**: No drift detected across all stacks
- **Minor**: Low drift count (≤5 total) with low severity
- **Major**: Significant drift (>5 total) requiring attention
- **Critical**: High-severity drift requiring immediate action

## Detection Process

### 1. Validation Phase

```yaml
- Input parameter validation
- Stack existence verification
- Environment setup confirmation
```

### 2. CDK Diff Analysis

```yaml
- Synthesize current CDK configuration
- Compare with deployed CloudFormation template
- Categorize changes (additions, deletions, modifications)
- Generate detailed diff report
```

### 3. CloudFormation Drift Detection (Full Mode)

```yaml
- Initiate AWS drift detection
- Monitor detection progress
- Retrieve detailed drift results
- Analyze drifted resources
```

### 4. Analysis and Reporting

```yaml
- Combine CDK and CloudFormation results
- Calculate severity levels
- Generate comprehensive reports
- Create actionable recommendations
```

## Error Handling

### Comprehensive Error Messages

Each failure scenario includes:

- **Clear Error Description**: What went wrong
- **Possible Causes**: Why it might have happened
- **Troubleshooting Steps**: How to fix it
- **Required Permissions**: What AWS permissions are needed

### Example Error Output

```
❌ STACK NOT FOUND

🚨 ERROR: CloudFormation stack 'MonitoringStack-pipeline' does not exist

📋 POSSIBLE CAUSES:
  1. Stack has never been deployed
  2. Stack was deleted manually
  3. Wrong stack name or environment suffix
  4. Deploying to wrong AWS account/region

🔧 TROUBLESHOOTING STEPS:
  1. List available stacks: aws cloudformation list-stacks
  2. Check stack name format: [StackName]-pipeline
  3. Verify AWS account and region
  4. Deploy stack first if it doesn't exist
```

### Graceful Degradation

- **Continue on Error**: Individual stack failures don't stop overall analysis
- **Partial Results**: Report results for successful checks even if some fail
- **Fallback Modes**: Quick mode if CloudFormation detection fails

## Reporting and Artifacts

### Drift Reports

Each drift detection generates:

1. **Summary Report** (`drift-summary.md`)
   - Overall drift status
   - Detailed analysis results
   - Actionable recommendations

2. **CDK Diff Output** (`cdk-diff-output.txt`)
   - Raw CDK diff results
   - Change categorization
   - Resource-level details

3. **CloudFormation Details** (`cf-drift-details.txt`)
   - AWS native drift detection results
   - Property-level changes
   - Resource status information

### GitHub Actions Integration

#### Job Summary

- **Visual Status Indicators**: ✅ ⚠️ 🚨 for different drift levels
- **Per-Stack Results Table**: Organized drift information
- **Next Steps Guidance**: Specific actions based on results
- **Artifact Links**: Direct access to detailed reports

#### Artifact Upload

- **Automatic Collection**: All drift reports uploaded as artifacts
- **Retention**: 30-day retention for historical analysis
- **Organization**: Structured folder layout for easy navigation

## Usage Examples

### 1. Manual Drift Detection

```yaml
# Workflow dispatch inputs:
jobs_to_run: "drift"
enable_drift_detection: true
drift_threshold: "3"
```

### 2. Post-Deployment Drift Check

```yaml
# Automatic after successful deployment:
enable_drift_detection: true # (default)
# Runs after health-checks complete
```

### 3. Scheduled Drift Monitoring

```yaml
# Can be triggered via cron schedule:
on:
  schedule:
    - cron: "0 6 * * 1" # Weekly Monday 6 AM
```

### 4. Emergency Drift Assessment

```yaml
# Quick check without full CloudFormation detection:
jobs_to_run: "drift"
# Set check-mode: "quick" in composite action
```

## Benefits

### 1. Proactive Issue Detection

- **Early Warning**: Catch drift before it causes problems
- **Change Tracking**: Identify when and what changed
- **Compliance Monitoring**: Ensure infrastructure matches approved configuration

### 2. Operational Excellence

- **Automated Monitoring**: No manual intervention required
- **Comprehensive Coverage**: All stacks checked systematically
- **Historical Tracking**: Artifact retention for trend analysis

### 3. Security and Governance

- **Unauthorized Change Detection**: Identify manual modifications
- **Configuration Compliance**: Ensure adherence to standards
- **Audit Trail**: Detailed records of infrastructure state

### 4. Developer Experience

- **Clear Reporting**: Easy-to-understand drift summaries
- **Actionable Guidance**: Specific steps to resolve issues
- **Integration**: Seamless part of deployment pipeline

## Security Considerations

### Permissions Required

```json
{
  "CloudFormation": [
    "cloudformation:DetectStackDrift",
    "cloudformation:DescribeStackDriftDetectionStatus",
    "cloudformation:DescribeStackResourceDrifts",
    "cloudformation:DescribeStacks"
  ],
  "CDK": ["All permissions required for CDK synthesis"]
}
```

### Sensitive Data Handling

- **Automatic Masking**: All resource IDs and sensitive values masked
- **Secure Artifacts**: Drift reports sanitized before upload
- **Access Control**: Artifacts only accessible to authorized users

## Future Enhancements

### 1. Advanced Analytics

- **Trend Analysis**: Track drift patterns over time
- **Predictive Alerts**: Identify resources prone to drift
- **Impact Assessment**: Analyze drift severity and business impact

### 2. Automated Remediation

- **Auto-Fix**: Automatically correct minor drift issues
- **Approval Workflows**: Managed remediation for significant changes
- **Rollback Capabilities**: Revert unauthorized changes

### 3. Integration Improvements

- **Slack/Teams Notifications**: Real-time drift alerts
- **Dashboard Integration**: Visual drift monitoring
- **Policy Enforcement**: Prevent deployments with excessive drift

### 4. Enhanced Detection

- **Resource-Level Thresholds**: Different limits per resource type
- **Change Classification**: Distinguish between critical and cosmetic changes
- **Custom Rules**: Organization-specific drift detection rules

---

_This drift detection implementation provides comprehensive infrastructure monitoring to maintain consistency between deployed resources and CDK configuration, helping ensure infrastructure reliability and compliance._
