/** @format */

import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { EcsTaskDefinitionConstruct } from "../../compute/ecs/ecs-task-definition-construct";
import { EcsServiceConstruct } from "../../compute/ecs/ecs-service-construct";

export interface PrometheusConstructProps {
  cluster: ecs.ICluster;
  envName: string;
  serviceName?: string;

  // Storage paths
  dataVolumePath: string;
  configVolumePath: string;

  // Resource configuration
  memoryReservationMiB?: number;
  cpu?: number;

  // Prometheus configuration
  retentionDays?: string;
  scrapeInterval?: string;
  enableLifecycle?: boolean;

  // Web configuration
  webRoutePrefix?: string;
  webExternalUrl?: string;

  // Service discovery
  enableEc2ServiceDiscovery?: boolean;
  region?: string;

  // Logging
  logRetention?: logs.RetentionDays;

  // ECS configuration
  enableExecuteCommand?: boolean;
  desiredCount?: number;
}

/**
 * Reusable construct for deploying Prometheus with ECS
 *
 * Uses EcsTaskDefinitionConstruct and EcsServiceConstruct internally
 * for consistency with other ECS deployments.
 *
 * Features:
 * - Persistent storage via host volumes
 * - EC2 service discovery for scraping
 * - Configurable retention and scraping
 * - Consistent with application ECS patterns

 */
export class PrometheusConstruct extends Construct {
  public readonly service: ecs.Ec2Service;
  public readonly taskDefinition: ecs.Ec2TaskDefinition;
  public readonly logGroup: logs.LogGroup;

  private readonly taskDefConstruct: EcsTaskDefinitionConstruct;
  private readonly serviceConstruct: EcsServiceConstruct;

  constructor(scope: Construct, id: string, props: PrometheusConstructProps) {
    super(scope, id);

    // Create log group
    this.logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/ecs/${props.envName}-prometheus`,
      retention: props.logRetention || logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Build Prometheus command
    const prometheusCommand = this.buildPrometheusCommand(props);

    // ========================================================================
    // 1. CREATE TASK DEFINITION USING EcsTaskDefinitionConstruct
    // ========================================================================
    this.taskDefConstruct = new EcsTaskDefinitionConstruct(
      this,
      "TaskDefinition",
      {
        envName: props.envName,
        networkMode: ecs.NetworkMode.HOST, // HOST mode for static port 9090
        grantEcrReadAccess: false, // Using public registry

        // Define volumes for persistent storage
        volumes: [
          {
            name: "prometheus-data",
            host: {
              sourcePath: props.dataVolumePath,
            },
          },
          {
            name: "prometheus-config",
            host: {
              sourcePath: props.configVolumePath,
            },
          },
        ],

        // Define Prometheus container
        containers: [
          {
            name: "prometheus",
            image: ecs.ContainerImage.fromRegistry("prom/prometheus:latest"),
            // Port 9090 - in HOST mode, this maps to the same port on host
            containerPort: 9090,
            memoryReservationMiB: props.memoryReservationMiB || 256,
            cpu: props.cpu,
            command: prometheusCommand,
            logStreamPrefix: "prometheus",
            environment: {
              ENVIRONMENT: props.envName,
            },
          },
        ],
      }
    );

    this.taskDefinition = this.taskDefConstruct.taskDefinition;

    // ========================================================================
    // 2. ADD MOUNT POINTS TO CONTAINER
    // ========================================================================
    this.taskDefConstruct.addMountPoints(
      "prometheus",
      {
        sourceVolume: "prometheus-data",
        containerPath: "/prometheus",
        readOnly: false,
      },
      {
        sourceVolume: "prometheus-config",
        containerPath: "/etc/prometheus",
        readOnly: true,
      }
    );

    // ========================================================================
    // 3. ADD IAM PERMISSIONS FOR EC2 SERVICE DISCOVERY
    // ========================================================================
    if (props.enableEc2ServiceDiscovery !== false) {
      this.taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "ec2:DescribeInstances",
            "ec2:DescribeAvailabilityZones",
            "ec2:DescribeTags",
          ],
          resources: ["*"],
        })
      );
    }

    // ========================================================================
    // 4. CREATE SERVICE USING EcsServiceConstruct
    // ========================================================================
    this.serviceConstruct = new EcsServiceConstruct(this, "Service", {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      envName: props.envName,
      serviceName: props.serviceName || `${props.envName}-prometheus`,
      desiredCount: props.desiredCount || 1,

      // Deployment configuration
      minHealthyPercent: 0, // Allow restart
      maxHealthyPercent: 100, // Single instance
      healthCheckGracePeriod: cdk.Duration.seconds(60),

      // Enable circuit breaker
      enableCircuitBreaker: true,

      // Enable ECS Exec
      enableExecuteCommand: props.enableExecuteCommand,

      // No load balancer target (configured externally if needed)
      loadBalancerTarget: undefined,

      // No alarms by default (can be added externally)
      alarmConfig: undefined,
    });

    this.service = this.serviceConstruct.service;
  }

  /**
   * Build Prometheus command with configuration
   */
  private buildPrometheusCommand(props: PrometheusConstructProps): string[] {
    const command = [
      "--config.file=/etc/prometheus/prometheus.yml",
      "--storage.tsdb.path=/prometheus",
      `--storage.tsdb.retention.time=${props.retentionDays || "7d"}`,
      "--web.console.libraries=/usr/share/prometheus/console_libraries",
      "--web.console.templates=/usr/share/prometheus/consoles",
    ];

    // Add web route prefix if provided
    if (props.webRoutePrefix) {
      command.push(`--web.route-prefix=${props.webRoutePrefix}`);
    }

    // Add external URL if provided
    if (props.webExternalUrl) {
      command.push(`--web.external-url=${props.webExternalUrl}`);
    }

    // Enable lifecycle API if requested
    if (props.enableLifecycle !== false) {
      command.push("--web.enable-lifecycle");
    }

    return command;
  }

  /**
   * Get the Prometheus container port
   */
  public static readonly PORT = 9090;

  /**
   * Add a custom IAM policy to the task role
   */
  public addToTaskRolePolicy(statement: iam.PolicyStatement): void {
    this.taskDefinition.taskRole.addToPrincipalPolicy(statement);
  }

  /**
   * Get the container definition
   */
  public get container(): ecs.ContainerDefinition | undefined {
    return this.taskDefConstruct.getContainer("prometheus");
  }
}
