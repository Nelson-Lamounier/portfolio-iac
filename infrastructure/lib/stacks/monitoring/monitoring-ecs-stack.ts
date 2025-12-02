/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as efs from "aws-cdk-lib/aws-efs";
import { Construct } from "constructs";

export interface MonitoringEcsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  envName: string;
  albDnsName?: string;
  allowedIpRanges?: string[];
}

export class MonitoringEcsStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly prometheusService: ecs.Ec2Service;
  public readonly grafanaService: ecs.Ec2Service;
  public readonly nodeExporterService: ecs.Ec2Service;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly grafanaUrl: string;
  public readonly prometheusUrl: string;

  constructor(scope: Construct, id: string, props: MonitoringEcsStackProps) {
    super(scope, id, props);

    const { vpc, envName, albDnsName, allowedIpRanges } = props;

    // Create EFS for persistent storage
    const fileSystem = this.createEfsFileSystem(vpc, envName);

    // Create ECS Cluster for monitoring
    this.cluster = this.createEcsCluster(vpc, envName);

    // Create Application Load Balancer for monitoring services
    this.loadBalancer = this.createLoadBalancer(vpc, envName, allowedIpRanges);

    // Create Prometheus service
    this.prometheusService = this.createPrometheusService(
      this.cluster,
      fileSystem,
      envName,
      albDnsName
    );

    // Create Grafana service
    this.grafanaService = this.createGrafanaService(
      this.cluster,
      fileSystem,
      envName
    );

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
    this.createOutputs();
  }

  private createEfsFileSystem(vpc: ec2.IVpc, envName: string): efs.FileSystem {
    const fileSystem = new efs.FileSystem(this, "MonitoringEfs", {
      vpc,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      encrypted: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    cdk.Tags.of(fileSystem).add("Name", `${envName}-monitoring-efs`);
    cdk.Tags.of(fileSystem).add("Environment", envName);
    cdk.Tags.of(fileSystem).add("Purpose", "Monitoring");

    return fileSystem;
  }

  private createEcsCluster(vpc: ec2.IVpc, envName: string): ecs.Cluster {
    const cluster = new ecs.Cluster(this, "MonitoringCluster", {
      vpc,
      clusterName: `${envName}-monitoring-cluster`,
      containerInsights: true,
    });

    // Add EC2 capacity - t3.small for monitoring workload
    cluster.addCapacity("MonitoringCapacity", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
    });

    cdk.Tags.of(cluster).add("Environment", envName);
    cdk.Tags.of(cluster).add("Purpose", "Monitoring");

    return cluster;
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

  private createPrometheusService(
    cluster: ecs.Cluster,
    fileSystem: efs.FileSystem,
    envName: string,
    albDnsName?: string
  ): ecs.Ec2Service {
    // Task definition
    const taskDefinition = new ecs.Ec2TaskDefinition(
      this,
      "PrometheusTaskDef",
      {
        networkMode: ecs.NetworkMode.BRIDGE,
      }
    );

    // Add EFS volume
    taskDefinition.addVolume({
      name: "prometheus-data",
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
        transitEncryption: "ENABLED",
        rootDirectory: "/prometheus",
      },
    });

    // Container definition
    const container = taskDefinition.addContainer("prometheus", {
      image: ecs.ContainerImage.fromRegistry("prom/prometheus:latest"),
      memoryReservationMiB: 256,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "prometheus",
        logGroup: new logs.LogGroup(this, "PrometheusLogGroup", {
          logGroupName: `/ecs/${envName}-prometheus`,
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      command: [
        "--config.file=/etc/prometheus/prometheus.yml",
        "--storage.tsdb.path=/prometheus",
        "--storage.tsdb.retention.time=7d",
        "--web.console.libraries=/usr/share/prometheus/console_libraries",
        "--web.console.templates=/usr/share/prometheus/consoles",
        "--web.enable-lifecycle",
        "--web.route-prefix=/prometheus",
        "--web.external-url=/prometheus",
      ],
      environment: {
        ENVIRONMENT: envName,
      },
    });

    container.addPortMappings({
      containerPort: 9090,
      protocol: ecs.Protocol.TCP,
    });

    container.addMountPoints({
      sourceVolume: "prometheus-data",
      containerPath: "/prometheus",
      readOnly: false,
    });

    // Create service
    const service = new ecs.Ec2Service(this, "PrometheusService", {
      cluster,
      taskDefinition,
      serviceName: `${envName}-prometheus`,
      desiredCount: 1,
      enableExecuteCommand: true,
    });

    // Allow EFS access
    fileSystem.connections.allowDefaultPortFrom(service);

    return service;
  }

  private createGrafanaService(
    cluster: ecs.Cluster,
    fileSystem: efs.FileSystem,
    envName: string
  ): ecs.Ec2Service {
    // Task definition
    const taskDefinition = new ecs.Ec2TaskDefinition(this, "GrafanaTaskDef", {
      networkMode: ecs.NetworkMode.BRIDGE,
    });

    // Add EFS volume
    taskDefinition.addVolume({
      name: "grafana-data",
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
        transitEncryption: "ENABLED",
        rootDirectory: "/grafana",
      },
    });

    // Container definition
    const container = taskDefinition.addContainer("grafana", {
      image: ecs.ContainerImage.fromRegistry("grafana/grafana:latest"),
      memoryReservationMiB: 256,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "grafana",
        logGroup: new logs.LogGroup(this, "GrafanaLogGroup", {
          logGroupName: `/ecs/${envName}-grafana`,
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      environment: {
        GF_SECURITY_ADMIN_USER: "admin",
        GF_SECURITY_ADMIN_PASSWORD: "admin",
        GF_INSTALL_PLUGINS: "cloudwatch",
        GF_USERS_ALLOW_SIGN_UP: "false",
        GF_SERVER_ROOT_URL: "/grafana",
        GF_SERVER_SERVE_FROM_SUB_PATH: "true",
        GF_ANALYTICS_REPORTING_ENABLED: "false",
        GF_METRICS_ENABLED: "false",
        AWS_REGION: cdk.Stack.of(this).region,
      },
    });

    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    container.addMountPoints({
      sourceVolume: "grafana-data",
      containerPath: "/var/lib/grafana",
      readOnly: false,
    });

    // Create service
    const service = new ecs.Ec2Service(this, "GrafanaService", {
      cluster,
      taskDefinition,
      serviceName: `${envName}-grafana`,
      desiredCount: 1,
      enableExecuteCommand: true,
    });

    // Allow EFS access
    fileSystem.connections.allowDefaultPortFrom(service);

    // Add IAM permissions for CloudWatch
    taskDefinition.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchReadOnlyAccess")
    );

    return service;
  }

  private createNodeExporterService(
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
        targetType: elbv2.TargetType.INSTANCE,
        healthCheck: {
          path: "/grafana/api/health",
          healthyHttpCodes: "200",
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
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
        targetType: elbv2.TargetType.INSTANCE,
        healthCheck: {
          path: "/prometheus/-/healthy",
          healthyHttpCodes: "200",
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
      }
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

  private createOutputs(): void {
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
  }
}
