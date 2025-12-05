/** @format */

import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import { Tags } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface NodeExporterConstructProps {
  cluster: ecs.ICluster;
  envName: string;
  serviceName?: string;
  memoryReservationMiB?: number;
  logRetention?: logs.RetentionDays;
  enableExecuteCommand?: boolean;
}

/**
 * Reusable construct for deploying Prometheus Node Exporter
 * Collects system-level metrics from ECS EC2 instances
 */
export class NodeExporterConstruct extends Construct {
  public readonly service: ecs.Ec2Service;
  public readonly taskDefinition: ecs.Ec2TaskDefinition;
  public readonly logGroup: logs.LogGroup;

  constructor(
    scope: Construct,
    id: string,
    props: NodeExporterConstructProps
  ) {
    super(scope, id);

    // Create log group
    this.logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/ecs/${props.envName}-node-exporter`,
      retention: props.logRetention || logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create task definition with HOST network mode
    this.taskDefinition = new ecs.Ec2TaskDefinition(this, "TaskDef", {
      networkMode: ecs.NetworkMode.HOST,
    });

    // Add volumes for host metrics collection
    this.taskDefinition.addVolume({
      name: "proc",
      host: { sourcePath: "/proc" },
    });
    this.taskDefinition.addVolume({
      name: "sys",
      host: { sourcePath: "/sys" },
    });
    this.taskDefinition.addVolume({
      name: "rootfs",
      host: { sourcePath: "/" },
    });

    // Add Node Exporter container
    const container = this.taskDefinition.addContainer("node-exporter", {
      image: ecs.ContainerImage.fromRegistry("prom/node-exporter:latest"),
      memoryReservationMiB: props.memoryReservationMiB || 64,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "node-exporter",
        logGroup: this.logGroup,
      }),
      command: [
        "--path.procfs=/host/proc",
        "--path.sysfs=/host/sys",
        "--path.rootfs=/rootfs",
        "--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($|/)",
      ],
    });

    // Add port mapping
    container.addPortMappings({
      containerPort: 9100,
      hostPort: 9100,
      protocol: ecs.Protocol.TCP,
    });

    // Add mount points
    container.addMountPoints(
      {
        sourceVolume: "proc",
        containerPath: "/host/proc",
        readOnly: true,
      },
      {
        sourceVolume: "sys",
        containerPath: "/host/sys",
        readOnly: true,
      },
      {
        sourceVolume: "rootfs",
        containerPath: "/rootfs",
        readOnly: true,
      }
    );

    // Create service
    this.service = new ecs.Ec2Service(this, "Service", {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      serviceName: props.serviceName || `${props.envName}-node-exporter`,
      desiredCount: 1,
      enableExecuteCommand: props.enableExecuteCommand,
    });

    // Tag resources
    Tags.of(this.service).add("Environment", props.envName);
    Tags.of(this.service).add("ManagedBy", "CDK");
    Tags.of(this.service).add("Service", "NodeExporter");
    Tags.of(this.taskDefinition).add("Environment", props.envName);
    Tags.of(this.taskDefinition).add("ManagedBy", "CDK");
  }

  /**
   * Get the port number for Node Exporter
   */
  public static readonly PORT = 9100;
}
