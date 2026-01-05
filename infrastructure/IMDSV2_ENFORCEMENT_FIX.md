# IMDSv2 Enforcement Fix

## Problem

After redeploying application stacks, EC2 instances still show IMDSv2 as "Optional" instead of "Required", despite having `requireImdsv2: true` in the launch template configuration.

## Root Cause

1. **CDK Property Limitation**: The `requireImdsv2: true` property may not always translate correctly to CloudFormation's `MetadataOptions.HttpTokens: "required"`

2. **Existing Instances**: Instances launched with the old launch template version still have the old IMDSv2 setting. The launch template is updated, but existing instances need to be replaced.

## Solution Applied

### 1. Added CloudFormation Property Overrides

Added explicit CloudFormation property overrides to ensure IMDSv2 is set to "required" in all launch templates:

```typescript
const cfnLaunchTemplate = this.launchTemplate.node.defaultChild as ec2.CfnLaunchTemplate;
cfnLaunchTemplate.addPropertyOverride("LaunchTemplateData.MetadataOptions.HttpTokens", "required");
cfnLaunchTemplate.addPropertyOverride("LaunchTemplateData.MetadataOptions.HttpEndpoint", "enabled");
cfnLaunchTemplate.addPropertyOverride("LaunchTemplateData.MetadataOptions.HttpPutResponseHopLimit", 2);
```

### 2. Files Updated

- ✅ `lib/constructs/compute/ecs/ecs-cluster-construct.ts`
- ✅ `lib/constructs/compute/ecs/auto-scaling-group-construct.ts`
- ✅ `lib/constructs/compute/launch-template/launch-template-construct.ts`
- ✅ `lib/stacks/monitoring/monitoring-ecs-stack.ts`

## Important: Existing Instances Need Replacement

**Critical**: The launch template is now updated, but **existing EC2 instances** were launched with the old template version and will still show IMDSv2 as "Optional" until they are replaced.

### How to Replace Instances

#### Option 1: Let Auto Scaling Group Replace Instances (Recommended)

The ASG will automatically replace instances when you update the launch template. However, you may need to trigger a refresh:

```bash
# Get ASG name from stack outputs
ASG_NAME="<your-asg-name>"

# Start instance refresh to replace instances with new launch template
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name "$ASG_NAME" \
  --preferences '{"MinHealthyPercentage": 0, "InstanceWarmup": 300}'
```

#### Option 2: Terminate Existing Instances

```bash
# Get instance IDs
INSTANCE_IDS=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query 'AutoScalingGroups[0].Instances[*].InstanceId' \
  --output text)

# Terminate instances (ASG will launch new ones)
for INSTANCE_ID in $INSTANCE_IDS; do
  aws ec2 terminate-instances --instance-ids "$INSTANCE_ID"
done
```

#### Option 3: Update ASG Desired Capacity

```bash
# Set desired capacity to 0, then back to 1
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name "$ASG_NAME" \
  --desired-capacity 0

# Wait for instances to terminate, then set back to 1
sleep 60

aws autoscaling set-desired-capacity \
  --auto-scaling-group-name "$ASG_NAME" \
  --desired-capacity 1
```

## Verification

### Step 1: Verify Launch Template Has IMDSv2 Required

```bash
# Get launch template ID from stack outputs
LT_ID="<launch-template-id>"

# Check launch template metadata options
aws ec2 describe-launch-template-versions \
  --launch-template-id "$LT_ID" \
  --query 'LaunchTemplateVersions[0].LaunchTemplateData.MetadataOptions'
```

**Expected Output:**
```json
{
  "HttpTokens": "required",
  "HttpEndpoint": "enabled",
  "HttpPutResponseHopLimit": 2
}
```

### Step 2: Verify New Instances Have IMDSv2 Required

After replacing instances, check the new instances:

```bash
# Get new instance ID
NEW_INSTANCE_ID="<new-instance-id>"

# Check instance metadata options
aws ec2 describe-instances \
  --instance-ids "$NEW_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].MetadataOptions'
```

**Expected Output:**
```json
{
  "HttpTokens": "required",
  "HttpEndpoint": "enabled",
  "HttpPutResponseHopLimit": 2,
  "State": "applied"
}
```

### Step 3: Verify in AWS Console

1. Go to **EC2 Console** → **Instances**
2. Select the new instance
3. Check **Details** tab → **Metadata accessible** should show **"V2 only (token required)"**

## CloudFormation Template Verification

After deploying, verify the CloudFormation template includes:

```json
{
  "LaunchTemplateData": {
    "MetadataOptions": {
      "HttpTokens": "required",
      "HttpEndpoint": "enabled",
      "HttpPutResponseHopLimit": 2
    }
  }
}
```

## Why This Approach?

1. **Explicit Override**: CloudFormation property overrides ensure the setting is applied regardless of CDK property behavior
2. **Consistency**: All launch templates now use the same approach
3. **Reliability**: Property overrides are applied at CloudFormation synthesis time, ensuring they're in the template

## Next Steps

1. ✅ **Deploy the updated stack** - Launch templates are now configured correctly
2. ⏳ **Replace existing instances** - Use one of the methods above
3. ✅ **Verify new instances** - Check that IMDSv2 is "Required" on new instances
4. ✅ **Monitor** - Ensure no issues with instance replacement

## Notes

- **No Downtime**: If you have multiple instances, replace them one at a time to avoid service interruption
- **Health Checks**: Ensure instances pass health checks before terminating the next one
- **Rolling Update**: The ASG will perform a rolling update if configured correctly

