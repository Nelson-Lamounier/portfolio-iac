/** @format */

import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as efs from "aws-cdk-lib/aws-efs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as events from "aws-cdk-lib/aws-events";
import * as events_targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

import { SuppressionManager } from "../../cdk-nag";
import { MonitoringConfigBucketConstruct } from "../../constructs/monitoring";
import { MonitoringUserDataConstruct } from "../../constructs/compute/user-data/monitoring-user-data-construct";
import { EcsClusterConstruct } from "../../constructs/compute/ecs";
import {
  ApplicationLoadBalancerConstruct,
  AlbListenerConstruct,
} from "../../constructs/networking/alb";

/**
 * LAYER 1: Monitoring Infrastructure Stack (Refactored)
 *
 * This stack contains long-lived infrastructure resources using standardized
 * constructs following DevOps best practices:
 * - ECS Cluster with Container Insights
 * - EC2 Auto Scaling Group with proper configuration
 * - Application Load Balancer with listeners
 * - Security Groups and IAM Roles
 * - CloudWatch Log Groups
 *
 * Deploy: Only when infrastructure changes (rare)
 * Depends on: NetworkingStack, MonitoringEfsStack
 */
export interface MonitoringInfraStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  envName: string;
  efsStackName: string;
  allowedIpRanges?: string[];
  certificateArn?: string;
  enableHttps?: boolean;
  enableAccessLogs?: boolean;
  // External EFS resources (from MonitoringEfsStack)
  fileSystem: efs.IFileSystem;
  efsAccessPoint: efs.IAccessPoint;
  efsAvailabilityZone: string;
  efsSecurityGroup: ec2.ISecurityGroup;
  efsInitializationComplete: cdk.CustomResource;
}

export class MonitoringInfraStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly autoScalingGroup: autoscaling.AutoScalingGroup;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly listener: elbv2.ApplicationListener;
  public readonly taskLogGroup: logs.LogGroup;
  public readonly eventLogGroup: logs.LogGroup;
  public readonly configBucket: MonitoringConfigBucketConstruct;

  constructor(scope: Construct, id: string, props: MonitoringInfraStackProps) {
    super(scope, id, props);

    const {
      vpc,
      envName,
      efsStackName,
      // allowedIpRanges = ["0.0.0.0/0"], // Not used in current implementation
      certificateArn,
      enableHttps = false,
      enableAccessLogs = false,
      fileSystem,
      // efsAccessPoint, // Not used in current implementation
      // efsAvailabilityZone, // Not used in current implementation
      efsSecurityGroup,
      efsInitializationComplete,
    } = props;

    // ========================================================================
    // CLOUDWATCH LOG GROUPS
    // ========================================================================
    this.taskLogGroup = new logs.LogGroup(this, "TaskLogGroup", {
      logGroupName: `/ecs/${this.stackName}/tasks`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.eventLogGroup = new logs.LogGroup(this, "EventLogGroup", {
      logGroupName: `/ecs/${this.stackName}/events`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================================================
    // ECS CLUSTER
    // ========================================================================
    const ecsClusterConstruct = new EcsClusterConstruct(this, "EcsCluster", {
      vpc,
      envName,
      enableContainerInsights: true,
      enableExecuteCommand: true,
      logRetention: logs.RetentionDays.TWO_WEEKS,
      clusterName: `${envName}-monitoring-cluster`,
    });

    this.cluster = ecsClusterConstruct.cluster;

    // ========================================================================
    // USER DATA FOR EC2 INSTANCES
    // ========================================================================
    const userDataConstruct = new MonitoringUserDataConstruct(
      this,
      "UserData",
      {
        clusterName: this.cluster.clusterName,
        fileSystemId: fileSystem.fileSystemId,
        efsStackName,
        envName,
        region: cdk.Stack.of(this).region,
        enableEfsMount: true,
        enableEcsAgent: true,
      }
    );

    // ========================================================================
    // AUTO SCALING GROUP
    // ========================================================================
    // Use cluster.addCapacity to match original implementation (creates LaunchConfiguration)
    this.autoScalingGroup = this.cluster.addCapacity("MonitoringCapacity", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: autoscaling.BlockDeviceVolume.ebs(30, {
            volumeType: autoscaling.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
    });

    // Add EFS security group to ASG
    this.autoScalingGroup.addSecurityGroup(efsSecurityGroup);

    // Add EFS permissions to ASG role
    this.autoScalingGroup.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:ClientRootAccess",
        ],
        resources: [fileSystem.fileSystemArn],
      })
    );

    // Add SSM permissions to ASG role
    this.autoScalingGroup.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
        ],
        resources: ["*"],
      })
    );

    // Apply user data to the Auto Scaling Group
    userDataConstruct.applyToAutoScalingGroup(this.autoScalingGroup);

    // ========================================================================
    // APPLICATION LOAD BALANCER
    // ========================================================================
    const albConstruct = new ApplicationLoadBalancerConstruct(
      this,
      "ApplicationLoadBalancer",
      {
        vpc,
        envName,
        internetFacing: true,
        enableAccessLogs,
        idleTimeout: cdk.Duration.seconds(60),
        deletionProtection: false,
        loadBalancerName: `${envName}-monitoring-alb`,
      }
    );

    this.loadBalancer = albConstruct.loadBalancer;

    // ========================================================================
    // ALB LISTENER
    // ========================================================================
    const listenerConstruct = new AlbListenerConstruct(this, "AlbListener", {
      loadBalancer: this.loadBalancer,
      envName,
      port: enableHttps ? 443 : 80,
      protocol: enableHttps
        ? elbv2.ApplicationProtocol.HTTPS
        : elbv2.ApplicationProtocol.HTTP,
      certificateArn: enableHttps ? certificateArn : undefined,
      redirectToHttps: false,
    });

    this.listener = listenerConstruct.listener;

    // Add HTTP to HTTPS redirect if HTTPS is enabled
    if (enableHttps) {
      new AlbListenerConstruct(this, "HttpRedirectListener", {
        loadBalancer: this.loadBalancer,
        envName,
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        redirectToHttps: true,
      });
    }

    // ========================================================================
    // CONFIGURATION BUCKET
    // ========================================================================
    this.configBucket = new MonitoringConfigBucketConstruct(
      this,
      "ConfigBucket",
      {
        envName,
        enableVersioning: true,
      }
    );

    // ========================================================================
    // CLOUDWATCH EVENT RULE FOR ECS EVENTS
    // ========================================================================
    new events.Rule(this, "EcsEventRule", {
      description: "Capture ECS task state changes for monitoring",
      eventPattern: {
        source: ["aws.ecs"],
        detailType: [
          "ECS Task State Change",
          "ECS Container Instance State Change",
          "ECS Service Action",
        ],
        detail: {
          clusterArn: [this.cluster.clusterArn],
        },
      },
      targets: [new events_targets.CloudWatchLogGroup(this.eventLogGroup)],
    });

    // ========================================================================
    // DEPENDENCIES
    // ========================================================================
    // Ensure EFS initialization completes before creating infrastructure
    this.cluster.node.addDependency(efsInitializationComplete);
    this.autoScalingGroup.node.addDependency(efsInitializationComplete);

    // ========================================================================
    // CDK NAG SUPPRESSIONS & TAGS
    // ========================================================================
    SuppressionManager.applyToStack(this, "MonitoringInfraStack", envName);
    cdk.Tags.of(this).add("Stack", "MonitoringInfra");
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("Layer", "Infrastructure");
    cdk.Tags.of(this).add("ManagedBy", "CDK");

    // ========================================================================
    // STACK OUTPUTS
    // ========================================================================
    new cdk.CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      description: "ECS Cluster name for monitoring services",
      exportName: `${this.stackName}-cluster-name`,
    });

    new cdk.CfnOutput(this, "ClusterArn", {
      value: this.cluster.clusterArn,
      description: "ECS Cluster ARN for monitoring services",
      exportName: `${this.stackName}-cluster-arn`,
    });

    new cdk.CfnOutput(this, "LoadBalancerArn", {
      value: this.loadBalancer.loadBalancerArn,
      description: "Application Load Balancer ARN",
      exportName: `${this.stackName}-alb-arn`,
    });

    new cdk.CfnOutput(this, "LoadBalancerDns", {
      value: this.loadBalancer.loadBalancerDnsName,
      description: "Application Load Balancer DNS name",
      exportName: `${this.stackName}-alb-dns`,
    });

    new cdk.CfnOutput(this, "ListenerArn", {
      value: this.listener.listenerArn,
      description: "ALB Listener ARN for monitoring services",
      exportName: `${this.stackName}-listener-arn`,
    });

    new cdk.CfnOutput(this, "MonitoringUrl", {
      value: `http${enableHttps ? "s" : ""}://${this.loadBalancer.loadBalancerDnsName}`,
      description: "Base URL for monitoring services",
      exportName: `${this.stackName}-monitoring-url`,
    });

    new cdk.CfnOutput(this, "PrometheusUrl", {
      value: `http${enableHttps ? "s" : ""}://${this.loadBalancer.loadBalancerDnsName}/prometheus`,
      description: "Prometheus URL",
      exportName: `${this.stackName}-prometheus-url`,
    });

    new cdk.CfnOutput(this, "GrafanaUrl", {
      value: `http${enableHttps ? "s" : ""}://${this.loadBalancer.loadBalancerDnsName}/grafana`,
      description: "Grafana URL",
      exportName: `${this.stackName}-grafana-url`,
    });
  }
}
