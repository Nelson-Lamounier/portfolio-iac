/** @format */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

export interface CrossAccountMonitoringRoleProps {
  /**
   * Environment name (development, staging, production)
   */
  envName: string;

  /**
   * Pipeline account ID that will access monitoring data
   */
  pipelineAccountId: string;

  /**
   * Enable CloudWatch permissions
   * @default true
   */
  enableCloudWatch?: boolean;

  /**
   * Enable ECS permissions
   * @default true
   */
  enableEcsAccess?: boolean;

  /**
   * Enable EC2 permissions for service discovery
   * @default true
   */
  enableEc2ServiceDiscovery?: boolean;
}

/**
 * Cross-Account Monitoring IAM Role
 *
 * Creates an IAM role that allows the pipeline account to access monitoring data
 * in application accounts (dev, staging, production).
 *
 * This role should be deployed in the APPLICATION accounts, not in the pipeline account.
 *
 * Permissions granted:
 * - CloudWatch: Read metrics, logs, and alarms
 * - ECS: Describe clusters, services, and tasks
 * - EC2: Service discovery for Prometheus scraping
 *
 * Usage:
 * ```typescript
 * const role = new CrossAccountMonitoringRole(this, 'MonitoringRole', {
 *   envName: 'development',
 *   pipelineAccountId: '123456789012',
 * });
 * ```
 */
export class CrossAccountMonitoringRole extends Construct {
  public readonly role: iam.Role;
  public readonly roleArn: string;

  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountMonitoringRoleProps
  ) {
    super(scope, id);

    const {
      envName,
      pipelineAccountId,
      enableCloudWatch = true,
      enableEcsAccess = true,
      enableEc2ServiceDiscovery = true,
    } = props;

    // ========================================================================
    // IAM ROLE FOR CROSS-ACCOUNT ACCESS
    // ========================================================================
    this.role = new iam.Role(this, "Role", {
      roleName: `${envName}-PipelineMonitoringAccess`,
      assumedBy: new iam.AccountPrincipal(pipelineAccountId),
      description: `Allow pipeline account to read monitoring data from ${envName} environment`,
      maxSessionDuration: cdk.Duration.hours(12),
    });

    // CloudWatch permissions
    if (enableCloudWatch) {
      this.role.addToPolicy(
        new iam.PolicyStatement({
          sid: "CloudWatchMetricsAccess",
          effect: iam.Effect.ALLOW,
          actions: [
            "cloudwatch:GetMetricData",
            "cloudwatch:GetMetricStatistics",
            "cloudwatch:ListMetrics",
            "cloudwatch:DescribeAlarms",
            "cloudwatch:DescribeAlarmsForMetric",
          ],
          resources: ["*"],
        })
      );

      this.role.addToPolicy(
        new iam.PolicyStatement({
          sid: "CloudWatchLogsAccess",
          effect: iam.Effect.ALLOW,
          actions: [
            "logs:FilterLogEvents",
            "logs:GetLogEvents",
            "logs:DescribeLogGroups",
            "logs:DescribeLogStreams",
          ],
          resources: [
            `arn:aws:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:/ecs/*`,
            `arn:aws:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:/aws/ecs/*`,
          ],
        })
      );
    }

    // ECS permissions
    if (enableEcsAccess) {
      this.role.addToPolicy(
        new iam.PolicyStatement({
          sid: "EcsServiceDiscovery",
          effect: iam.Effect.ALLOW,
          actions: [
            "ecs:DescribeClusters",
            "ecs:DescribeServices",
            "ecs:DescribeTasks",
            "ecs:DescribeTaskDefinition",
            "ecs:DescribeContainerInstances",
            "ecs:ListClusters",
            "ecs:ListServices",
            "ecs:ListTasks",
            "ecs:ListContainerInstances",
          ],
          resources: ["*"],
        })
      );
    }

    // EC2 permissions for Prometheus service discovery
    if (enableEc2ServiceDiscovery) {
      this.role.addToPolicy(
        new iam.PolicyStatement({
          sid: "Ec2ServiceDiscovery",
          effect: iam.Effect.ALLOW,
          actions: [
            "ec2:DescribeInstances",
            "ec2:DescribeInstanceStatus",
            "ec2:DescribeTags",
            "ec2:DescribeRegions",
            "ec2:DescribeAvailabilityZones",
          ],
          resources: ["*"],
        })
      );
    }

    this.roleArn = this.role.roleArn;

    // ========================================================================
    // CDK NAG SUPPRESSIONS
    // ========================================================================
    // These wildcards are required for monitoring operations:
    // - CloudWatch metrics/alarms APIs require resource: "*"
    // - ECS describe/list APIs require resource: "*"
    // - EC2 describe APIs require resource: "*"
    // - Log groups use wildcards to cover all ECS-related logs
    NagSuppressions.addResourceSuppressions(
      this.role,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "CloudWatch GetMetricData, ListMetrics, and DescribeAlarms APIs require resource: * as they operate across all metrics/alarms. See: https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazoncloudwatch.html",
          appliesTo: ["Resource::*"],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "ECS describe and list APIs require resource: * for service discovery across all clusters. See: https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonelasticcontainerservice.html",
          appliesTo: ["Resource::*"],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "EC2 describe APIs require resource: * for Prometheus service discovery. See: https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonec2.html",
          appliesTo: ["Resource::*"],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "CloudWatch Logs access uses /ecs/* and /aws/ecs/* patterns to cover all ECS application and Container Insights log groups without hardcoding specific names",
          appliesTo: [
            `Resource::arn:aws:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:/ecs/*`,
            `Resource::arn:aws:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:/aws/ecs/*`,
          ],
        },
      ],
      true // Apply to children (DefaultPolicy)
    );

    // ========================================================================
    // TAGS
    // ========================================================================
    // Note: CfnOutput is created by the parent construct (CrossAccountMonitoringAccessConstruct)
    // to avoid duplicate exports when this role is used as a child construct
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("Purpose", "CrossAccountMonitoring");
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}
