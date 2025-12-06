/** @format */

import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { EcsTaskDefinitionConstruct } from "../../compute/ecs/ecs-task-definition-construct";
import { EcsServiceConstruct } from "../../compute/ecs/ecs-service-construct";

export interface GrafanaConstructProps {
  // Required parameters
  cluster: ecs.ICluster;
  envName: string;

  // Strage paths
  dataVolumePath: string;
  provisioningVolumePath: string;
  dashboardsVolumePath: string;

  // Optional service configuration
  serviceName?: string;
  desiredCount?: number;

  // Optional resource configuration
  memoryReservationMiB?: number;
  cpu?: number;

  // Optional Grafana configuration
  adminUser?: string;
  adminPassword?: string;
  installPlugins?: string;
  rootUrl?: string;

  // Optional logging
  logRetention?: logs.RetentionDays;

  // Optional ECS configuration
  enableExecuteCommand?: boolean;

  // Optional CloudWatch integration
  enableCloudWatch?: boolean;
  awsRegion?: string;
}

/**
 * Reusable construct for deploy Grafana with ECS
 *
 *  Uses EcsTaskDefinitionConstruct and EcsServiceConstruct internally
 * for consistency with other ECS deployments.
 *
 * Fetures"
 * - Persistent store for dashborad and config
 * - CloudWatch datasource support
 * - Prometheus datasource pre-provisioning
 * - Configurable admin credencials
 * - Consistence with application ECS patters
 *
 *
 */

export class GrafanaConstruct extends Construct {
  public readonly service: ecs.Ec2Service;
  public readonly taskDefinition: ecs.Ec2TaskDefinition;
  public readonly logGroup: logs.LogGroup;

  private readonly taskDefConstruct: EcsTaskDefinitionConstruct;
  private readonly serviceConstruct: EcsServiceConstruct;

  constructor(scope: Construct, id: string, props: GrafanaConstructProps) {
    super(scope, id);

    this.logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/ecs/${props.envName}-grafana`,
      retention: props.logRetention || logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    // Build environment varibles
    const environment = this.buildEnvironment(props);

    // ========================================================================
    // 1. CREATE TASK DEFINITION USING EcsTaskDefinitionConstruct
    // ========================================================================
    this.taskDefConstruct = new EcsTaskDefinitionConstruct(
      this,
      "TaskDefinition",
      {
        envName: props.envName,
        networkMode: ecs.NetworkMode.BRIDGE,
        grantEcrReadAccess: false,

        // Volume
        volumes: [
          {
            name: "grafana-data",
            host: {
              sourcePath: props.dataVolumePath,
            },
          },
          {
            name: "grafana-provisioning",
            host: {
              sourcePath: props.provisioningVolumePath,
            },
          },
          {
            name: "grafana-dashboards",
            host: {
              sourcePath: props.dashboardsVolumePath,
            },
          },
        ],
        // Define Grafana container
        containers: [
          {
            name: "grafana",
            image: ecs.ContainerImage.fromRegistry("grafana/grafana:latest"),
            containerPort: 3000,
            memoryReservationMiB: props.memoryReservationMiB || 256,
            cpu: props.cpu,
            logStreamPrefix: "grafana",
            environment: environment,
          },
        ],
      }
    );

    this.taskDefinition = this.taskDefConstruct.taskDefinition;

    // ========================================================================
    // 2. ADD MOUNT POINTS TO CONTAINER
    // ========================================================================

    this.taskDefConstruct.addMountPoints(
      "grafana",
      {
        sourceVolume: "grafana-data",
        containerPath: "/var/lib/grafana",
        readOnly: false,
      },
      {
        sourceVolume: "grafana-provisioning",
        containerPath: "/etc/grafana/provisioning",
        readOnly: true,
      },
      {
        sourceVolume: "grafana-dashboards",
        containerPath: "/var/lib/grafana/dashboards",
        readOnly: true,
      }
    );

    // ========================================================================
    // 3. ADD IAM PERMISSIONS FOR CLOUDWATCH (if enabled)
    // ========================================================================
    // Replace AWS managed policy with custom inline policy for CDK Nag compliance
    if (props.enableCloudWatch !== false) {
      // Add CloudWatch read permissions for Grafana CloudWatch datasource
      this.taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cloudwatch:DescribeAlarmsForMetric",
            "cloudwatch:DescribeAlarmHistory",
            "cloudwatch:DescribeAlarms",
            "cloudwatch:ListMetrics",
            "cloudwatch:GetMetricStatistics",
            "cloudwatch:GetMetricData",
            "cloudwatch:GetInsightRuleReport",
          ],
          resources: ["*"], // CloudWatch metrics don't support resource-level permissions
        })
      );

      // Add CloudWatch Logs read permissions
      this.taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "logs:DescribeLogGroups",
            "logs:GetLogGroupFields",
            "logs:StartQuery",
            "logs:StopQuery",
            "logs:GetQueryResults",
            "logs:GetLogEvents",
          ],
          resources: [
            `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:*`,
          ],
        })
      );

      // Add EC2 read permissions for CloudWatch datasource
      this.taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "ec2:DescribeTags",
            "ec2:DescribeInstances",
            "ec2:DescribeRegions",
          ],
          resources: ["*"], // EC2 describe actions don't support resource-level permissions
        })
      );

      // Add resource group tagging permissions
      this.taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["tag:GetResources"],
          resources: ["*"], // Tag API doesn't support resource-level permissions
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
      serviceName: props.serviceName || `${props.envName}-grafana`,
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

      // No alarms by defauld (can be added externally)
      alarmConfig: undefined,
    });

    // Expose the service
    this.service = this.serviceConstruct.service;
  }

  /**
   *  Build Grafana environment variables
   */

  private buildEnvironment(
    props: GrafanaConstructProps
  ): Record<string, string> {
    const env: Record<string, string> = {
      // Admin credentials
      GF_SECURITY_ADMIN_USER: props.adminUser || "admin",
      GF_SECURITY_ADMIN_PASSWORD: props.adminPassword || "admin",

      // Server configuration for ALB sub-path
      GF_SERVER_ROOT_URL: props.rootUrl || "/grafana",
      GF_SERVER_SERVE_FROM_SUB_PATH: "true",

      // Security
      GF_USERS_ALLOW_SIGN_UP: "false",

      // Provisioning path
      GF_PATH_PROVISIONING: "/etc/grafana/provisioning",

      // Plugins
      GF_INSTALL_PLUGINS: props.installPlugins || "cloudwatch",

      // Telemetry
      GF_ANALYTICS_REPORTING_ENABLE: " false",
      GF_METRICS_ENABLED: " false",
    };

    // Add AWs region if CloudWatch is enabled
    if (props.enableCloudWatch !== false) {
      env.AWS_REGION = props.awsRegion || cdk.Stack.of(this).region;
    }
    return env;
  }

  /**
   * Get the Grafana container port
   */
  public static readonly PORT = 3000;

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
    return this.taskDefConstruct.getContainer("grafana");
  }
}
