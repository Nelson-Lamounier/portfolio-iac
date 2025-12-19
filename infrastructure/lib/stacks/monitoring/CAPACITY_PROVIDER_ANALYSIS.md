<!-- @format -->

# Capacity Provider & Auto Scaling Group Analysis

## Problem

**No container instances registered** in the Capacity Provider, but instances are launching in the Auto Scaling Group.

## Architecture Flow

### 1. MonitoringInfraStack Setup

```
MonitoringInfraStack
├── LaunchTemplateConstruct (creates launch template with IAM role)
│   ├── Role: MonitoringInfraLaunchTemplate/InstanceRole
│   │   ├── AmazonSSMManagedInstanceCore ✓
│   │   └── CloudWatchAgentServerPolicy ✓
│   └── UserData: MonitoringUserDataConstruct
│       └── ECS_CLUSTER=${clusterName} ✓
│       └── systemctl start ecs ✓
│
├── EcsClusterConstruct (creates cluster + ASG + capacity provider)
│   ├── customLaunchTemplate: ltConstruct.launchTemplate
│   ├── ASG uses launch template's role
│   └── CapacityProvider links ASG to cluster
│
└── Adds ECS role policy to ltConstruct.role
    └── AmazonEC2ContainerServiceforEC2Role ✓
```

### 2. Critical Issue: ASG Role vs Launch Template Role

**The Problem:**

- When `EcsClusterConstruct` uses a `customLaunchTemplate`, it creates an ASG that references the launch template
- The ASG's `role` property is **separate** from the launch template's IAM role
- The launch template's role is used by instances, but the ASG's role is used for ASG operations

**Current Code Flow:**

```typescript
// In MonitoringInfraStack
const ltConstruct = new LaunchTemplateConstruct(...);
ltConstruct.role.addManagedPolicy(AmazonEC2ContainerServiceforEC2Role); // ✓ Added

// In EcsClusterConstruct
this.asg = new autoscaling.AutoScalingGroup({
  launchTemplate: this.launchTemplate, // Uses launch template's role
  ...
});
```

**The ASG's `role` property:**

- CDK automatically creates an ASG role for lifecycle hooks
- This is **different** from the launch template's instance role
- The instance role (from launch template) is what instances actually use

### 3. Why Instances Aren't Registering

**Checklist for Container Instance Registration:**

1. ✅ **IAM Role**: `AmazonEC2ContainerServiceforEC2Role` is added to `ltConstruct.role`
2. ✅ **ECS_CLUSTER**: Set in user data via `MonitoringUserDataConstruct`
3. ✅ **ECS Agent**: Started in user data
4. ✅ **Security Group**: Outbound HTTPS (443) allowed
5. ✅ **Subnets**: Public subnets with public IPs
6. ❓ **ASG Role**: Need to verify ASG role has ECS permissions (if needed)

**Potential Issues:**

#### Issue 1: ASG Role Missing ECS Permissions

The ASG's role (for lifecycle hooks) might need ECS permissions if it's doing any ECS-related operations.

#### Issue 2: Instance Role Not Properly Attached

Verify that the launch template's role is actually being used by instances:

- Check EC2 console → Instances → IAM Role column
- Should show the role from `ltConstruct.role`

#### Issue 3: ECS Agent Not Starting

Check instance logs:

```bash
# Via SSM Session Manager
sudo cat /var/log/ecs/ecs-agent.log
sudo cat /var/log/user-data.log
sudo systemctl status ecs
```

#### Issue 4: Cluster Name Mismatch

Verify `/etc/ecs/ecs.config` on instance:

```bash
cat /etc/ecs/ecs.config
# Should show: ECS_CLUSTER=pipeline-monitoring-cluster
```

#### Issue 5: Security Group Outbound Rules

Verify instances can reach ECS endpoints:

- Outbound HTTPS (443) to 0.0.0.0/0 ✓ (already added)
- Check if any network ACLs are blocking

#### Issue 6: Capacity Provider Configuration

Check if managed scaling is interfering:

```typescript
enableManagedScaling: false, // ✓ Already disabled
```

### 4. Debugging Steps

1. **Check ASG Status:**

   ```bash
   aws autoscaling describe-auto-scaling-groups \
     --auto-scaling-group-names <ASG_NAME>
   ```

   - Verify `DesiredCapacity` > 0
   - Verify instances are in `InService` state

2. **Check Instance IAM Role:**

   ```bash
   aws ec2 describe-instances --instance-ids <INSTANCE_ID> \
     --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn'
   ```

   - Should match the launch template's role

3. **Check ECS Agent Logs (via SSM):**

   ```bash
   aws ssm start-session --target <INSTANCE_ID>
   sudo tail -f /var/log/ecs/ecs-agent.log
   ```

4. **Check Cluster Capacity:**

   ```bash
   aws ecs describe-clusters --clusters <CLUSTER_NAME> \
     --include CONFIGURATIONS
   ```

5. **Check Capacity Provider:**
   ```bash
   aws ecs describe-capacity-providers \
     --capacity-providers <CAPACITY_PROVIDER_NAME>
   ```

### 5. Code Review Findings

**What's Working:**

- ✅ Launch template role has ECS permissions
- ✅ User data sets ECS_CLUSTER correctly
- ✅ User data starts ECS agent
- ✅ Security group allows outbound HTTPS
- ✅ ASG is created with correct launch template

**Potential Issues:**

- ⚠️ ASG role might need ECS permissions (unlikely, but check)
- ⚠️ Instance profile might not be properly attached
- ⚠️ ECS agent might be failing silently

### 6. Root Cause Identified ✅

**CRITICAL ISSUE FOUND:**

- EFS and SSM permissions were being added to the **ASG role** (for lifecycle hooks)
- But instances need these permissions on the **instance role** (from launch template)
- The ASG role ≠ Instance role

**Fix Applied:**

- Moved EFS and SSM permissions from `asg.role` to `ltConstruct.role`
- The instance role is what EC2 instances actually use at runtime
- The ASG role is only for Auto Scaling lifecycle operations

### 7. Recommended Fixes

#### Fix 1: Verify Instance Profile Attachment ✅ (Already Correct)

Ensure the launch template's role is properly attached to instances:

```typescript
// In LaunchTemplateConstruct, verify:
this.launchTemplate = new ec2.LaunchTemplate({
  role: this.role, // ✓ This should attach the role
  ...
});
```

#### Fix 2: Add Explicit Dependency

Ensure ASG waits for launch template role to be ready:

```typescript
this.asg.node.addDependency(ltConstruct.role);
```

#### Fix 3: Add Health Check Verification

Add a check to verify instances are healthy before capacity provider considers them:

```typescript
healthChecks: autoscaling.HealthChecks.ec2({
  gracePeriod: cdk.Duration.seconds(300), // ✓ Already set
}),
```

#### Fix 4: Verify User Data Execution

Add explicit verification in user data that ECS agent started:

```bash
# Already in MonitoringUserDataConstruct:
systemctl is-active ecs && echo '✓ ECS agent is running' || { echo 'ERROR: ECS agent failed to start'; exit 1; }
```

### 7. Next Steps

1. **SSM into a running instance** and verify:
   - IAM role is attached
   - ECS_CLUSTER is set correctly
   - ECS agent is running
   - Can reach ECS endpoints

2. **Check CloudWatch Logs** for ECS agent errors

3. **Verify Capacity Provider** is correctly linked to ASG

4. **Check ECS Console** → Cluster → Container Instances tab for any error messages
