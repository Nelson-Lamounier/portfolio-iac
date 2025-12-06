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

export interface CrossAccountTarget {
  /** Environment name (e.g., 'development', 'staging', 'production') */
  envName: string;
  /** Private IP address of the target instance */
  privateIp: string;
  /** Port to scrape (default: 9100 for node-exporter) */
  port?: number;
}

export interface MonitoringEcsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  envName: string;
  albDnsName?: string;
  allowedIpRanges?: string[];
  /** Cross-account targets to scrape via VPC peering */
  crossAccountTargets?: CrossAccountTarget[];
}

export class MonitoringEcsStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly prometheusService: ecs.Ec2Service;
  public readonly grafanaService: ecs.Ec2Service;
  public readonly nodeExporterService: ecs.Ec2Service;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly grafanaUrl: string;
  public readonly prometheusUrl: string;
  private readonly autoScalingGroup: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: MonitoringEcsStackProps) {
    super(scope, id, props);

    const { vpc, envName, albDnsName, allowedIpRanges, crossAccountTargets } =
      props;

    // Create ECS Cluster for monitoring (with EBS volume)
    const { cluster, autoScalingGroup } = this.createEcsCluster(
      vpc,
      envName,
      crossAccountTargets
    );
    this.cluster = cluster;
    this.autoScalingGroup = autoScalingGroup;

    // Create CloudWatch Log Groups for monitoring services
    const monitoringTaskLogGroup = new logs.LogGroup(
      this,
      "MonitoringTaskLogs",
      {
        logGroupName: `/ecs/${this.stackName}/tasks`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    const monitoringEventLogGroup = new logs.LogGroup(
      this,
      "MonitoringEcsEvents",
      {
        logGroupName: `/ecs/${this.stackName}/events`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    // Configure ECS to send events to CloudWatch Logs
    new cdk.aws_events.Rule(this, "MonitoringEcsEventRule", {
      description: `Capture ECS events for ${envName} monitoring cluster`,
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
        new cdk.aws_events_targets.CloudWatchLogGroup(monitoringEventLogGroup),
      ],
    });

    // Create Application Load Balancer for monitoring services
    this.loadBalancer = this.createLoadBalancer(vpc, envName, allowedIpRanges);

    // Allow ALB to reach services on the instances
    this.configureSecurityGroupConnections();

    // Create Prometheus service
    this.prometheusService = this.createPrometheusService(
      this.cluster,
      envName,
      albDnsName
    );

    // Create Grafana service
    this.grafanaService = this.createGrafanaService(this.cluster, envName);

    // Create Node Exporter service
    this.nodeExporterService = this.createNodeExporterService(
      this.cluster,
      envName
    );

    // Configure load balancer routing
    this.configureLoadBalancerRouting();

    // Set URLs
    this.grafanaUrl = `http://${this.loadBalancer.loadBalancerDnsName}/grafana`;
    this.prometheusUrl = `http://${this.loadBalancer.loadBalancerDnsName}/prometheus`;

    // Create outputs
    this.createOutputs(monitoringTaskLogGroup, monitoringEventLogGroup);

    // ========================================================================
    // CDK NAG SUPPRESSIONS
    // ========================================================================
    // Apply centralized CDK Nag suppressions
    SuppressionManager.applyToStack(this, "MonitoringStack", envName);

    // ========================================================================
    // RESOURCE TAGGING
    // ========================================================================
    cdk.Tags.of(this).add("Stack", "MonitoringEcs");
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }

  private createEcsCluster(
    vpc: ec2.IVpc,
    envName: string,
    crossAccountTargets?: CrossAccountTarget[]
  ): { cluster: ecs.Cluster; autoScalingGroup: autoscaling.AutoScalingGroup } {
    const cluster = new ecs.Cluster(this, "MonitoringCluster", {
      vpc,
      clusterName: `${envName}-monitoring-cluster`,
      containerInsights: true,
    });

    // Add EC2 capacity - t3.small for monitoring workload with EBS volume
    const autoScalingGroup = cluster.addCapacity("MonitoringCapacity", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      // Use public subnets since we don't have NAT Gateway
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      // Associate public IP for instances in public subnet
      associatePublicIpAddress: true,
      // Add EBS volume for persistent storage
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: autoscaling.BlockDeviceVolume.ebs(30, {
            volumeType: autoscaling.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
    });

    // Create directories and config files for monitoring services on instance startup
    autoScalingGroup.addUserData(
      "#!/bin/bash",
      "set -e",
      "",
      "# Create data directories",
      "mkdir -p /mnt/prometheus-data",
      "mkdir -p /mnt/grafana-data",
      "mkdir -p /mnt/prometheus-config",
      "mkdir -p /mnt/grafana-provisioning/datasources",
      "mkdir -p /mnt/grafana-provisioning/dashboards",
      "mkdir -p /mnt/grafana-dashboards",
      "",
      "# Create Prometheus configuration",
      "cat > /mnt/prometheus-config/prometheus.yml << 'EOF'",
      "global:",
      "  scrape_interval: 15s",
      "  evaluation_interval: 15s",
      "  external_labels:",
      "    environment: '" + envName + "'",
      "",
      "scrape_configs:",
      "  # Prometheus itself",
      "  - job_name: 'prometheus'",
      "    static_configs:",
      "      - targets: ['localhost:9090']",
      "",
      "  # Node Exporter - EC2 Service Discovery (All Clusters)",
      "  - job_name: 'node-exporter'",
      "    ec2_sd_configs:",
      "      - region: " + cdk.Stack.of(this).region,
      "        port: 9100",
      "        filters:",
      "          # Filter by environment tag to get all clusters in this environment",
      "          - name: tag:Environment",
      "            values: ['" + envName + "']",
      "          - name: instance-state-name",
      "            values: ['running']",
      "    relabel_configs:",
      "      # Use private IP",
      "      - source_labels: [__meta_ec2_private_ip]",
      "        target_label: __address__",
      "        replacement: '$1:9100'",
      "      # Add instance ID as label",
      "      - source_labels: [__meta_ec2_instance_id]",
      "        target_label: instance_id",
      "      # Add availability zone",
      "      - source_labels: [__meta_ec2_availability_zone]",
      "        target_label: availability_zone",
      "      # Add cluster name from Purpose tag (Monitoring vs Application)",
      "      - source_labels: [__meta_ec2_tag_Purpose]",
      "        target_label: cluster",
      "        replacement: '$1'",
      "      # If no Purpose tag, derive from Name tag",
      "      - source_labels: [__meta_ec2_tag_Name]",
      "        regex: '.*monitoring.*'",
      "        target_label: cluster",
      "        replacement: 'Monitoring'",
      "      # Default to Application cluster if not monitoring",
      "      - source_labels: [__meta_ec2_tag_Name, cluster]",
      "        regex: '.*;$'",
      "        target_label: cluster",
      "        replacement: 'Application'",
      "      # Use instance name tag as instance label",
      "      - source_labels: [__meta_ec2_tag_Name]",
      "        target_label: instance",
      "",
      // Add cross-account targets if configured
      ...(crossAccountTargets && crossAccountTargets.length > 0
        ? this.generateCrossAccountScrapeConfig(crossAccountTargets)
        : []),
      "EOF",
      "",
      "# Get host private IP for Grafana to reach Prometheus",
      "HOST_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)",
      "",
      "# Create Grafana datasource configuration",
      "cat > /mnt/grafana-provisioning/datasources/prometheus.yml << EOF",
      "apiVersion: 1",
      "",
      "datasources:",
      "  - name: Prometheus",
      "    type: prometheus",
      "    uid: prometheus",
      "    access: proxy",
      "    # Use host private IP to reach Prometheus from Grafana",
      "    # Include /prometheus path since Prometheus is configured with --web.route-prefix=/prometheus",
      "    url: http://${HOST_IP}:9090/prometheus",
      "    isDefault: true",
      "    editable: true",
      "    jsonData:",
      "      timeInterval: '15s'",
      "EOF",
      "",
      "# Create dashboard provisioning configuration",
      "cat > /mnt/grafana-provisioning/dashboards/dashboards.yml << 'EOF'",
      "apiVersion: 1",
      "",
      "providers:",
      "  - name: 'Default'",
      "    orgId: 1",
      "    folder: ''",
      "    type: file",
      "    disableDeletion: false",
      "    updateIntervalSeconds: 10",
      "    allowUiUpdates: true",
      "    options:",
      "      path: /var/lib/grafana/dashboards",
      "EOF",
      "",
      "# Copy dashboard to Grafana dashboards directory",
      "cp /mnt/grafana-dashboards/infrastructure-overview.json /mnt/grafana-dashboards/ 2>/dev/null || echo 'Dashboard will be added manually'",
      "",
      "# Set permissions",
      "chown -R 65534:65534 /mnt/prometheus-data /mnt/prometheus-config",
      "chown -R 472:472 /mnt/grafana-data /mnt/grafana-provisioning /mnt/grafana-dashboards",
      "chmod -R 755 /mnt/prometheus-data /mnt/prometheus-config",
      "chmod -R 755 /mnt/grafana-data /mnt/grafana-provisioning /mnt/grafana-dashboards"
    );

    // Ensure security group allows outbound HTTPS for ECS agent
    autoScalingGroup.connections.allowToAnyIpv4(
      ec2.Port.tcp(443),
      "Allow HTTPS outbound for ECS agent"
    );

    // Allow Node Exporter port (HOST mode) for Prometheus to scrape
    // This allows Prometheus (in BRIDGE mode) to reach Node Exporter (in HOST mode)
    autoScalingGroup.connections.allowInternally(
      ec2.Port.tcp(9100),
      "Allow Prometheus to scrape Node Exporter"
    );

    // Allow Prometheus port (BRIDGE mode) for Grafana to query
    // This allows Grafana (in BRIDGE mode) to reach Prometheus (in BRIDGE mode)
    autoScalingGroup.connections.allowInternally(
      ec2.Port.tcp(9090),
      "Allow Grafana to query Prometheus"
    );

    cdk.Tags.of(cluster).add("Environment", envName);
    cdk.Tags.of(cluster).add("Purpose", "Monitoring");

    return { cluster, autoScalingGroup };
  }

  private createLoadBalancer(
    vpc: ec2.IVpc,
    envName: string,
    allowedIpRanges?: string[]
  ): elbv2.ApplicationLoadBalancer {
    // Security group for ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, "MonitoringAlbSg", {
      vpc,
      description: "Security group for monitoring ALB",
      allowAllOutbound: true,
    });

    // Allow HTTP access
    const ipRanges = allowedIpRanges || ["0.0.0.0/0"];
    ipRanges.forEach((ipRange) => {
      albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(ipRange),
        ec2.Port.tcp(80),
        `Allow HTTP access from ${ipRange}`
      );
    });

    // Create ALB
    const loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "MonitoringAlb",
      {
        vpc,
        internetFacing: true,
        loadBalancerName: `${envName}-monitoring-alb`,
        securityGroup: albSecurityGroup,
      }
    );

    cdk.Tags.of(loadBalancer).add("Name", `${envName}-monitoring-alb`);
    cdk.Tags.of(loadBalancer).add("Environment", envName);
    cdk.Tags.of(loadBalancer).add("Purpose", "Monitoring");

    return loadBalancer;
  }

  private configureSecurityGroupConnections(): void {
    // Allow ALB to reach Prometheus (port 9090) on instances
    this.autoScalingGroup.connections.allowFrom(
      this.loadBalancer,
      ec2.Port.tcp(9090),
      "Allow ALB to reach Prometheus"
    );

    // Allow ALB to reach Grafana (port 3000) on instances
    this.autoScalingGroup.connections.allowFrom(
      this.loadBalancer,
      ec2.Port.tcp(3000),
      "Allow ALB to reach Grafana"
    );
  }

  private createPrometheusService(
    cluster: ecs.Cluster,
    envName: string,
    _albDnsName?: string
  ): ecs.Ec2Service {
    const prometheus = new PrometheusConstruct(this, "Prometheus", {
      cluster: cluster,
      envName: envName,
      dataVolumePath: "/mnt/prometheus-data",
      configVolumePath: "/mnt/prometheus-config",
      // Use /prometheus prefix for consistent URL structure
      // Both ALB and Grafana will access at: http://HOST:PORT/prometheus
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
      cluster: cluster,
      envName: envName,
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
    // Use a unique name to avoid conflict with ComputeStack's NodeExporter
    const nodeExporter = new NodeExporterConstruct(this, "NodeExporter", {
      cluster: cluster,
      envName: `${envName}-monitoring`, // This creates log group: /ecs/development-monitoring-node-exporter
      serviceName: `${envName}-monitoring-node-exporter`,
      memoryReservationMiB: 64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      enableExecuteCommand: true,
    });

    return nodeExporter.service;
  }

  // OLD IMPLEMENTATION - REPLACED WITH NodeExporterConstruct
  private _oldCreateNodeExporterService_UNUSED(
    cluster: ecs.Cluster,
    envName: string
  ): ecs.Ec2Service {
    // Task definition
    const taskDefinition = new ecs.Ec2TaskDefinition(
      this,
      "NodeExporterTaskDef",
      {
        networkMode: ecs.NetworkMode.HOST,
      }
    );

    // Container definition
    const container = taskDefinition.addContainer("node-exporter", {
      image: ecs.ContainerImage.fromRegistry("prom/node-exporter:latest"),
      memoryReservationMiB: 64,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "node-exporter",
        logGroup: new logs.LogGroup(this, "NodeExporterLogGroup", {
          logGroupName: `/ecs/${envName}-node-exporter`,
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      command: [
        "--path.procfs=/host/proc",
        "--path.sysfs=/host/sys",
        "--path.rootfs=/rootfs",
        "--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)",
      ],
    });

    container.addPortMappings({
      containerPort: 9100,
      hostPort: 9100,
      protocol: ecs.Protocol.TCP,
    });

    // Mount host paths
    taskDefinition.addVolume({
      name: "proc",
      host: { sourcePath: "/proc" },
    });
    taskDefinition.addVolume({
      name: "sys",
      host: { sourcePath: "/sys" },
    });
    taskDefinition.addVolume({
      name: "rootfs",
      host: { sourcePath: "/" },
    });

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
    const service = new ecs.Ec2Service(this, "NodeExporterService", {
      cluster,
      taskDefinition,
      serviceName: `${envName}-node-exporter`,
      desiredCount: 1,
      enableExecuteCommand: true,
    });

    return service;
  }

  private configureLoadBalancerRouting(): void {
    // Default listener
    const listener = this.loadBalancer.addListener("MonitoringListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    // Grafana target group
    const grafanaTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "GrafanaTargetGroup",
      {
        port: 3000,
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: this.cluster.vpc,
        targetType: elbv2.TargetType.INSTANCE, // INSTANCE for bridge network mode
        healthCheck: {
          path: "/grafana/api/health",
          healthyHttpCodes: "200",
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
        deregistrationDelay: cdk.Duration.seconds(30),
      }
    );

    // Prometheus target group
    const prometheusTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "PrometheusTargetGroup",
      {
        port: 9090,
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: this.cluster.vpc,
        targetType: elbv2.TargetType.INSTANCE, // INSTANCE for HOST network mode
        healthCheck: {
          path: "/prometheus/-/healthy", // Prometheus health endpoint with prefix
          healthyHttpCodes: "200",
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
        deregistrationDelay: cdk.Duration.seconds(30),
      }
    );

    // Allow ALB to reach ECS instances on dynamic ports (for BRIDGE mode)
    this.prometheusService.connections.allowFrom(
      this.loadBalancer,
      ec2.Port.tcp(9090),
      "Allow ALB to reach Prometheus"
    );

    this.grafanaService.connections.allowFrom(
      this.loadBalancer,
      ec2.Port.tcp(3000),
      "Allow ALB to reach Grafana"
    );

    // Add routing rules
    listener.addTargetGroups("GrafanaRule", {
      targetGroups: [grafanaTargetGroup],
      conditions: [elbv2.ListenerCondition.pathPatterns(["/grafana*"])],
      priority: 100,
    });

    listener.addTargetGroups("PrometheusRule", {
      targetGroups: [prometheusTargetGroup],
      conditions: [elbv2.ListenerCondition.pathPatterns(["/prometheus*"])],
      priority: 200,
    });

    // Default action - redirect to Grafana
    listener.addAction("DefaultAction", {
      action: elbv2.ListenerAction.redirect({
        path: "/grafana",
        permanent: true,
      }),
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

  private createOutputs(
    taskLogGroup: logs.LogGroup,
    eventLogGroup: logs.LogGroup
  ): void {
    new cdk.CfnOutput(this, "GrafanaUrl", {
      value: this.grafanaUrl,
      description: "Grafana Dashboard URL (default: admin/admin)",
      exportName: `${this.stackName}-grafana-url`,
    });

    new cdk.CfnOutput(this, "PrometheusUrl", {
      value: this.prometheusUrl,
      description: "Prometheus URL",
      exportName: `${this.stackName}-prometheus-url`,
    });

    new cdk.CfnOutput(this, "MonitoringAlbDns", {
      value: this.loadBalancer.loadBalancerDnsName,
      description: "Monitoring ALB DNS name",
      exportName: `${this.stackName}-alb-dns`,
    });

    new cdk.CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      description: "ECS Cluster name for monitoring",
      exportName: `${this.stackName}-cluster-name`,
    });

    new cdk.CfnOutput(this, "MonitoringTaskLogGroupName", {
      value: taskLogGroup.logGroupName,
      description: "CloudWatch Log Group for Monitoring Task Logs",
      exportName: `${this.stackName}-task-log-group`,
    });

    new cdk.CfnOutput(this, "MonitoringEventLogGroupName", {
      value: eventLogGroup.logGroupName,
      description: "CloudWatch Log Group for Monitoring ECS Events",
      exportName: `${this.stackName}-event-log-group`,
    });
  }

  /**
   * Generate Prometheus scrape config for cross-account targets
   * These are static targets that are scraped via VPC peering
   */
  private generateCrossAccountScrapeConfig(
    targets: CrossAccountTarget[]
  ): string[] {
    const lines: string[] = [];

    // Group targets by environment
    const targetsByEnv = targets.reduce(
      (acc, target) => {
        if (!acc[target.envName]) {
          acc[target.envName] = [];
        }
        acc[target.envName].push(target);
        return acc;
      },
      {} as Record<string, CrossAccountTarget[]>
    );

    // Generate scrape config for each environment
    for (const [env, envTargets] of Object.entries(targetsByEnv)) {
      lines.push("");
      lines.push(`  # Cross-Account: ${env} Environment (via VPC Peering)`);
      lines.push(`  - job_name: 'node-exporter-${env}'`);
      lines.push("    static_configs:");
      lines.push("      - targets:");

      for (const target of envTargets) {
        const port = target.port || 9100;
        lines.push(`          - '${target.privateIp}:${port}'`);
      }

      lines.push("        labels:");
      lines.push(`          environment: '${env}'`);
      lines.push("          service: 'node-exporter'");
      lines.push(`          account: '${env}'`);
      lines.push("          source: 'cross-account'");
    }

    return lines;
  }
}
