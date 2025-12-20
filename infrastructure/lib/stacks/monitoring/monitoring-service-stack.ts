/** @format */

import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

import {
  GrafanaConstruct,
  PrometheusConstruct,
  NodeExporterConstruct,
} from "../../constructs";
import { SuppressionManager } from "../../cdk-nag";

/**
 * LAYER 2: Monitoring Service Stack
 *
 * This stack contains ECS service definitions that change occasionally:
 * - ECS Task Definitions
 * - Container specifications
 * - Port mappings
 * - Service configurations
 *
 * Deploy: When changing container images, resources, or service config
 * Depends on: MonitoringInfraStack
 *
 * NOTE: Application configuration (prometheus.yml, dashboards) is stored
 * on EFS and can be updated without redeploying this stack.
 */
export interface MonitoringServiceStackProps extends cdk.StackProps {
  cluster: ecs.ICluster;
  autoScalingGroup: autoscaling.AutoScalingGroup;
  loadBalancer: elbv2.IApplicationLoadBalancer;
  listener: elbv2.IApplicationListener;
  envName: string;
}

export class MonitoringServiceStack extends cdk.Stack {
  public readonly prometheusService: ecs.Ec2Service;
  public readonly grafanaService: ecs.Ec2Service;
  public readonly nodeExporterService: ecs.Ec2Service;

  constructor(
    scope: Construct,
    id: string,
    props: MonitoringServiceStackProps
  ) {
    super(scope, id, props);

    const {
      cluster,
      // autoScalingGroup, // Not used in current implementation
      loadBalancer,
      listener,
      envName,
    } = props;

    // ========================================================================
    // ECS SERVICES
    // ========================================================================

    // Prometheus Service
    this.prometheusService = this.createPrometheusService(
      cluster as ecs.Cluster,
      envName
    );

    // Grafana Service
    this.grafanaService = this.createGrafanaService(
      cluster as ecs.Cluster,
      envName
    );

    // Node Exporter Service
    this.nodeExporterService = this.createNodeExporterService(
      cluster as ecs.Cluster,
      envName
    );

    // ========================================================================
    // LOAD BALANCER TARGET GROUPS & ROUTING
    // ========================================================================
    this.configureLoadBalancerRouting(
      cluster as ecs.Cluster,
      loadBalancer,
      listener
    );

    // ========================================================================
    // OUTPUTS
    // ========================================================================
    new cdk.CfnOutput(this, "PrometheusServiceArn", {
      value: this.prometheusService.serviceArn,
      description: "Prometheus ECS Service ARN",
      exportName: `${this.stackName}-prometheus-service-arn`,
    });

    new cdk.CfnOutput(this, "GrafanaServiceArn", {
      value: this.grafanaService.serviceArn,
      description: "Grafana ECS Service ARN",
      exportName: `${this.stackName}-grafana-service-arn`,
    });

    // ========================================================================
    // CDK NAG SUPPRESSIONS & TAGS
    // ========================================================================
    SuppressionManager.applyToStack(this, "MonitoringServiceStack", envName);
    cdk.Tags.of(this).add("Stack", "MonitoringService");
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("Layer", "Service");
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }

  private createPrometheusService(
    cluster: ecs.Cluster,
    envName: string
  ): ecs.Ec2Service {
    const prometheus = new PrometheusConstruct(this, "Prometheus", {
      cluster,
      envName,
      dataVolumePath: "/mnt/prometheus-data",
      configVolumePath: "/mnt/prometheus-config",
      webRoutePrefix: "/prometheus",
      webExternalUrl: "/prometheus",
      enableEc2ServiceDiscovery: true,
      region: cdk.Stack.of(this).region,
      enableExecuteCommand: true,
    });

    return prometheus.service;
  }

  private createGrafanaService(
    cluster: ecs.Cluster,
    envName: string
  ): ecs.Ec2Service {
    const grafana = new GrafanaConstruct(this, "Grafana", {
      cluster,
      envName,
      dataVolumePath: "/mnt/grafana-data",
      provisioningVolumePath: "/mnt/grafana-provisioning",
      dashboardsVolumePath: "/mnt/grafana-dashboards",
      enableExecuteCommand: true,
      enableCloudWatch: true,
    });

    return grafana.service;
  }

  private createNodeExporterService(
    cluster: ecs.Cluster,
    envName: string
  ): ecs.Ec2Service {
    const nodeExporter = new NodeExporterConstruct(this, "NodeExporter", {
      cluster,
      envName: `${envName}-monitoring`,
      serviceName: `${envName}-monitoring-node-exporter`,
      memoryReservationMiB: 64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      enableExecuteCommand: true,
    });

    return nodeExporter.service;
  }

  private configureLoadBalancerRouting(
    cluster: ecs.Cluster,
    loadBalancer: elbv2.IApplicationLoadBalancer,
    listener: elbv2.IApplicationListener
  ): void {
    // Grafana target group
    // Note: When using TargetType.INSTANCE, health checks hit the container directly on port 3000
    // The health check path should be /api/health (not /grafana/api/health) because it bypasses ALB routing
    const grafanaTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "GrafanaTargetGroup",
      {
        port: 3000,
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: cluster.vpc,
        targetType: elbv2.TargetType.INSTANCE,
        healthCheck: {
          path: "/api/health", // Direct container health check (not through ALB routing)
          healthyHttpCodes: "200",
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(10), // Increased from 5s to 10s for Grafana startup
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
        deregistrationDelay: cdk.Duration.seconds(30),
      }
    );

    // Prometheus target group
    // Note: When using TargetType.INSTANCE, health checks hit the container directly on port 9090
    // The health check path should be /-/healthy (not /prometheus/-/healthy) because it bypasses ALB routing
    const prometheusTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "PrometheusTargetGroup",
      {
        port: 9090,
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: cluster.vpc,
        targetType: elbv2.TargetType.INSTANCE,
        healthCheck: {
          path: "/-/healthy", // Direct container health check (not through ALB routing)
          healthyHttpCodes: "200",
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(10), // Increased from 5s to 10s for Prometheus startup
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
        deregistrationDelay: cdk.Duration.seconds(30),
      }
    );

    // Security group rules
    this.prometheusService.connections.allowFrom(
      loadBalancer,
      ec2.Port.tcp(9090),
      "Allow ALB to reach Prometheus"
    );

    this.grafanaService.connections.allowFrom(
      loadBalancer,
      ec2.Port.tcp(3000),
      "Allow ALB to reach Grafana"
    );

    // Add routing rules to listener
    new elbv2.ApplicationListenerRule(this, "GrafanaRule", {
      listener: listener,
      priority: 100,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/grafana*"])],
      targetGroups: [grafanaTargetGroup],
    });

    new elbv2.ApplicationListenerRule(this, "PrometheusRule", {
      listener: listener,
      priority: 200,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/prometheus*"])],
      targetGroups: [prometheusTargetGroup],
    });

    // Attach services to target groups
    grafanaTargetGroup.addTarget(
      this.grafanaService.loadBalancerTarget({
        containerName: "grafana",
        containerPort: 3000,
      })
    );

    prometheusTargetGroup.addTarget(
      this.prometheusService.loadBalancerTarget({
        containerName: "prometheus",
        containerPort: 9090,
      })
    );
  }
}
