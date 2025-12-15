/** @format */

import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
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

  /**
   * Additional security groups to attach to the instances
   * @default []
   */
  additionalSecurityGroups?: ec2.ISecurityGroup[];

  /**
   * Custom launch template to use instead of creating a default one
   * If provided, instanceType and other launch template related props are ignored
   * @default undefined (creates default launch template)
   */
  customLaunchTemplate?: ec2.ILaunchTemplate;
}

/**
 * Construct for creating an ECS cluster with Auto Scaling Group for EC2 capacity
 */
export class EcsClusterConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly logGroup: logs.LogGroup;
  public readonly asg: autoscaling.AutoScalingGroup;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly launchTemplate: ec2.ILaunchTemplate;

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
      additionalSecurityGroups = [],
      customLaunchTemplate,
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
      containerInsightsV2: enableContainerInsights
        ? ecs.ContainerInsights.ENABLED
        : ecs.ContainerInsights.DISABLED,
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

    // Create security group for ECS instances (only if not using custom launch template)
    this.securityGroup = new ec2.SecurityGroup(this, "InstanceSecurityGroup", {
      vpc,
      description: `Security group for ${envName} ECS instances`,
      allowAllOutbound: true,
    });

    // Use custom launch template if provided, otherwise create default one
    if (customLaunchTemplate) {
      this.launchTemplate = customLaunchTemplate;
    } else {
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

      // Suppress CDK Nag warnings for AWS managed policies
      // These are standard AWS managed policies required for ECS instances
      NagSuppressions.addResourceSuppressions(instanceRole, [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AWS managed policies are required for ECS instances to function properly",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/AmazonSSMManagedInstanceCore",
            "Policy::arn:<AWS::Partition>:iam::aws:policy/CloudWatchAgentServerPolicy",
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
          ],
        },
      ]);

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

      // Create default launch template
      this.launchTemplate = new ec2.LaunchTemplate(this, "LaunchTemplate", {
        instanceType,
        machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
        userData,
        role: instanceRole,
        // Use securityGroup (singular) if no additional groups, securityGroups (plural) if additional groups
        ...(additionalSecurityGroups.length > 0
          ? {
              securityGroups: [this.securityGroup, ...additionalSecurityGroups],
            }
          : { securityGroup: this.securityGroup }),
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
    }

    // Create Auto Scaling Group
    this.asg = new autoscaling.AutoScalingGroup(this, "AutoScalingGroup", {
      vpc,
      launchTemplate: this.launchTemplate,
      minCapacity,
      maxCapacity,
      desiredCapacity,
      vpcSubnets: {
        subnetType: usePublicSubnets
          ? ec2.SubnetType.PUBLIC
          : ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      healthChecks: autoscaling.HealthChecks.ec2({
        gracePeriod: cdk.Duration.seconds(300),
      }),
    });

    // CDK Nag suppressions for Auto Scaling Group and its resources
    NagSuppressions.addResourceSuppressions(
      this.asg,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "Auto Scaling Group lifecycle hooks require wildcard permissions for Auto Scaling Group ARNs. This is required by CDK for ECS cluster lifecycle management and cannot be scoped further.",
          appliesTo: [
            "Resource::arn:aws:autoscaling:*:*:autoScalingGroup:*:autoScalingGroupName/*",
          ],
        },
        {
          id: "AwsSolutions-SNS3",
          reason:
            "SNS topic SSL/TLS enforcement is not configured for CDK-managed topics used by Auto Scaling lifecycle hooks. These topics are internal to AWS services and use AWS's internal secure communication. For custom SNS topics, SSL/TLS should be enforced.",
        },
      ],
      true
    );

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

    // Note: Outputs are handled at the stack level to avoid cyclic dependencies
    // The stack that uses this construct should create the necessary outputs
  }

  /**
   * Allow internal traffic on a specific port
   */
  public allowInternalPort(
    port: number,
    description: string,
    cidr?: string
  ): void {
    // Use provided CIDR or a default to avoid cyclic dependencies
    const vpcCidr = cidr || "10.0.0.0/16";
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(vpcCidr),
      ec2.Port.tcp(port),
      description
    );
  }
}
