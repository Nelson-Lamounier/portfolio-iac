# ECS Container Instance Registration Troubleshooting

## Problem: No Container Instances Appearing in ECS Cluster

### Symptoms
- Capacity provider is created successfully
- Auto Scaling Group exists
- No container instances visible in ECS console
- Message: "No container instances to display"

## Root Causes & Solutions

### 1. Auto Scaling Group Not Launching Instances

**Check:**
```bash
# Get ASG name from stack outputs
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names <ASG_NAME> \
  --query 'AutoScalingGroups[0].{DesiredCapacity:DesiredCapacity,MinSize:MinSize,MaxSize:MaxSize,Instances:Instances}'
```

**Common Issues:**
- **DesiredCapacity is 0**: ASG won't launch instances
- **Launch template issues**: Invalid AMI, user data errors
- **Subnet issues**: No internet access (public subnets) or no NAT gateway (private subnets)
- **Security group issues**: Blocking necessary traffic

**Solution:**
- Verify `desiredCapacity: 1` is set in `EcsClusterConstruct`
- Check ASG activity history in EC2 console
- Review CloudWatch logs for launch failures

### 2. Instances Launching But Not Registering with ECS

**Check:**
```bash
# SSH into instance and check ECS agent
sudo systemctl status ecs
sudo cat /var/log/ecs/ecs-agent.log | tail -50
sudo cat /etc/ecs/ecs.config
```

**Common Issues:**
- **Wrong cluster name**: `ECS_CLUSTER` in `/etc/ecs/ecs.config` doesn't match actual cluster name
- **ECS agent not running**: Service failed to start
- **Network issues**: Instance can't reach ECS service endpoints
- **IAM permissions**: Instance role missing ECS permissions

**Solution:**
- Verify cluster name matches: `echo ECS_CLUSTER=<cluster-name> >> /etc/ecs/ecs.config`
- Restart ECS agent: `sudo systemctl restart ecs`
- Check IAM role has `AmazonEC2ContainerServiceforEC2Role` policy
- Verify security groups allow outbound HTTPS (for ECS agent communication)

### 3. Managed Scaling Preventing Instance Launch

**Issue:**
When `enableManagedScaling: true`, ECS controls ASG scaling. However, the ASG should still launch instances based on `desiredCapacity` initially.

**Check:**
```bash
# Check capacity provider configuration
aws ecs describe-capacity-providers \
  --capacity-providers <CAPACITY_PROVIDER_NAME> \
  --query 'capacityProviders[0].autoScalingGroupProvider'
```

**Solution:**
- Ensure ASG has `desiredCapacity > 0`
- If instances still don't launch, temporarily disable managed scaling:
  ```typescript
  enableManagedScaling: false, // For troubleshooting
  ```
- After instances register, re-enable managed scaling

### 4. EFS Initialization Dependency Blocking Launch

**Issue:**
If EFS initialization fails or takes too long, the ASG dependency might prevent instance launch.

**Check:**
```bash
# Check EFS initialization status
aws cloudformation describe-stack-resources \
  --stack-name <EFS_STACK_NAME> \
  --query 'StackResources[?LogicalResourceId==`EfsInitialization`]'
```

**Solution:**
- Verify EFS initialization completes successfully
- Check EFS initialization Lambda logs
- If EFS is optional, consider making the dependency conditional

### 5. User Data Script Failures

**Check:**
```bash
# On the EC2 instance
sudo cat /var/log/user-data.log
sudo cat /var/log/cloud-init-output.log
```

**Common Issues:**
- EFS mount failures
- Package installation failures
- Script syntax errors
- Timeout issues

**Solution:**
- Review user data logs for errors
- Test user data script manually
- Add error handling and retries
- Ensure scripts complete successfully

## Verification Steps

### Step 1: Check ASG Status
```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names <ASG_NAME>
```

**Expected:**
- `DesiredCapacity: 1`
- `Instances` array contains at least one instance
- Instance `LifecycleState: InService`

### Step 2: Check EC2 Instance Status
```bash
aws ec2 describe-instances \
  --instance-ids <INSTANCE_ID> \
  --query 'Reservations[0].Instances[0].{State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress}'
```

**Expected:**
- `State: running`
- Instance has IP address (public or private depending on subnet)

### Step 3: Check ECS Agent on Instance
```bash
# SSH into instance
ssh ec2-user@<INSTANCE_IP>

# Check ECS agent
sudo systemctl status ecs
sudo cat /etc/ecs/ecs.config
```

**Expected:**
- ECS agent is `active (running)`
- `/etc/ecs/ecs.config` contains: `ECS_CLUSTER=<correct-cluster-name>`

### Step 4: Check Container Instances in ECS
```bash
aws ecs list-container-instances \
  --cluster <CLUSTER_NAME>
```

**Expected:**
- Returns at least one container instance ARN
- Instance status is `ACTIVE`

## Recent Fixes Applied

1. **Explicit Capacity Values**: Added `minCapacity: 1, maxCapacity: 1, desiredCapacity: 1` to `MonitoringInfraStack`
2. **Public Subnets**: Set `usePublicSubnets: true` to match EFS mount target location
3. **Diagnostic Outputs**: Added ASG name and ARN outputs for troubleshooting
4. **Better Comments**: Added troubleshooting notes in capacity provider configuration

## Next Steps

1. **Deploy the updated stack** with explicit capacity values
2. **Check ASG in EC2 console** - verify instances are launching
3. **Check ECS cluster** - verify container instances appear
4. **If still no instances**:
   - Check ASG activity history
   - Review CloudWatch logs
   - SSH into instances and check ECS agent
   - Temporarily disable managed scaling for troubleshooting

## Quick Fix: Temporarily Disable Managed Scaling

If instances still don't launch, temporarily disable managed scaling:

```typescript
// In EcsClusterConstruct
enableManagedScaling: false, // Temporarily disable for troubleshooting
```

This will allow the ASG to launch instances based on `desiredCapacity` without ECS interference. After instances register, you can re-enable managed scaling.

