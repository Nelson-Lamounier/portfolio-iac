/** @format */

import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import { Tags } from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { EcsTaskExecutionRole } from "../../iam";

export interface ContainerConfig {
  name: string;
  image: ecs.ContainerImage;
  containerPort?: number; // Optional - not needed for HOST mode without explicit port mapping
  hostPort?: number; // Optional - if set, uses static host port mapping (required for metrics scraping)
  cpu?: number;
  memoryLimitMiB?: number;
  memoryReservationMiB?: number;
  environment?: { [key: string]: string };
  secrets?: { [key: string]: ecs.Secret };
  command?: string[];
  logStreamPrefix?: string;
  user?: string; // Optional - run container as specific user (e.g., "472" for Grafana)
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
    let executionRole = props.executionRole;
    if (!executionRole && props.grantEcrReadAccess !== false) {
      // Use centralized ECS task execution role construct
      const executionRoleConstruct = new EcsTaskExecutionRole(
        this,
        "ExecutionRole",
        {
          envName: props.envName,
          enablePublicEcr: false, // Only enable if needed
        }
      );
      executionRole = executionRoleConstruct.role;
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

    // CDK Nag suppressions for task definition
    if (this.taskDefinition.taskRole) {
      NagSuppressions.addResourceSuppressions(
        this.taskDefinition.taskRole,
        [
          {
            id: "AwsSolutions-IAM5",
            reason:
              "CloudWatch Logs permissions use wildcard for log streams within log groups. This allows ECS to create log streams dynamically for containers.",
            appliesTo: [
              "Resource::arn:aws:logs:*:*:log-group:*:*",
              "Resource::arn:aws:logs:*:*:log-group:<*>:*",
            ],
          },
        ],
        true
      );
    }
  }

  /**
   * Add a container to the task definition
   */
  private addContainer(config: ContainerConfig, _envName: string): void {
    const container = this.taskDefinition.addContainer(config.name, {
      image: config.image,
      logging: config.logStreamPrefix
        ? ecs.LogDrivers.awsLogs({
            streamPrefix: config.logStreamPrefix,
          })
        : undefined,
      memoryReservationMiB: config.memoryReservationMiB || 512,
      memoryLimitMiB: config.memoryLimitMiB,
      cpu: config.cpu,
      environment: config.environment,
      secrets: config.secrets,
      command: config.command,
      user: config.user, // Run container as specific user if specified
    });

    // Add port mapping only if containerPort is specified
    // For HOST mode, port mapping is optional as container uses host network directly
    if (config.containerPort !== undefined) {
      let hostPort: number;

      if (this.taskDefinition.networkMode === ecs.NetworkMode.HOST) {
        // HOST mode: container uses host network directly
        hostPort = config.containerPort;
      } else if (config.hostPort !== undefined) {
        // BRIDGE mode with static host port (for metrics scraping)
        hostPort = config.hostPort;
      } else {
        // BRIDGE mode with dynamic port (default)
        hostPort = 0;
      }

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
