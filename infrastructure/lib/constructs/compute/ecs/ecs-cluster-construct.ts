/** @format */

import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
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

  /**
   * EC2 instance type for the Auto Scaling Group
   * @default t3.micro
   */
  instanceType?: ec2.InstanceType;

  /**
   * Minimum number of instances
   * @default 1
   */
  minCapacity?: number;

  /**
   * Maximum number of instances
   * @default 1
   */
  maxCapacity?: number;

  /**
   * Desired number of instances
   * @default 1
   */
  desiredCapacity?: number;

  /**
   * Whether to use public subnets
   * @default false
   */
  usePublicSubnets?: boolean;
}

/**
 * Construct for creating an ECS cluster with Auto Scaling Group for EC2 capacity
 */
export class EcsClusterConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly logGroup: logs.LogGroup;
  public readonly asg: autoscaling.AutoScalingGroup;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: EcsClusterConstructProps) {
    super(scope, id);

    const {
      vpc,
      envName,
      enableContainerInsights = true,
      enableExecuteCommand = true,
      logRetention = logs.RetentionDays.TWO_WEEKS,
      clusterName = `${envName}-cluster`,
      instanceType = new ec2.InstanceType("t3.micro"),
      minCapacity = 1,
      maxCapacity = 1,
      desiredCapacity = 1,
      usePublicSubnets = false,
    } = props;

    // Create CloudWatch log group for cluster
    this.logGroup = new logs.LogGroup(this, "ClusterLogGroup", {
      logGroupName: `/aws/ecs/cluster/${clusterName}`,
      retention: logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create ECS cluster
    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName,
      containerInsights: enableContainerInsights,
      enableFargateCapacityProviders: false, // Using EC2 for compute
      executeCommandConfiguration: enableExecuteCommand
        ? {
            logging: ecs.ExecuteCommandLogging.OVERRIDE,
            logConfiguration: {
              cloudWatchLogGroup: this.logGroup,
            },
          }
        : undefined,
    });

    // Create security group for ECS instances
    this.securityGroup = new ec2.SecurityGroup(this, "InstanceSecurityGroup", {
      vpc,
      description: `Security group for ${envName} ECS instances`,
      allowAllOutbound: true,
    });

    // Create IAM role for EC2 instances
    const instanceRole = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonEC2ContainerServiceforEC2Role"
        ),
      ],
    });

    // Create user data for ECS instances
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      `echo ECS_CLUSTER=${clusterName} >> /etc/ecs/ecs.config`,
      "echo ECS_ENABLE_CONTAINER_METADATA=true >> /etc/ecs/ecs.config",
      "echo ECS_ENABLE_TASK_IAM_ROLE=true >> /etc/ecs/ecs.config",
      "yum update -y",
      "yum install -y amazon-cloudwatch-agent",
      "systemctl enable ecs",
      "systemctl start ecs"
    );

    // Create launch template
    const launchTemplate = new ec2.LaunchTemplate(this, "LaunchTemplate", {
      instanceType,
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      userData,
      role: instanceRole,
      securityGroup: this.securityGroup,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: autoscaling.BlockDeviceVolume.ebs(30, {
            volumeType: autoscaling.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });

    // Create Auto Scaling Group
    this.asg = new autoscaling.AutoScalingGroup(this, "AutoScalingGroup", {
      vpc,
      launchTemplate,
      minCapacity,
      maxCapacity,
      desiredCapacity,
      vpcSubnets: {
        subnetType: usePublicSubnets
          ? ec2.SubnetType.PUBLIC
          : ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      healthCheck: autoscaling.HealthCheck.ec2({
        grace: cdk.Duration.seconds(300),
      }),
    });

    // Add capacity provider to cluster
    const capacityProvider = new ecs.AsgCapacityProvider(
      this,
      "CapacityProvider",
      {
        autoScalingGroup: this.asg,
        enableManagedScaling: true,
        enableManagedTerminationProtection: false,
      }
    );

    this.cluster.addAsgCapacityProvider(capacityProvider);

    // Add tags
    cdk.Tags.of(this.cluster).add("Name", clusterName);
    cdk.Tags.of(this.cluster).add("Environment", envName);
    cdk.Tags.of(this.cluster).add("ManagedBy", "CDK");

    cdk.Tags.of(this.asg).add("Name", `${envName}-asg`);
    cdk.Tags.of(this.asg).add("Environment", envName);
    cdk.Tags.of(this.asg).add("ManagedBy", "CDK");

    // Output cluster information
    new cdk.CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      description: `ECS Cluster name for ${envName}`,
      exportName: `${cdk.Stack.of(this).stackName}-cluster-name`,
    });

    new cdk.CfnOutput(this, "ClusterArn", {
      value: this.cluster.clusterArn,
      description: `ECS Cluster ARN for ${envName}`,
      exportName: `${cdk.Stack.of(this).stackName}-cluster-arn`,
    });
  }

  /**
   * Allow internal traffic on a specific port
   */
  public allowInternalPort(port: number, description: string): void {
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(this.cluster.vpc.vpcCidrBlock),
      ec2.Port.tcp(port),
      description
    );
  }
}
