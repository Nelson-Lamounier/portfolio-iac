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
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { SuppressionManager } from "../../cdk-nag";
import { MonitoringConfigBucketConstruct } from "../../constructs/monitoring";
import { MinimalUserDataConstruct } from "../../constructs/compute/user-data/minimal-user-data-construct";
import { ApplicationSetupLambdaConstruct } from "../../constructs/monitoring/application-setup-lambda-construct";
import { EcsClusterConstruct } from "../../constructs/compute/ecs";
import { LaunchTemplateConstruct } from "../../constructs/compute/launch-template";
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
    // MINIMAL USER DATA FOR EC2 INSTANCES (Infrastructure Registration Only)
    // ========================================================================
    // Phase 1: Minimal user data that only handles SSM + ECS registration
    // Goal: Get instance into ECS cluster ASAP (~2-3KB, well under 16KB limit)
    // Phase 2: Application setup (EFS, Prometheus, Grafana) handled by Lambda
    // ========================================================================
    const clusterName = `${envName}-monitoring-cluster`;
    const userDataConstruct = new MinimalUserDataConstruct(
      this,
      "UserData",
      {
        envName,
        clusterName,
      }
    );

    // ========================================================================
    // ECS CLUSTER
    // ========================================================================
    const ltConstruct = new LaunchTemplateConstruct(
      this,
      "MonitoringInfraLaunchTemplate",
      {
        vpc,
        envName,
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.SMALL
        ),
        machineImage: ecs.EcsOptimizedImage.amazonLinux2023(),
        userData: userDataConstruct.userData,
        associatePublicIpAddress: true,
        // Attach any additional security groups needed by the instances (e.g., EFS SG)
        securityGroups: [efsSecurityGroup],
      }
    );

    // Required for ECS EC2 container instances
    ltConstruct.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEC2ContainerServiceforEC2Role"
      )
    );

    // Add EFS permissions to the INSTANCE role (not ASG role)
    // Instances need these permissions to mount EFS volumes
    ltConstruct.role.addToPrincipalPolicy(
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

    // Add SSM permissions to the INSTANCE role (instances need this to read SSM parameters)
    ltConstruct.role.addToPrincipalPolicy(
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

    // CDK Nag suppressions for AWS managed policies on the Launch Template instance role.
    // These are standard AWS-managed policies required for SSM + CloudWatch + ECS container instances.
    NagSuppressions.addResourceSuppressions(ltConstruct.role, [
      {
        id: "AwsSolutions-IAM4",
        reason:
          "ECS monitoring instances require AWS managed policies for SSM, CloudWatch Agent, and ECS EC2 registration.",
        appliesTo: [
          "Policy::arn:<AWS::Partition>:iam::aws:policy/AmazonSSMManagedInstanceCore",
          "Policy::arn:<AWS::Partition>:iam::aws:policy/CloudWatchAgentServerPolicy",
          "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
        ],
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "SSM parameter access uses wildcard to allow reading monitoring configuration parameters. EFS access uses wildcard for mount operations.",
        appliesTo: [
          "Action::ssm:GetParameter",
          "Action::ssm:GetParameters",
          "Action::ssm:GetParametersByPath",
        ],
      },
    ]);

    const ecsClusterConstruct = new EcsClusterConstruct(this, "EcsCluster", {
      vpc,
      envName,
      enableContainerInsights: true,
      enableExecuteCommand: true,
      logRetention: logs.RetentionDays.TWO_WEEKS,
      clusterName,
      customLaunchTemplate: ltConstruct.launchTemplate,
      // Explicitly set capacity to ensure at least one instance launches
      // This is critical - without this, managed scaling might not launch instances
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      usePublicSubnets: true, // Use public subnets to match EFS mount target location
    });

    this.cluster = ecsClusterConstruct.cluster;

    // ========================================================================
    // AUTO SCALING GROUP
    // ========================================================================
    // Use the ASG from the ECS cluster construct (avoids duplicate ASGs)
    this.autoScalingGroup = ecsClusterConstruct.asg;

    // NOTE: EFS and SSM permissions are added to the INSTANCE role (ltConstruct.role)
    // above, not the ASG role. The ASG role is only for Auto Scaling lifecycle operations.
    // The instance role (from launch template) is what EC2 instances actually use.

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
      enableHttp: true,
      enableHttps: enableHttps,
      certificateArn: enableHttps ? certificateArn : undefined,
      redirectHttpToHttps: enableHttps,
    });

    this.listener = listenerConstruct.listener;

    // ========================================================================
    // SECURITY GROUP RULES: Allow ALB to reach containers on instances
    // ========================================================================
    // CRITICAL: EC2 instances need inbound rules to allow ALB health checks and traffic
    // - Grafana uses bridge networking with dynamic ports (32768-65535)
    // - Prometheus uses fixed port 9090
    // Without these rules, ALB health checks will timeout and tasks will be marked unhealthy
    const albSecurityGroup = this.loadBalancer.connections.securityGroups[0];
    
    // Allow ALB to reach Grafana on dynamic ports (bridge networking)
    // ECS automatically registers the dynamic port (32768-65535) with the target group
    // The target group port (3000) is just a hint - ECS uses the actual dynamic port
    ltConstruct.securityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcpRange(32768, 65535),
      "Allow ALB to reach Grafana containers on dynamic ports (bridge networking)"
    );
    
    // Allow ALB to reach Prometheus on fixed port 9090
    ltConstruct.securityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(9090),
      "Allow ALB to reach Prometheus on port 9090"
    );

    // ========================================================================
    // APPLICATION SETUP LAMBDA (Phase 2: Application Setup)
    // ========================================================================
    // Handles EFS mounting, Prometheus, Grafana configuration after instance registers
    // Triggered by EventBridge rule when container instance registers with ECS
    // ========================================================================
    const applicationSetupLambda = new ApplicationSetupLambdaConstruct(
      this,
      "ApplicationSetupLambda",
      {
        clusterName: this.cluster.clusterName,
        fileSystemId: fileSystem.fileSystemId,
        efsStackName,
        region: cdk.Stack.of(this).region,
        envName,
      }
    );

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
    // Note: This dependency ensures EFS is ready, but the ASG will still launch instances
    // based on desiredCapacity. The dependency only affects CloudFormation deployment order.
    this.cluster.node.addDependency(efsInitializationComplete);
    // Only add dependency to ASG if EFS is actually being used
    // This prevents blocking instance launch if EFS initialization fails
    if (efsInitializationComplete) {
      this.autoScalingGroup.node.addDependency(efsInitializationComplete);
    }

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

    // Diagnostic outputs for troubleshooting container instance registration
    new cdk.CfnOutput(this, "AutoScalingGroupName", {
      value: this.autoScalingGroup.autoScalingGroupName,
      description:
        "Auto Scaling Group name - check this in EC2 Auto Scaling console to verify instances are launching",
      exportName: `${this.stackName}-asg-name`,
    });

    new cdk.CfnOutput(this, "AutoScalingGroupArn", {
      value: this.autoScalingGroup.autoScalingGroupArn,
      description: "Auto Scaling Group ARN for troubleshooting",
    });

    // Diagnostic outputs for container instance registration troubleshooting
    new cdk.CfnOutput(this, "LaunchTemplateInstanceRoleArn", {
      value: ltConstruct.role.roleArn,
      description:
        "IAM Role ARN used by EC2 instances - verify this is attached to instances",
      exportName: `${this.stackName}-instance-role-arn`,
    });

    new cdk.CfnOutput(this, "ExpectedClusterName", {
      value: clusterName,
      description:
        "Expected ECS cluster name - verify this matches /etc/ecs/ecs.config on instances",
      exportName: `${this.stackName}-expected-cluster-name`,
    });

    new cdk.CfnOutput(this, "LaunchTemplateId", {
      value: ltConstruct.launchTemplate.launchTemplateId ?? "Not available",
      description:
        "Launch Template ID - verify instances are using this template",
      exportName: `${this.stackName}-launch-template-id`,
    });

    new cdk.CfnOutput(this, "InstanceSecurityGroupId", {
      value: ltConstruct.securityGroup.securityGroupId,
      description:
        "Instance Security Group ID - verify this SG has outbound rules (allowAllOutbound: true)",
      exportName: `${this.stackName}-instance-sg-id`,
    });

    // Note: Capacity provider name is auto-generated by CDK
    // Check ECS console → Cluster → Capacity Providers tab to see the actual name
  }
}
