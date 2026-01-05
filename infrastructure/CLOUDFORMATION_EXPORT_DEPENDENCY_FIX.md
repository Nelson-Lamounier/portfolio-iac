# CloudFormation Export Dependency Fix

## Problem

When trying to redeploy `NetworkingStack-pipeline`, you may encounter this error:

```
Delete canceled. Cannot delete export NetworkingStack-pipeline:ExportsOutputRefVpcPrivateSubnet2SubnetC8EB537DECE890BB 
as it is in use by MonitoringInfraStack-pipeline.
```

## Root Cause

CDK automatically creates CloudFormation exports when you use cross-stack references (e.g., `vpc: networkingStack.vpc`). When `NetworkingStack` tries to update and remove or rename a subnet, CloudFormation attempts to delete the old export. However, if `MonitoringInfraStack` (or other stacks) are still importing that export, CloudFormation prevents the deletion to avoid breaking the dependent stack.

## Why This Happens

1. **Automatic Exports**: CDK creates exports automatically for cross-stack references
2. **Subnet Changes**: If subnet configuration changes (e.g., from 2 subnets to 1, or subnet indexing changes), old exports need to be deleted
3. **Dependency Chain**: `MonitoringInfraStack` → imports from → `NetworkingStack`
4. **Update Order**: CloudFormation requires dependent stacks to update first before base stacks can delete exports

## Solution

### Automatic Solution (Pipeline)

The deployment pipeline now includes a pre-deployment step that:
1. Checks for export dependencies before updating `NetworkingStack`
2. Updates dependent stacks (`MonitoringInfraStack`, `MonitoringEfsStack`) first to refresh their imports
3. Then updates `NetworkingStack` safely

This is handled automatically in the `deploy-networking` job.

### Manual Solution (If Pipeline Fails)

If the automatic solution doesn't work or you're deploying manually, follow these steps:

#### Option 1: Update Dependent Stacks First (Recommended)

```bash
# 1. Update MonitoringInfraStack first (refreshes imports)
ENVIRONMENT=pipeline yarn cdk deploy MonitoringInfraStack-pipeline --require-approval never

# 2. Update MonitoringEfsStack (if it also imports from NetworkingStack)
ENVIRONMENT=pipeline yarn cdk deploy MonitoringEfsStack-pipeline --require-approval never

# 3. Now update NetworkingStack (can safely delete old exports)
ENVIRONMENT=pipeline yarn cdk deploy NetworkingStack-pipeline --require-approval never

# 4. Update dependent stacks again if needed (to use new exports)
ENVIRONMENT=pipeline yarn cdk deploy MonitoringInfraStack-pipeline --require-approval never
ENVIRONMENT=pipeline yarn cdk deploy MonitoringEfsStack-pipeline --require-approval never
```

#### Option 2: Use Stack Update with Retain Resources

If you need to update NetworkingStack immediately and can't update dependent stacks:

```bash
# This will attempt to update but may fail on export deletion
# If it fails, use Option 1
ENVIRONMENT=pipeline yarn cdk deploy NetworkingStack-pipeline --require-approval never
```

#### Option 3: Temporarily Remove Export (Advanced)

**⚠️ WARNING: Only use if you understand the implications**

```bash
# 1. Get the export name from the error message
EXPORT_NAME="NetworkingStack-pipeline:ExportsOutputRefVpcPrivateSubnet2SubnetC8EB537DECE890BB"

# 2. Find which stack is importing it
aws cloudformation list-imports \
  --export-name "$EXPORT_NAME" \
  --query 'Imports' \
  --output table

# 3. Update the importing stack to remove the import
# (This requires modifying the stack's template, not recommended)

# 4. Then update NetworkingStack
ENVIRONMENT=pipeline yarn cdk deploy NetworkingStack-pipeline --require-approval never
```

## Prevention

### Best Practices

1. **Update Order**: Always update dependent stacks before base stacks when exports are involved
2. **Avoid Breaking Changes**: When changing subnet configuration, consider:
   - Adding new subnets instead of removing old ones
   - Using consistent subnet naming/indexing
   - Using SSM Parameters instead of exports for frequently changing values
3. **Stack Dependencies**: Use `stack.addDependency()` to ensure correct deployment order

### Alternative Approaches

1. **SSM Parameters**: Use SSM Parameter Store instead of CloudFormation exports for values that change frequently
2. **Direct References**: Use direct stack references instead of exports when possible
3. **Stack Consolidation**: Consider consolidating related stacks to avoid cross-stack dependencies

## Verification

After resolving the issue, verify the stacks are in a healthy state:

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name NetworkingStack-pipeline \
  --query 'Stacks[0].StackStatus' \
  --output text

aws cloudformation describe-stacks \
  --stack-name MonitoringInfraStack-pipeline \
  --query 'Stacks[0].StackStatus' \
  --output text

# Check exports
aws cloudformation list-exports \
  --query "Exports[?starts_with(Name, 'NetworkingStack-pipeline')]" \
  --output table
```

## Related Files

- `.github/workflows/deploy-pipeline.yml` - Pipeline with automatic export dependency handling
- `.github/actions/deploy-cdk-stack/action.yml` - Deployment action with error handling
- `infrastructure/bin/app.ts` - Stack definitions and dependencies
- `infrastructure/lib/stacks/networking/networking-stack.ts` - NetworkingStack definition

## Additional Resources

- [AWS CloudFormation Exports Documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-stack-exports.html)
- [CDK Cross-Stack References](https://docs.aws.amazon.com/cdk/v2/guide/cross_stack.html)

