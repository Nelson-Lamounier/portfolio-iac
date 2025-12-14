/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export interface EcsClusterConstructProps {
  /**
   * VPC where the ECS cluster will be created
   */
  vpc: ec2.IVpc;

  /**
   * Environment name for resource naming and tagging
   */
  envName: string;

  /**
   * Whether to enable Container Insights
   * @default true
   */
  enableContainerInsights?: boolean;

  /**
   * Whether to enable execute command capability
   * @default true
   */
  enableExecuteCommand?: boolean;

  /**
   * CloudWatch log group retention period
   * @default logs.RetentionDays.TWO_WEEKS
   */
  logRetention?: logs.RetentionDays;

  /**
   * Custom cluster name
   * @default `${envName}-monitoring-cluster`
   */
  clusterName?: string;
}

/**
 * Construct for creating an ECS cluster with monitoring-specific configuration
 */
export class EcsClusterConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: EcsClusterConstructProps) {
    super(scope, id);

    const {
      vpc,
      envName,
      enableContainerInsights = true,
      enableExecuteCommand = true,
      logRetention = logs.RetentionDays.TWO_WEEKS,
      clusterName = `${envName}-monitoring-cluster`,
    } = props;

    // Create CloudWatch log group for cluster
    this.logGroup = new logs.LogGroup(this, "ClusterLogGroup", {
      logGroupName: `/aws/ecs/cluster/${clusterName}`,
      retention: logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create ECS cluster
    this.cluster = new ecs.Cluster(this, "MonitoringCluster", {
      vpc,
      clusterName,
      containerInsights: enableContainerInsights,
      enableFargateCapacityProviders: false, // Using EC2 for monitoring
      executeCommandConfiguration: enableExecuteCommand
        ? {
            logging: ecs.ExecuteCommandLogging.OVERRIDE,
            logConfiguration: {
              cloudWatchLogGroup: this.logGroup,
            },
          }
        : undefined,
    });

    // Add tags
    cdk.Tags.of(this.cluster).add("Name", clusterName);
    cdk.Tags.of(this.cluster).add("Environment", envName);
    cdk.Tags.of(this.cluster).add("Purpose", "MonitoringCluster");
    cdk.Tags.of(this.cluster).add("ManagedBy", "CDK");

    // Output cluster information
    new cdk.CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      description: `ECS Cluster name for ${envName} monitoring`,
      exportName: `${cdk.Stack.of(this).stackName}-cluster-name`,
    });

    new cdk.CfnOutput(this, "ClusterArn", {
      value: this.cluster.clusterArn,
      description: `ECS Cluster ARN for ${envName} monitoring`,
      exportName: `${cdk.Stack.of(this).stackName}-cluster-arn`,
    });
  }
}
