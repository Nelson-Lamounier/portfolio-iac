# Application Setup Lambda → SSM State Manager Migration Plan

## Executive Summary

**Recommendation: Migrate to SSM State Manager**

The Application Setup Lambda is a perfect candidate for SSM State Manager migration. It's already using SSM Run Command under the hood, and State Manager provides better automation, self-healing, and simpler architecture.

---

## Current Architecture (Lambda-Based)

### What the Lambda Does

1. **Triggers:**
   - EventBridge: ECS Container Instance State Change (when instance registers)
   - Custom Resource: Stack updates (forces re-run on all instances)

2. **Actions:**
   - Finds EC2 instances in ECS cluster
   - Stops old ECS tasks (to free credentials)
   - Executes SSM Run Command with setup script
   - Reloads Prometheus configuration
   - Waits for command completion

3. **Setup Script (via SSM Run Command):**
   - Mounts EFS
   - Creates directory structure
   - Sets permissions (Prometheus UID 65534, Grafana UID 472)
   - Downloads configs from SSM Parameter Store
   - Replaces `HOST_IP_PLACEHOLDER` in Grafana datasource config
   - Creates symlinks
   - Fixes Grafana database permissions

### Current Issues

- ❌ **Complexity:** Lambda + EventBridge + Custom Resource
- ❌ **VPC Configuration:** Lambda needs VPC access for ECS API calls
- ❌ **No Self-Healing:** Only runs on instance registration or stack updates
- ❌ **Manual Triggering:** Requires Lambda invocation for existing instances
- ❌ **Error Handling:** Complex retry logic in Lambda code
- ❌ **Cost:** Lambda execution time + VPC ENI costs

---

## Proposed Architecture (SSM State Manager)

### Benefits

✅ **No Lambda Needed:** Direct execution on EC2 instances  
✅ **No VPC Configuration:** SSM runs via Systems Manager service  
✅ **Automatic Execution:** Runs on instance launch (via tags)  
✅ **Self-Healing:** Can run on schedule (e.g., hourly)  
✅ **Simpler Architecture:** One SSM Association instead of Lambda + EventBridge + Custom Resource  
✅ **Built-in Retry:** SSM handles retries automatically  
✅ **Cost Effective:** No Lambda execution or VPC ENI costs  
✅ **Better Observability:** SSM Compliance dashboard shows association status  

### Architecture Flow

```
EC2 Instance Launch
        │
        ▼
  SSM Agent Starts
        │
        ▼
  SSM State Manager Association
  (targets instances by tags)
        │
        ├── Mount EFS
        ├── Create directory structure
        ├── Set permissions
        ├── Download configs from SSM
        ├── Replace HOST_IP_PLACEHOLDER
        ├── Create symlinks
        ├── Fix Grafana database permissions
        └── Reload Prometheus
```

---

## Migration Plan

### Phase 1: Create SSM State Manager Association

#### 1.1 Create SSM Document

Store the setup script as an SSM Document (or use inline script in Association).

**Option A: Inline Script (Simpler)**
- Script embedded directly in Association
- Easier to update (just update Association)
- Good for scripts < 4KB

**Option B: SSM Document (Better for Large Scripts)**
- Store script as SSM Document
- Reusable across multiple Associations
- Better for scripts > 4KB

**Recommendation:** Start with **Option A** (inline), migrate to Document if script grows.

#### 1.2 Create SSM Association

```typescript
const applicationSetupAssociation = new ssm.CfnAssociation(
  this,
  "ApplicationSetupAssociation",
  {
    name: "AWS-RunShellScript", // Use AWS managed document
    associationName: `${envName}-application-setup`,
    targets: [
      {
        key: "tag:Environment",
        values: [envName],
      },
      {
        key: "tag:Service",
        values: ["monitoring"],
      },
    ],
    parameters: {
      commands: [buildApplicationSetupScript(config)],
      workingDirectory: [""],
      executionTimeout: ["3600"], // 1 hour
    },
    scheduleExpression: "rate(1 hour)", // Self-healing: run every hour
    applyOnlyAtCronInterval: false, // Also run immediately on instance launch
    complianceSeverity: "CRITICAL", // Mark as critical for compliance
  }
);
```

#### 1.3 Extract Setup Script

Move `buildApplicationSetupScript()` from Lambda to a shared utility or SSM Document.

**Location:** `infrastructure/lib/constructs/monitoring/application-setup-script.ts`

### Phase 2: Handle Special Cases

#### 2.1 Stop Old ECS Tasks

**Problem:** The Lambda stops old ECS tasks to free credentials. This is ECS-specific logic.

**Solution Options:**

**Option A: Keep in Lambda (Minimal Lambda)**
- Create a separate, minimal Lambda just for task cleanup
- Triggered by EventBridge on stack updates
- No VPC needed (ECS API calls work from Lambda without VPC)

**Option B: Move to SSM Script**
- Add ECS task cleanup to the setup script
- Requires instance role to have ECS permissions
- Simpler, but adds complexity to setup script

**Option C: Use ECS Service Deployment Configuration**
- Configure ECS services with `minHealthyPercent: 0`
- ECS automatically stops old tasks before starting new ones
- No Lambda needed

**Recommendation:** **Option C** (already implemented in your code!) + **Option A** as fallback for manual cleanup.

#### 2.2 Reload Prometheus

**Current:** Lambda sends `curl -X POST http://localhost:9090/prometheus/-/reload`

**SSM Solution:** Add to setup script:
```bash
# Reload Prometheus configuration
curl -X POST http://localhost:9090/prometheus/-/reload || echo 'Prometheus reload failed (may not be running yet)'
```

**Note:** This is idempotent - safe to run multiple times.

#### 2.3 Custom Resource Trigger

**Current:** Custom Resource forces Lambda to run on stack updates.

**SSM Solution:** 
- SSM Association runs automatically on tagged instances
- No Custom Resource needed
- If you need to force re-run on stack updates, update the Association (CDK will detect change)

### Phase 3: Remove Lambda Infrastructure

#### 3.1 Remove Lambda Construct

- Delete `ApplicationSetupLambdaConstruct`
- Remove from `MonitoringInfraStack`

#### 3.2 Remove EventBridge Rule

- No longer needed (SSM handles instance targeting)

#### 3.3 Remove Custom Resource

- No longer needed (SSM runs automatically)

#### 3.4 Update Dependencies

- Remove Lambda from stack dependencies
- Update any references to Lambda outputs

---

## Implementation Details

### SSM Association Configuration

```typescript
export interface ApplicationSetupSsmAssociationProps {
  envName: string;
  fileSystemId: string;
  region: string;
  clusterName?: string; // Optional: for Prometheus reload
}

export class ApplicationSetupSsmAssociationConstruct extends Construct {
  public readonly association: ssm.CfnAssociation;

  constructor(
    scope: Construct,
    id: string,
    props: ApplicationSetupSsmAssociationProps
  ) {
    super(scope, id);

    // Build setup script
    const setupScript = buildApplicationSetupScript({
      fileSystemId: props.fileSystemId,
      region: props.region,
      envName: props.envName,
      clusterName: props.clusterName,
    });

    // Create SSM Association
    this.association = new ssm.CfnAssociation(
      this,
      "ApplicationSetupAssociation",
      {
        name: "AWS-RunShellScript",
        associationName: `${props.envName}-application-setup`,
        targets: [
          {
            key: "tag:Environment",
            values: [props.envName],
          },
          {
            key: "tag:Service",
            values: ["monitoring"],
          },
          {
            key: "instance-state-name",
            values: ["running"],
          },
        ],
        parameters: {
          commands: [setupScript],
          workingDirectory: [""],
          executionTimeout: ["3600"], // 1 hour
        },
        // Run immediately on instance launch AND on schedule
        scheduleExpression: "rate(1 hour)", // Self-healing
        applyOnlyAtCronInterval: false, // Also run on instance launch
        complianceSeverity: "CRITICAL",
        outputLocation: {
          s3Location: {
            // Optional: Store output in S3 for audit
            outputS3Region: props.region,
            outputS3BucketName: `ssm-output-${props.envName}`, // Create bucket if needed
            outputS3KeyPrefix: "application-setup/",
          },
        },
      }
    );
  }
}
```

### Setup Script Extraction

**File:** `infrastructure/lib/constructs/monitoring/application-setup-script.ts`

```typescript
export interface ApplicationSetupScriptConfig {
  fileSystemId: string;
  region: string;
  envName: string;
  clusterName?: string;
}

export function buildApplicationSetupScript(
  config: ApplicationSetupScriptConfig
): string {
  // Move the script from Lambda to here
  // Same script, just extracted to a shared location
  return `#!/bin/bash
set -e
# ... (existing script content)
`;
}
```

### Instance Role Permissions

Ensure EC2 instance role has:

```typescript
// Already have these (from SSM State Manager construct):
- AmazonSSMManagedInstanceCore ✅
- ssm:SendCommand (for SSM Run Command) ✅

// Need to add for ECS task cleanup (if using Option B):
- ecs:ListServices
- ecs:ListTasks
- ecs:DescribeTasks
- ecs:StopTask

// Already have for SSM Parameter access:
- ssm:GetParameter ✅
```

---

## Migration Steps

### Step 1: Create New Construct (Non-Breaking)

1. Create `ApplicationSetupSsmAssociationConstruct`
2. Extract `buildApplicationSetupScript()` to shared utility
3. Add SSM Association to `MonitoringInfraStack` (alongside existing Lambda)
4. Test that SSM Association runs on new instances

### Step 2: Verify SSM Association Works

1. Launch new EC2 instance
2. Verify SSM Association runs automatically
3. Check SSM Compliance dashboard
4. Verify setup script executes correctly
5. Test self-healing (wait for scheduled run)

### Step 3: Remove Lambda (Breaking Change)

1. Remove `ApplicationSetupLambdaConstruct` from stack
2. Remove EventBridge rule
3. Remove Custom Resource
4. Deploy and verify

### Step 4: Handle Edge Cases

1. **Existing Instances:** SSM Association will run on next schedule (1 hour) or manually trigger
2. **Stack Updates:** Update Association parameters to force re-run
3. **Task Cleanup:** Keep minimal Lambda for manual cleanup if needed

---

## Testing Checklist

- [ ] SSM Association runs on new instance launch
- [ ] Setup script executes successfully
- [ ] EFS mounts correctly
- [ ] Directory structure created
- [ ] Permissions set correctly
- [ ] Configs downloaded from SSM
- [ ] HOST_IP_PLACEHOLDER replaced
- [ ] Symlinks created
- [ ] Grafana database permissions fixed
- [ ] Prometheus reloads configuration
- [ ] Self-healing works (scheduled run)
- [ ] SSM Compliance dashboard shows status
- [ ] Old Lambda removed successfully

---

## Rollback Plan

If issues occur:

1. **Quick Rollback:** Re-add Lambda construct (keep SSM Association for now)
2. **Full Rollback:** Remove SSM Association, restore Lambda + EventBridge + Custom Resource
3. **Hybrid:** Keep both temporarily, disable one via feature flag

---

## Cost Comparison

### Current (Lambda)

- **Lambda Execution:** ~$0.20 per 1M requests
- **Lambda Duration:** ~30 seconds × $0.0000166667/GB-second = ~$0.0001 per execution
- **VPC ENI:** ~$0.01/hour × 24 hours = ~$0.24/day
- **EventBridge:** $1.00 per 1M events
- **Total:** ~$0.25/day + execution costs

### SSM State Manager

- **SSM Association:** Free
- **SSM Run Command:** Free (first 10,000 per month)
- **S3 Output Storage:** ~$0.023/GB-month (optional)
- **Total:** ~$0/day (or ~$0.01/day with S3)

**Savings:** ~$0.25/day = **~$91/year per environment**

---

## Security Considerations

### IAM Permissions

SSM State Manager uses the **EC2 instance role** to execute commands. Ensure:

1. ✅ Instance role has `AmazonSSMManagedInstanceCore` (already have)
2. ✅ Instance role can read SSM Parameters (already have)
3. ✅ Instance role can mount EFS (already have)
4. ⚠️ If using ECS task cleanup in script, add ECS permissions

### Network Security

- ✅ SSM uses Systems Manager service (no VPC needed)
- ✅ EFS mount uses IAM authentication (already configured)
- ✅ SSM Parameters use IAM for access control

---

## Monitoring & Observability

### SSM Compliance Dashboard

- View association status in Systems Manager Console
- See which instances are compliant/non-compliant
- View execution history

### CloudWatch Logs

- SSM Run Command output goes to CloudWatch Logs
- Log group: `/aws/ssm/run-command`
- Can create alarms on failures

### S3 Output (Optional)

- Store command output in S3 for audit
- Useful for compliance requirements
- Can analyze execution history

---

## Next Steps

1. **Review this plan** with team
2. **Create SSM Association construct** (Phase 1)
3. **Test on dev environment** (Phase 2)
4. **Migrate production** (Phase 3)
5. **Remove Lambda** (Phase 4)

---

## Questions & Answers

**Q: What if an instance is already running?**  
A: SSM Association will run on the next schedule (1 hour) or you can manually trigger it via SSM Console.

**Q: How do we force re-run on stack updates?**  
A: Update the Association parameters (CDK will detect change and update). Alternatively, add a timestamp parameter that changes on each deploy.

**Q: What about the task cleanup logic?**  
A: ECS services already have `minHealthyPercent: 0`, so old tasks are stopped automatically. Keep minimal Lambda for manual cleanup if needed.

**Q: Can we run on a different schedule?**  
A: Yes, change `scheduleExpression` to any cron or rate expression (e.g., `rate(30 minutes)`, `cron(0 2 * * ? *)`).

**Q: What if SSM Association fails?**  
A: SSM will retry automatically. You can also set up CloudWatch alarms on SSM compliance status.

---

## Conclusion

Migrating to SSM State Manager provides:
- ✅ Simpler architecture
- ✅ Better automation
- ✅ Self-healing capabilities
- ✅ Cost savings
- ✅ Better observability

The migration is straightforward and low-risk, with a clear rollback plan.
