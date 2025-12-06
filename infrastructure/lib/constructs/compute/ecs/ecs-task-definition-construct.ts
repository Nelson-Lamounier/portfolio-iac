/** @format */

import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import { Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { SuppressionManager } from "../../../cdk-nag";

export interface ContainerConfig {
  name: string;
  image: ecs.ContainerImage;
  containerPort?: number; // Optional - not needed for HOST mode without explicit port mapping
  cpu?: number;
  memoryLimitMiB?: number;
  memoryReservationMiB?: number;
  environment?: { [key: string]: string };
  secrets?: { [key: string]: ecs.Secret };
  command?: string[];
  logStreamPrefix?: string;
}

export interface EcsTaskDefinitionConstructProps {
  envName: string;
  networkMode?: ecs.NetworkMode;
  containers: ContainerConfig[];
  grantEcrReadAccess?: boolean;
  taskRole?: iam.IRole;
  executionRole?: iam.IRole;
  volumes?: ecs.Volume[];
}

/**
 * Reusable construct for creating ECS Task Definitions with containers
 * Supports multiple containers and flexible configuration
 */
export class EcsTaskDefinitionConstruct extends Construct {
  public readonly taskDefinition: ecs.Ec2TaskDefinition;
  public readonly containers: Map<string, ecs.ContainerDefinition>;

  constructor(
    scope: Construct,
    id: string,
    props: EcsTaskDefinitionConstructProps
  ) {
    super(scope, id);

    this.containers = new Map();

    // Create or use provided execution role
    // We need to create this explicitly before the task definition if we want to add permissions
    let executionRole = props.executionRole;
    if (!executionRole && props.grantEcrReadAccess !== false) {
      // Create execution role with custom inline policy instead of AWS managed policy
      // This addresses CDK Nag AwsSolutions-IAM4
      executionRole = new iam.Role(this, "ExecutionRole", {
        assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        description:
          "Execution role for ECS task with least privilege permissions",
      });

      // Add CloudWatch Logs permissions
      // Required for ECS to send container logs to CloudWatch
      executionRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
          resources: [
            `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/ecs/${props.envName}*:*`,
          ],
        })
      );

      // Add ECR permissions
      // Required for ECS to pull container images from ECR
      executionRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["ecr:GetAuthorizationToken"],
          resources: ["*"], // GetAuthorizationToken doesn't support resource-level permissions
        })
      );

      executionRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage",
          ],
          resources: [
            `arn:aws:ecr:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:repository/*`,
          ],
        })
      );

      // Add CDK Nag suppressions for execution role permissions
      NagSuppressions.addResourceSuppressions(
        executionRole,
        SuppressionManager.getExecutionRoleSuppressions(props.envName),
        true
      );
    }

    // Create Task Definition
    this.taskDefinition = new ecs.Ec2TaskDefinition(this, "TaskDef", {
      networkMode: props.networkMode || ecs.NetworkMode.BRIDGE,
      taskRole: props.taskRole,
      executionRole: executionRole,
    });

    // Add volumes if provided
    if (props.volumes) {
      props.volumes.forEach((volume) => {
        this.taskDefinition.addVolume(volume);
      });
    }

    // Add containers
    props.containers.forEach((containerConfig) => {
      this.addContainer(containerConfig, props.envName);
    });

    // Tag task definition
    Tags.of(this.taskDefinition).add("Environment", props.envName);
    Tags.of(this.taskDefinition).add("ManagedBy", "CDK");
  }

  /**
   * Add a container to the task definition
   */
  private addContainer(config: ContainerConfig, envName: string): void {
    const container = this.taskDefinition.addContainer(config.name, {
      image: config.image,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: config.logStreamPrefix || `ecs-${envName}`,
      }),
      memoryReservationMiB: config.memoryReservationMiB || 512,
      memoryLimitMiB: config.memoryLimitMiB,
      cpu: config.cpu,
      environment: config.environment,
      secrets: config.secrets,
      command: config.command,
    });

    // Add port mapping only if containerPort is specified
    // For HOST mode, port mapping is optional as container uses host network directly
    if (config.containerPort !== undefined) {
      const hostPort =
        this.taskDefinition.networkMode === ecs.NetworkMode.HOST
          ? config.containerPort
          : 0; // Dynamic port for BRIDGE mode

      container.addPortMappings({
        containerPort: config.containerPort,
        hostPort: hostPort,
        protocol: ecs.Protocol.TCP,
      });
    }

    this.containers.set(config.name, container);
  }

  /**
   * Get a specific container by name
   */
  public getContainer(name: string): ecs.ContainerDefinition | undefined {
    return this.containers.get(name);
  }

  /**
   * Add mount points to a specific container
   */
  public addMountPoints(
    containerName: string,
    ...mountPoints: ecs.MountPoint[]
  ): void {
    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`Container ${containerName} not found`);
    }
    container.addMountPoints(...mountPoints);
  }
}
