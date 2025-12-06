<!-- @format -->

# IAM Constructs

Centralized location for all IAM roles and policies used across the infrastructure.

## Organization

All IAM-related constructs are organized in this folder for:

- ✅ Better discoverability
- ✅ Easier auditing
- ✅ Consistent security patterns
- ✅ Simplified compliance reviews

## Available Constructs

### Cross-Account Roles

#### CrossAccountMonitoringRole

**File:** `cross-account-monitoring-role.ts`

Creates an IAM role that allows the pipeline account to access monitoring data in application accounts.

**Permissions:**

- CloudWatch: Read metrics, logs, and alarms
- ECS: Describe clusters, services, and tasks
- EC2: Service discovery for Prometheus

**Usage:**

```typescript
import { CrossAccountMonitoringRole } from "./constructs/iam";

const role = new CrossAccountMonitoringRole(this, "MonitoringRole", {
  envName: "development",
  pipelineAccountId: "123456789012",
});
```

**Deployed in:** Application accounts (dev, staging, production)

---

#### VpcPeeringAcceptorRole

**File:** `vpc-peering-acceptor-role.ts`

Creates an IAM role that allows the pipeline account to accept VPC peering connections and update route tables.

**Permissions:**

- EC2: Accept VPC peering connections
- EC2: Manage routes in route tables
- EC2: Describe VPCs and subnets

**Usage:**

```typescript
import { VpcPeeringAcceptorRole } from "./constructs/iam";

const role = new VpcPeeringAcceptorRole(this, "PeeringRole", {
  requesterAccountId: "123456789012",
  envName: "development",
});
```

**Deployed in:** Application accounts (dev, staging, production)

---

#### EventBridgeCrossAccountRole

**File:** `eventbridge-cross-account-role.ts`

Creates an IAM role that allows EventBridge to send events to another account's event bus.

**Permissions:**

- EventBridge: PutEvents to target event bus

**Usage:**

```typescript
import { EventBridgeCrossAccountRole } from "./constructs/iam";

const role = new EventBridgeCrossAccountRole(this, "EventBridgeRole", {
  envName: "development",
  targetEventBusArn: "arn:aws:events:eu-west-1:123456789012:event-bus/default",
});
```

**Deployed in:** Application accounts (dev, staging, production)

---

### ECS Roles

#### EcsTaskExecutionRole

**File:** `ecs-task-execution-role.ts`

Creates an IAM role for ECS task execution with least privilege permissions.

**Permissions (configurable):**

- CloudWatch Logs: Create log streams and put log events
- ECR: Pull container images
- Secrets Manager: Get secret values (optional)
- SSM Parameter Store: Get parameters (optional)

**Usage:**

```typescript
import { EcsTaskExecutionRole } from "./constructs/iam";

const role = new EcsTaskExecutionRole(this, "ExecutionRole", {
  envName: "development",
  enableEcrAccess: true,
  enableCloudWatchLogs: true,
  enableSecretsManager: false,
  enableSsmParameters: false,
});
```

**Deployed in:** All accounts

**Note:** This is a CDK Nag compliant alternative to the AWS managed policy `AmazonECSTaskExecutionRolePolicy`.

---

## Security Best Practices

### Least Privilege

All roles follow the principle of least privilege:

- ✅ Specific actions only
- ✅ Resource-level permissions where possible
- ✅ Time-limited sessions (maxSessionDuration)
- ✅ Explicit deny not needed (implicit deny by default)

### Trust Relationships

All cross-account roles use:

- ✅ Account principals (not root)
- ✅ Specific account IDs
- ✅ No wildcard principals

### Audit Trail

All roles include:

- ✅ Descriptive role names
- ✅ Clear descriptions
- ✅ Environment tags
- ✅ Purpose tags
- ✅ CloudFormation outputs for ARNs

### CDK Nag Compliance

All roles are designed to pass CDK Nag security checks:

- ✅ No AWS managed policies (custom inline policies instead)
- ✅ Specific resource ARNs where possible
- ✅ Explicit SIDs for all policy statements
- ✅ Proper tagging

## Migration from Old Structure

### Before (Scattered)

```
infrastructure/lib/constructs/
├── monitoring/
│   └── cross-account-access-construct.ts (had IAM role)
├── networking/
│   └── vpc-peering-acceptor-role-construct.ts (had IAM role)
└── compute/
    └── ecs/
        └── ecs-task-definition-construct.ts (had IAM role)
```

### After (Centralized)

```
infrastructure/lib/constructs/
└── iam/
    ├── cross-account-monitoring-role.ts
    ├── vpc-peering-acceptor-role.ts
    ├── eventbridge-cross-account-role.ts
    ├── ecs-task-execution-role.ts
    ├── index.ts
    └── README.md (this file)
```

## Usage in Constructs

Other constructs should import and use these IAM roles:

```typescript
// In monitoring construct
import { CrossAccountMonitoringRole } from "../iam";

export class MonitoringConstruct extends Construct {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const role = new CrossAccountMonitoringRole(this, "Role", {
      envName: props.envName,
      pipelineAccountId: props.pipelineAccountId,
    });

    // Use role.role or role.roleArn
  }
}
```

## Testing

All IAM roles should be tested for:

- ✅ Correct trust relationships
- ✅ Minimum required permissions
- ✅ No overly permissive wildcards
- ✅ Proper resource restrictions

Example test:

```typescript
test("CrossAccountMonitoringRole has correct trust relationship", () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack");

  const role = new CrossAccountMonitoringRole(stack, "Role", {
    envName: "test",
    pipelineAccountId: "123456789012",
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::IAM::Role", {
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Principal: {
            AWS: "arn:aws:iam::123456789012:root",
          },
        },
      ],
    },
  });
});
```

## Compliance and Auditing

### Regular Reviews

- Review IAM roles quarterly
- Check for unused permissions
- Verify trust relationships
- Update documentation

### Audit Checklist

- [ ] All roles have descriptive names
- [ ] All roles have clear descriptions
- [ ] All roles use least privilege
- [ ] All roles have proper tags
- [ ] All cross-account roles have specific account IDs
- [ ] All roles pass CDK Nag checks
- [ ] All roles are documented in this README

## Related Documentation

- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [CDK Nag Rules](https://github.com/cdklabs/cdk-nag)
- [Cross-Account Access](../../docs/monitoring/CENTRALIZED_MONITORING_IMPLEMENTATION.md)
- [VPC Peering](../../docs/monitoring/VPC_PEERING_CDK_IMPLEMENTATION.md)

---

**Last Updated:** December 2025  
**Maintained By:** DevOps Team
