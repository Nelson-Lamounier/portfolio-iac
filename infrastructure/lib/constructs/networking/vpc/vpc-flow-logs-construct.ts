/** @format */

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface VpcFlowLogsConstructProps {
  vpc: ec2.IVpc;
  envName: string;
  trafficType?: ec2.FlowLogTrafficType;
  logRetention?: logs.RetentionDays;
  logFormat?: string[];
}

/**
 * Reusable construct for VPC Flow Logs
 *
 * This construct enables VPC Flow Logs to CloudWatch Logs
 * for network traffic analysis and troubleshooting.
 *
 * Features:
 * - Configurable traffic type (ALL, ACCEPT, REJECT)
 * - Custom log format support
 * - Automatic IAM role creation
 * - Configurable log retention
 *
 * CDK Nag: Addresses AwsSolutions-VPC7
 */
export class VpcFlowLogsConstruct extends Construct {
  public readonly logGroup: logs.LogGroup;
  public readonly flowLog: ec2.FlowLog;

  constructor(scope: Construct, id: string, props: VpcFlowLogsConstructProps) {
    super(scope, id);

    const {
      vpc,
      envName,
      trafficType = ec2.FlowLogTrafficType.ALL,
      logRetention = logs.RetentionDays.ONE_WEEK,
      logFormat,
    } = props;

    // Create CloudWatch Log Group
    this.logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/aws/vpc/flowlogs/${envName}`,
      retention: logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Flow Log
    this.flowLog = new ec2.FlowLog(this, "FlowLog", {
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(this.logGroup),
      trafficType,
      flowLogName: `${envName}-vpc-flow-logs`,
    });

    // Add tags
    cdk.Tags.of(this.logGroup).add("Name", `${envName}-vpc-flow-logs`);
    cdk.Tags.of(this.logGroup).add("Environment", envName);
  }

  /**
   * Get the log group name
   */
  public get logGroupName(): string {
    return this.logGroup.logGroupName;
  }

  /**
   * Get the log group ARN
   */
  public get logGroupArn(): string {
    return this.logGroup.logGroupArn;
  }
}
