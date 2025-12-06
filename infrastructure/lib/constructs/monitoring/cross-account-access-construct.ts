/** @format */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import { Construct } from "constructs";

export interface CrossAccountMonitoringAccessProps {
  /**
   * Environment name (development, staging, production)
   */
  envName: string;

  /**
   * Pipeline account ID that will access monitoring data
   */
  pipelineAccountId: string;

  /**
   * Enable EventBridge cross-account event forwarding
   * @default true
   */
  enableEventBridge?: boolean;

  /**
   * Enable CloudWatch cross-account metric access
   * @default true
   */
  enableCloudWatch?: boolean;

  /**
   * Enable ECS cross-account access for service discovery
   * @default true
   */
  enableEcsAccess?: boolean;
}

/**
 * Cross-Account Monitoring Access Construct
 *
 * Creates IAM roles and EventBridge rules to allow the pipeline account
 * to monitor resources in application accounts (dev, staging, production).
 *
 * This construct should be deployed in the APPLICATION accounts (dev/staging/prod),
 * not in the pipeline account.
 *
 * Features:
 * - IAM role for pipeline account to assume
 * - CloudWatch metrics and logs read access
 * - ECS service discovery access
 * - EventBridge event forwarding to pipeline account
 *
 * Usage:
 * ```typescript
 * new CrossAccountMonitoringAccessConstruct(this, 'MonitoringAccess', {
 *   envName: 'development',
 *   pipelineAccountId: '123456789012',
 * });
 * ```
 */
export class CrossAccountMonitoringAccessConstruct extends Construct {
  public readonly monitoringRole: iam.Role;
  public readonly eventForwardingRule?: events.Rule;

  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountMonitoringAccessProps
  ) {
    super(scope, id);

    const {
      envName,
      pipelineAccountId,
      enableEventBridge = true,
      enableCloudWatch = true,
      enableEcsAccess = true,
    } = props;

    // ========================================================================
    // IAM ROLE FOR CROSS-ACCOUNT ACCESS
    // ========================================================================
    // This role allows the pipeline account to read monitoring data
    this.monitoringRole = new iam.Role(this, "MonitoringAccessRole", {
      roleName: `${envName}-PipelineMonitoringAccess`,
      assumedBy: new iam.AccountPrincipal(pipelineAccountId),
      description: `Allow pipeline account to read monitoring data from ${envName} environment`,
      maxSessionDuration: cdk.Duration.hours(12),
    });

    // CloudWatch permissions
    if (enableCloudWatch) {
      this.monitoringRole.addToPolicy(
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

      this.monitoringRole.addToPolicy(
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

    // ECS permissions for service discovery
    if (enableEcsAccess) {
      this.monitoringRole.addToPolicy(
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

      // EC2 permissions for Prometheus service discovery
      this.monitoringRole.addToPolicy(
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

    // ========================================================================
    // EVENTBRIDGE CROSS-ACCOUNT FORWARDING
    // ========================================================================
    // Forward ECS events to pipeline account for centralized monitoring
    if (enableEventBridge) {
      // Get the default event bus
      const defaultEventBus = events.EventBus.fromEventBusName(
        this,
        "DefaultEventBus",
        "default"
      );

      // Grant pipeline account permission to put events
      defaultEventBus.grantPutEventsTo(
        new iam.AccountPrincipal(pipelineAccountId)
      );

      // Create rule to forward ECS events to pipeline account
      this.eventForwardingRule = new events.Rule(this, "ForwardEcsEvents", {
        ruleName: `${envName}-forward-ecs-events-to-pipeline`,
        description: `Forward ECS events from ${envName} to pipeline account for centralized monitoring`,
        eventPattern: {
          source: ["aws.ecs"],
          detailType: [
            "ECS Task State Change",
            "ECS Container Instance State Change",
            "ECS Service Action",
          ],
        },
        targets: [
          new cdk.aws_events_targets.EventBus(
            events.EventBus.fromEventBusArn(
              this,
              "PipelineEventBus",
              `arn:aws:events:${cdk.Stack.of(this).region}:${pipelineAccountId}:event-bus/default`
            )
          ),
        ],
      });

      // Also forward CloudWatch alarm state changes
      new events.Rule(this, "ForwardAlarmEvents", {
        ruleName: `${envName}-forward-alarm-events-to-pipeline`,
        description: `Forward CloudWatch alarm events from ${envName} to pipeline account`,
        eventPattern: {
          source: ["aws.cloudwatch"],
          detailType: ["CloudWatch Alarm State Change"],
        },
        targets: [
          new cdk.aws_events_targets.EventBus(
            events.EventBus.fromEventBusArn(
              this,
              "PipelineEventBusAlarms",
              `arn:aws:events:${cdk.Stack.of(this).region}:${pipelineAccountId}:event-bus/default`
            )
          ),
        ],
      });
    }

    // ========================================================================
    // OUTPUTS
    // ========================================================================
    new cdk.CfnOutput(this, "MonitoringRoleArn", {
      value: this.monitoringRole.roleArn,
      description: `IAM role ARN for pipeline account to access ${envName} monitoring data`,
      exportName: `${envName}-monitoring-role-arn`,
    });

    if (this.eventForwardingRule) {
      new cdk.CfnOutput(this, "EventForwardingRuleArn", {
        value: this.eventForwardingRule.ruleArn,
        description: `EventBridge rule ARN for forwarding events to pipeline account`,
        exportName: `${envName}-event-forwarding-rule-arn`,
      });
    }

    // ========================================================================
    // TAGS
    // ========================================================================
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("Purpose", "CrossAccountMonitoring");
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}
