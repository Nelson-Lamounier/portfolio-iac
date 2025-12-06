/** @format */

import * as cdk from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import { MonitoringConstruct } from "../../constructs/monitoring/cloudwatch/monitoring-construct";
import { EventBridgeConstruct } from "../../constructs/monitoring/cloudwatch/eventbridge-construct";

export interface MonitoringStackProps extends cdk.StackProps {
  envName: string;
  ecsClusterName: string;
  ecsServiceName: string;
  alertEmail?: string;
  enableDashboard?: boolean;
  enableEventBridge?: boolean;
  pipelineAccountId?: string;
  logRetentionDays?: logs.RetentionDays;
}

/**
 * Monitoring Stack
 *
 * Creates monitoring and observability resources including:
 * - CloudWatch alarms for ECS metrics
 * - SNS topics for alerts
 * - CloudWatch dashboards (optional)
 * - EventBridge cross-account monitoring (optional)
 *
 * This stack depends on:
 * - ComputeStack (for ECS cluster and service names)
 */
export class MonitoringStack extends cdk.Stack {
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // Create monitoring resources
    const monitoring = new MonitoringConstruct(this, "Monitoring", {
      envName: props.envName,
      ecsClusterName: props.ecsClusterName,
      ecsServiceName: props.ecsServiceName,
      alertEmail: props.alertEmail,
      enableDashboard: props.enableDashboard ?? props.envName === "production",
      logRetentionDays:
        props.logRetentionDays ||
        (props.envName === "production"
          ? logs.RetentionDays.ONE_MONTH
          : logs.RetentionDays.ONE_WEEK),
    });

    this.alarmTopic = monitoring.alarmTopic;

    // Create EventBridge cross-account monitoring (optional)
    if (props.enableEventBridge && props.pipelineAccountId) {
      new EventBridgeConstruct(this, "EventBridge", {
        envName: props.envName,
        isPipelineAccount: false,
        pipelineAccountId: props.pipelineAccountId,
        alarmTopic: monitoring.alarmTopic,
      });
    }

    // Outputs
    new cdk.CfnOutput(this, "AlarmTopicArn", {
      value: this.alarmTopic.topicArn,
      description: "SNS Topic ARN for Alarms",
      exportName: `MonitoringStack-${props.envName}-alarm-topic-arn`,
    });

    if (props.alertEmail) {
      new cdk.CfnOutput(this, "AlertEmail", {
        value: props.alertEmail,
        description: "Email address for alerts",
      });
    }

    // Tags
    cdk.Tags.of(this).add("Stack", "Monitoring");
    cdk.Tags.of(this).add("Environment", props.envName);
  }
}
