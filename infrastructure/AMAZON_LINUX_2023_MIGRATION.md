# Amazon Linux 2023 Migration

## Overview

This document tracks the migration from Amazon Linux 2 ECS-optimized AMI to Amazon Linux 2023 ECS-optimized AMI.

## End of Life Timeline

- **Amazon Linux 2 EOL**: June 30, 2026
- **Amazon ECS-optimized Amazon Linux 2 AMI EOL**: June 30, 2026
- **Migration Status**: ✅ **COMPLETED** (as of this update)

## Changes Made

All instances of `EcsOptimizedImage.amazonLinux2()` have been updated to `EcsOptimizedImage.amazonLinux2023()` in the following files:

1. ✅ `lib/constructs/compute/ecs/ecs-cluster-construct.ts`
2. ✅ `lib/constructs/compute/ecs/auto-scaling-group-construct.ts`
3. ✅ `lib/stacks/monitoring/monitoring-ecs-stack.ts`
4. ✅ `lib/stacks/compute/launch-template-stack.ts`

## Compatibility Considerations

### Package Manager
- **Amazon Linux 2**: Uses `yum` (YUM v3)
- **Amazon Linux 2023**: Uses `dnf` (DNF v5) with `yum` as a compatibility wrapper
- **Impact**: ✅ **No changes needed** - All `yum` commands in user data scripts will continue to work

### User Data Scripts
All existing user data scripts using `yum` commands are compatible:
- `yum update -y` ✅
- `yum install -y amazon-cloudwatch-agent` ✅
- `yum install -y amazon-efs-utils` ✅

### ECS Agent
- Amazon Linux 2023 ECS-optimized AMI includes the ECS agent pre-installed
- ECS agent configuration remains the same (`/etc/ecs/ecs.config`)
- No changes needed to ECS agent setup

### System Services
- `systemctl` commands remain the same
- Service management is identical
- No changes needed

## Benefits of Amazon Linux 2023

1. **Extended Support**: Long-term support until 2028
2. **Enhanced Security**: 
   - SELinux enabled by default
   - Improved security policies
   - Regular security updates
3. **Performance Improvements**:
   - Faster boot times
   - Optimized for cloud workloads
   - Better resource utilization
4. **Modern Package Management**:
   - DNF v5 (faster and more reliable)
   - Better dependency resolution
   - Improved transaction handling

## Testing Recommendations

Before deploying to production, test the following:

1. **ECS Agent Registration**
   ```bash
   # Verify ECS agent starts correctly
   sudo systemctl status ecs
   ```

2. **EFS Mounting**
   ```bash
   # Verify EFS mounts successfully
   mountpoint -q /mnt/efs && echo "EFS mounted" || echo "EFS not mounted"
   ```

3. **Package Installation**
   ```bash
   # Verify packages install correctly
   yum list installed | grep amazon-cloudwatch-agent
   yum list installed | grep amazon-efs-utils
   ```

4. **Container Execution**
   ```bash
   # Verify containers can start
   docker ps
   ```

## Rollback Plan

If issues are encountered, you can temporarily rollback by:

1. Reverting the AMI change in the affected construct/stack
2. Changing `EcsOptimizedImage.amazonLinux2023()` back to `EcsOptimizedImage.amazonLinux2()`
3. Redeploying the stack

**Note**: Rollback should only be used as a temporary measure, as Amazon Linux 2 reaches EOL in 2026.

## References

- [AWS Documentation: AL2 to AL2023 AMI Transition](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/al2-to-al2023-ami-transition.html)
- [Amazon Linux 2023 Release Notes](https://docs.aws.amazon.com/linux/al2023/release-notes/)
- [Amazon Linux 2 End of Life](https://docs.aws.amazon.com/AL2/latest/relnotes/relnotes-20250929.html)

## Migration Checklist

- [x] Update all `EcsOptimizedImage.amazonLinux2()` to `amazonLinux2023()`
- [x] Verify build succeeds
- [x] Add comments explaining the migration
- [ ] Test in development environment
- [ ] Test ECS agent registration
- [ ] Test EFS mounting
- [ ] Test container execution
- [ ] Deploy to staging
- [ ] Deploy to production
- [ ] Monitor for issues post-deployment

