/** @format */

import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
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

    // Create ECS Cluster for monitoring (with EBS volume)
    this.cluster = this.createEcsCluster(vpc, envName);

    // Create Application Load Balancer for monitoring services
    this.loadBalancer = this.createLoadBalancer(vpc, envName, allowedIpRanges);

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
    this.createOutputs();
  }

  private createEcsCluster(vpc: ec2.IVpc, envName: string): ecs.Cluster {
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
      "  # Node Exporter - EC2 Service Discovery",
      "  - job_name: 'node-exporter'",
      "    ec2_sd_configs:",
      "      - region: " + cdk.Stack.of(this).region,
      "        port: 9100",
      "        filters:",
      "          - name: tag:Purpose",
      "            values: ['Monitoring']",
      "          - name: instance-state-name",
      "            values: ['running']",
      "    relabel_configs:",
      "      # Use private IP",
      "      - source_labels: [__meta_ec2_private_ip]",
      "        target_label: __address__",
      "        replacement: '${1}:9100'",
      "      # Add instance ID as label",
      "      - source_labels: [__meta_ec2_instance_id]",
      "        target_label: instance_id",
      "      # Add availability zone",
      "      - source_labels: [__meta_ec2_availability_zone]",
      "        target_label: availability_zone",
      "      # Use instance name tag as instance label",
      "      - source_labels: [__meta_ec2_tag_Name]",
      "        target_label: instance",
      "EOF",
      "",
      "# Create Grafana datasource configuration",
      "cat > /mnt/grafana-provisioning/datasources/prometheus.yml << 'EOF'",
      "apiVersion: 1",
      "",
      "datasources:",
      "  - name: Prometheus",
      "    type: prometheus",
      "    access: proxy",
      "    url: http://localhost:9090/prometheus",
      "    isDefault: true",
      "    editable: true",
      "    jsonData:",
      "      timeInterval: '15s'",
      "EOF",
      "",
      "# Set permissions",
      "chown -R 65534:65534 /mnt/prometheus-data /mnt/prometheus-config",
      "chown -R 472:472 /mnt/grafana-data /mnt/grafana-provisioning",
      "chmod -R 755 /mnt/prometheus-data /mnt/prometheus-config",
      "chmod -R 755 /mnt/grafana-data /mnt/grafana-provisioning"
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
    envName: string,
    _albDnsName?: string
  ): ecs.Ec2Service {
    // Task definition
    const taskDefinition = new ecs.Ec2TaskDefinition(
      this,
      "PrometheusTaskDef",
      {
        networkMode: ecs.NetworkMode.BRIDGE,
      }
    );

    // Add IAM permissions for EC2 service discovery
    taskDefinition.taskRole.addToPrincipalPolicy(
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

    // Add host volumes for persistent storage and config
    taskDefinition.addVolume({
      name: "prometheus-data",
      host: {
        sourcePath: "/mnt/prometheus-data",
      },
    });

    taskDefinition.addVolume({
      name: "prometheus-config",
      host: {
        sourcePath: "/mnt/prometheus-config",
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

    container.addMountPoints(
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

    // Create service
    const service = new ecs.Ec2Service(this, "PrometheusService", {
      cluster,
      taskDefinition,
      serviceName: `${envName}-prometheus`,
      desiredCount: 1,
      enableExecuteCommand: true,
    });

    return service;
  }

  private createGrafanaService(
    cluster: ecs.Cluster,
    envName: string
  ): ecs.Ec2Service {
    // Task definition
    const taskDefinition = new ecs.Ec2TaskDefinition(this, "GrafanaTaskDef", {
      networkMode: ecs.NetworkMode.BRIDGE,
    });

    // Add host volumes for persistent storage and provisioning
    taskDefinition.addVolume({
      name: "grafana-data",
      host: {
        sourcePath: "/mnt/grafana-data",
      },
    });

    taskDefinition.addVolume({
      name: "grafana-provisioning",
      host: {
        sourcePath: "/mnt/grafana-provisioning",
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
        GF_PATHS_PROVISIONING: "/etc/grafana/provisioning",
        AWS_REGION: cdk.Stack.of(this).region,
      },
    });

    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    container.addMountPoints(
      {
        sourceVolume: "grafana-data",
        containerPath: "/var/lib/grafana",
        readOnly: false,
      },
      {
        sourceVolume: "grafana-provisioning",
        containerPath: "/etc/grafana/provisioning",
        readOnly: true,
      }
    );

    // Create service
    const service = new ecs.Ec2Service(this, "GrafanaService", {
      cluster,
      taskDefinition,
      serviceName: `${envName}-grafana`,
      desiredCount: 1,
      enableExecuteCommand: true,
    });

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
        targetType: elbv2.TargetType.INSTANCE, // INSTANCE for bridge network mode
        healthCheck: {
          path: "/prometheus/-/healthy",
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
