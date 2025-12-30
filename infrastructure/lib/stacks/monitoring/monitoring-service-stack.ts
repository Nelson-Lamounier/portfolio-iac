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
    // Note: When using TargetType.INSTANCE with bridge networking, containers use dynamic ports
    // ECS automatically registers the instance with the dynamic port via loadBalancerTarget()
    // The target group's port property (3000) is just a hint - ECS uses the actual dynamic port
    // Health check uses "traffic-port" to check the port the target is registered on (dynamic port)
    const grafanaTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "GrafanaTargetGroup",
      {
        port: 3000, // Hint only - ECS will use actual dynamic port when registering
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: cluster.vpc,
        targetType: elbv2.TargetType.INSTANCE,
        healthCheck: {
          path: "/", // Root path - Grafana may redirect, so accept 200, 301, 302
          port: "traffic-port", // Use the port the target is registered on (dynamic port)
          healthyHttpCodes: "200,301,302", // Accept redirects as healthy
          interval: cdk.Duration.seconds(60), // Increased from 30s to 60s
          timeout: cdk.Duration.seconds(30), // Increased from 10s to 30s for Grafana startup
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
        deregistrationDelay: cdk.Duration.seconds(30),
      }
    );

    // Prometheus target group
    // Note: When using TargetType.INSTANCE, health checks hit the container directly on port 9090
    // Health check path is "/" - Prometheus may redirect, so accept 200, 301, 302
    const prometheusTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "PrometheusTargetGroup",
      {
        port: 9090,
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: cluster.vpc,
        targetType: elbv2.TargetType.INSTANCE,
        healthCheck: {
          path: "/", // Root path - Prometheus may redirect, so accept 200, 301, 302
          healthyHttpCodes: "200,301,302", // Accept redirects as healthy (Prometheus returns 302 redirects)
          interval: cdk.Duration.seconds(60), // Increased from 30s to 60s
          timeout: cdk.Duration.seconds(30), // Increased from 10s to 30s for Prometheus startup
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
        deregistrationDelay: cdk.Duration.seconds(30),
      }
    );

    // Security group rules for ALB to reach containers
    // Note: When using bridge networking, Grafana uses dynamic ports (32768-65535)
    // Prometheus uses fixed port 9090
    // We need to allow ALB security group to reach the instance security group

    // Get ALB security group (ALB creates its own security group)
    const albSecurityGroup = loadBalancer.connections.securityGroups[0];

    // Note: The instance security group is in MonitoringInfraStack
    // We'll add these rules via service connections, but they may not be sufficient
    // The actual fix requires adding inbound rules to the instance security group itself
    // This is done in MonitoringInfraStack after the load balancer is created

    // Service-level connections (may not be sufficient for bridge networking)
    this.prometheusService.connections.allowFrom(
      loadBalancer,
      ec2.Port.tcp(9090),
      "Allow ALB to reach Prometheus on port 9090"
    );

    // Grafana uses dynamic ports with bridge networking
    // ECS automatically registers the dynamic port with the target group via loadBalancerTarget()
    // The target group's port property (3000) is just a hint - ECS uses the actual dynamic port
    // Security group rules must allow the dynamic port range (32768-65535)
    // This is handled via the instance security group in MonitoringInfraStack
    this.grafanaService.connections.allowFrom(
      loadBalancer,
      ec2.Port.tcpRange(32768, 65535), // Dynamic port range for bridge networking
      "Allow ALB to reach Grafana on dynamic ports (32768-65535)"
    );

    // Add routing rules to listener
    new elbv2.ApplicationListenerRule(this, "GrafanaRule", {
      listener: listener,
      priority: 100,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/grafana*"])],
      targetGroups: [grafanaTargetGroup],
    });

    // Priority 200: Prometheus paths
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
