/** @format */

import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import { Tags } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface ContainerConfig {
  name: string;
  image: ecs.ContainerImage;
  containerPort: number;
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

    // Create Task Definition
    this.taskDefinition = new ecs.Ec2TaskDefinition(this, "TaskDef", {
      networkMode: props.networkMode || ecs.NetworkMode.BRIDGE,
      taskRole: props.taskRole,
      executionRole: props.executionRole,
    });

    // Grant ECR permissions if requested
    if (props.grantEcrReadAccess !== false) {
      this.taskDefinition.executionRole?.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonEC2ContainerRegistryReadOnly"
        )
      );
    }

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

    // Add port mapping with dynamic host port for BRIDGE mode
    // Or use same port for HOST mode
    const hostPort = this.taskDefinition.networkMode === ecs.NetworkMode.HOST
      ? config.containerPort
      : 0; // Dynamic port for BRIDGE mode

    container.addPortMappings({
      containerPort: config.containerPort,
      hostPort: hostPort,
      protocol: ecs.Protocol.TCP,
    });

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
