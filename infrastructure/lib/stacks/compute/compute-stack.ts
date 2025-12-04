/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as logs from "aws-cdk-lib/aws-logs";
import * as events_targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";
import {
  EcsClusterConstruct,
  EcsTaskDefinitionConstruct,
  EcsServiceConstruct,
  NodeExporterConstruct,
} from "../../constructs";

export interface ComputeStackProps extends cdk.StackProps {
  envName: string;
  vpc: ec2.IVpc;
  targetGroup?: elbv2.IApplicationTargetGroup;
  instanceType?: ec2.InstanceType;
  minCapacity?: number;
  maxCapacity?: number;
  desiredCapacity?: number;
  memoryReservationMiB?: number;
  memoryLimitMiB?: number;
  cpu?: number;
}

/**
 * Refactored Compute Stack using modular ECS constructs
 *
 * Architecture:
 * - EcsClusterConstruct: Manages cluster and Auto Scaling Group
 * - EcsTaskDefinitionConstruct: Handles task definitions and containers
 * - EcsServiceConstruct: Manages service, load balancer, and alarms
 * - NodeExporterConstruct: Provides system metrics monitoring
 *
 * Benefits:
 * - Better separation of concerns
 * - Easier to test individual components
 * - More flexible and reusable
 * - Clearer responsibilities for each construct
 *
 * This stack depends on:
 * - NetworkingStack (for VPC)
 * - ECR repository (URI stored in SSM)
 *
 * Prerequisites:
 * - ECR repository must exist
 * - ECR repository URI must be stored in SSM: /ecr/{envName}/repository-uri
 */
export class ComputeStackRefactored extends cdk.Stack {
  public readonly cluster: ecs.ICluster;
  public readonly service: ecs.IService;
  public readonly taskDefinition: ecs.Ec2TaskDefinition;

  private readonly clusterConstruct: EcsClusterConstruct;
  private readonly taskDefConstruct: EcsTaskDefinitionConstruct;
  private readonly serviceConstruct: EcsServiceConstruct;
  private readonly nodeExporterConstruct: NodeExporterConstruct;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // ========================================================================
    // 1. CONTAINER IMAGE RESOLUTION
    // ========================================================================
    // Resolve ECR repository URI from SSM Parameter Store
    // The ECR repository is created manually and its URI is stored in SSM
    // Format: {account}.dkr.ecr.{region}.amazonaws.com/{repository-name}
    const ecrRepositoryUri = ssm.StringParameter.valueFromLookup(
      this,
      `/ecr/${props.envName}/repository-uri`
    );

    // Get image tag from environment variable or use 'latest' as default
    // In CI/CD, this will be set to the git commit SHA or version tag
    const imageTag = process.env.IMAGE_TAG || "latest";

    // Construct full image URI
    const containerImage = ecs.ContainerImage.fromRegistry(
      `${ecrRepositoryUri}:${imageTag}`
    );

    // ========================================================================
    // 2. LOGGING CONFIGURATION
    // ========================================================================
    const taskLogGroup = new logs.LogGroup(this, "TaskLogs", {
      logGroupName: `/ecs/${this.stackName}/tasks`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const ecsEventLogGroup = new logs.LogGroup(this, "ECSEvents", {
      logGroupName: `/ecs/${this.stackName}/events`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================================================
    // 3. ECS CLUSTER WITH AUTO SCALING
    // ========================================================================
    this.clusterConstruct = new EcsClusterConstruct(this, "Cluster", {
      vpc: props.vpc,
      envName: props.envName,
      clusterName: `ecs-cluster-${props.envName}`,
      instanceType: props.instanceType || new ec2.InstanceType("t3.micro"),
      minCapacity: props.minCapacity ?? 1,
      maxCapacity: props.maxCapacity ?? 1,
      desiredCapacity: props.desiredCapacity ?? 1,
      usePublicSubnets: true, // No NAT gateway needed
    });

    this.cluster = this.clusterConstruct.cluster;

    // Enable Container Insights for enhanced monitoring
    const cfnCluster = this.cluster.node.defaultChild as ecs.CfnCluster;
    cfnCluster.clusterSettings = [
      {
        name: "containerInsights",
        value: "enabled",
      },
    ];

    // Configure ECS to send events to CloudWatch Logs
    // This captures ECS service events, task state changes, etc.
    new cdk.aws_events.Rule(this, "EcsEventRule", {
      description: `Capture ECS events for ${props.envName} cluster`,
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
      targets: [
        new cdk.aws_events_targets.CloudWatchLogGroup(ecsEventLogGroup),
      ],
    });

    // ========================================================================
    // 4. TASK DEFINITION WITH APPLICATION CONTAINER
    // ========================================================================
    this.taskDefConstruct = new EcsTaskDefinitionConstruct(
      this,
      "TaskDefinition",
      {
        envName: props.envName,
        networkMode: ecs.NetworkMode.BRIDGE,
        grantEcrReadAccess: true,
        containers: [
          {
            name: "app",
            image: containerImage,
            containerPort: 3000, // Next.js default port
            cpu: props.cpu,
            memoryReservationMiB: props.memoryReservationMiB ?? 384,
            memoryLimitMiB: props.memoryLimitMiB,
            logStreamPrefix: `ecs-${props.envName}`,
            environment: {
              NODE_ENV: "production",
              PORT: "3000",
            },
          },
        ],
      }
    );

    this.taskDefinition = this.taskDefConstruct.taskDefinition;

    // ========================================================================
    // 5. ECS SERVICE WITH LOAD BALANCER AND ALARMS
    // ========================================================================
    this.serviceConstruct = new EcsServiceConstruct(this, "Service", {
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      envName: props.envName,
      serviceName: `ecs-service-${props.envName}`,
      desiredCount: props.desiredCapacity ?? 1,

      // Deployment configuration
      minHealthyPercent: 0, // Allow all tasks to be stopped during initial deployment
      maxHealthyPercent: 200, // Allow up to 200% of desired count during deployment
      healthCheckGracePeriod: cdk.Duration.seconds(120),

      // Circuit breaker disabled for debugging (enable in production)
      enableCircuitBreaker: false,

      // Enable ECS Exec for troubleshooting
      enableExecuteCommand: true,

      // Placement strategies
      placementStrategies: [
        ecs.PlacementStrategy.spreadAcrossInstances(),
        ecs.PlacementStrategy.packedByCpu(),
      ],

      // Load balancer integration (if provided)
      loadBalancerTarget: props.targetGroup
        ? {
            targetGroup: props.targetGroup,
            containerName: "app",
            containerPort: 3000,
          }
        : undefined,

      // CloudWatch alarms with automatic rollback
      alarmConfig: {
        enabled: true,
        cpuThreshold: 80,
        alarmBehavior: ecs.AlarmBehavior.FAIL_ON_ALARM,
      },
    });

    this.service = this.serviceConstruct.service;

    // ========================================================================
    // 6. MONITORING WITH NODE EXPORTER
    // ========================================================================
    this.nodeExporterConstruct = new NodeExporterConstruct(
      this,
      "NodeExporter",
      {
        cluster: this.cluster,
        envName: props.envName,
        serviceName: `${props.envName}-node-exporter`,
        memoryReservationMiB: 64,
        logRetention: logs.RetentionDays.ONE_WEEK,
        enableExecuteCommand: true,
      }
    );

    // Allow Prometheus to scrape Node Exporter metrics
    this.clusterConstruct.allowInternalPort(
      NodeExporterConstruct.PORT,
      "Allow Prometheus to scrape Node Exporter metrics"
    );

    // ========================================================================
    // 7. SSM PARAMETERS FOR SERVICE DISCOVERY
    // ========================================================================
    this.createSsmParameters(props.envName);

    // ========================================================================
    // 8. CLOUDFORMATION OUTPUTS
    // ========================================================================
    this.createOutputs(
      props.envName,
      ecrRepositoryUri,
      imageTag,
      taskLogGroup,
      ecsEventLogGroup
    );

    // ========================================================================
    // 9. RESOURCE TAGGING
    // ========================================================================
    cdk.Tags.of(this).add("Stack", "Compute");
    cdk.Tags.of(this).add("Environment", props.envName);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }

  /**
   * Create SSM Parameters for resource discovery
   */
  private createSsmParameters(envName: string): void {
    new ssm.StringParameter(this, "EcsClusterNameParameter", {
      parameterName: `/ecs/${envName}/cluster-name`,
      stringValue: this.cluster.clusterName,
      description: `ECS Cluster Name for ${envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "EcsClusterArnParameter", {
      parameterName: `/ecs/${envName}/cluster-arn`,
      stringValue: this.cluster.clusterArn,
      description: `ECS Cluster ARN for ${envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "EcsServiceNameParameter", {
      parameterName: `/ecs/${envName}/service-name`,
      stringValue: this.service.serviceName,
      description: `ECS Service Name for ${envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "EcsTaskDefinitionArnParameter", {
      parameterName: `/ecs/${envName}/task-definition-arn`,
      stringValue: this.taskDefinition.taskDefinitionArn,
      description: `ECS Task Definition ARN for ${envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });
  }

  /**
   * Create CloudFormation outputs
   */
  private createOutputs(
    envName: string,
    ecrRepositoryUri: string,
    imageTag: string,
    taskLogGroup: logs.LogGroup,
    ecsEventLogGroup: logs.LogGroup
  ): void {
    new cdk.CfnOutput(this, "EcsClusterName", {
      value: this.cluster.clusterName,
      description: "ECS Cluster Name",
      exportName: `${envName}-ecs-cluster-name`,
    });

    new cdk.CfnOutput(this, "EcsClusterArn", {
      value: this.cluster.clusterArn,
      description: "ECS Cluster ARN",
      exportName: `${envName}-ecs-cluster-arn`,
    });

    new cdk.CfnOutput(this, "EcsServiceName", {
      value: this.service.serviceName,
      description: "ECS Service Name",
      exportName: `${envName}-ecs-service-name`,
    });

    new cdk.CfnOutput(this, "EcsServiceArn", {
      value: this.service.serviceArn,
      description: "ECS Service ARN",
      exportName: `${envName}-ecs-service-arn`,
    });

    new cdk.CfnOutput(this, "TaskDefinitionArn", {
      value: this.taskDefinition.taskDefinitionArn,
      description: "ECS Task Definition ARN",
    });

    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: ecrRepositoryUri,
      description: "ECR Repository URI",
      exportName: `${envName}-ecr-repository-uri`,
    });

    new cdk.CfnOutput(this, "ImageTag", {
      value: imageTag,
      description: "Container Image Tag",
      exportName: `${envName}-image-tag`,
    });

    new cdk.CfnOutput(this, "FullImageUri", {
      value: `${ecrRepositoryUri}:${imageTag}`,
      description: "Full Container Image URI",
    });

    new cdk.CfnOutput(this, "NodeExporterPort", {
      value: NodeExporterConstruct.PORT.toString(),
      description: "Node Exporter Port for Prometheus scraping",
    });

    new cdk.CfnOutput(this, "TaskLogGroupName", {
      value: taskLogGroup.logGroupName,
      description: "CloudWatch Log Group for ECS Task Logs",
      exportName: `${envName}-task-log-group`,
    });

    new cdk.CfnOutput(this, "EcsEventLogGroupName", {
      value: ecsEventLogGroup.logGroupName,
      description: "CloudWatch Log Group for ECS Events",
      exportName: `${envName}-ecs-event-log-group`,
    });
  }

  /**
   * Get the Auto Scaling Group for the cluster
   */
  public get autoScalingGroup() {
    return this.clusterConstruct.asg;
  }

  /**
   * Get the CPU alarm (if enabled)
   */
  public get cpuAlarm() {
    return this.serviceConstruct.cpuAlarm;
  }

  /**
   * Get the Node Exporter construct for accessing the monitoring service
   */
  public get nodeExporter() {
    return this.nodeExporterConstruct;
  }

  /**
   * Enable auto scaling based on CPU utilization
   */
  public enableCpuAutoScaling(targetUtilizationPercent: number): void {
    this.serviceConstruct.addCpuScaling(targetUtilizationPercent);
  }

  /**
   * Enable auto scaling based on memory utilization
   */
  public enableMemoryAutoScaling(targetUtilizationPercent: number): void {
    this.serviceConstruct.addMemoryScaling(targetUtilizationPercent);
  }
}

// Export as ComputeStack for backward compatibility
export { ComputeStackRefactored as ComputeStack };
