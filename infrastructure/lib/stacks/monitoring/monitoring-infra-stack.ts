/** @format */

import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as efs from "aws-cdk-lib/aws-efs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { SuppressionManager } from "../../cdk-nag";

/**
 * LAYER 1: Monitoring Infrastructure Stack
 *
 * This stack contains long-lived infrastructure resources that rarely change:
 * - VPC references
 * - ECS Cluster
 * - EC2 Auto Scaling Group
 * - EFS File System (for persistent data AND config)
 * - Application Load Balancer
 * - Security Groups
 * - IAM Roles
 *
 * Deploy: Only when infrastructure changes (rare)
 * Depends on: NetworkingStack
 */
export interface MonitoringInfraStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  envName: string;
  allowedIpRanges?: string[];
}

export class MonitoringInfraStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly autoScalingGroup: autoscaling.AutoScalingGroup;
  public readonly fileSystem: efs.FileSystem;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly listener: elbv2.ApplicationListener;
  public readonly taskLogGroup: logs.LogGroup;
  public readonly eventLogGroup: logs.LogGroup;
  public readonly efsAccessPoint: efs.AccessPoint;
  public readonly configBucket: MonitoringConfigBucketConstruct;

  constructor(scope: Construct, id: string, props: MonitoringInfraStackProps) {
    super(scope, id, props);

    const { vpc, envName, allowedIpRanges } = props;

    // ========================================================================
    // S3 BUCKET (Configuration Storage)
    // ========================================================================
    // Stores monitoring configuration files with versioning for rollback
    this.configBucket = new MonitoringConfigBucketConstruct(
      this,
      "ConfigBucket",
      {
        envName,
        enableVersioning: true,
      }
    );

    // ========================================================================
    // EFS FILE SYSTEM (Persistent Data + Config Storage)
    // ========================================================================
    this.fileSystem = this.createEfsFileSystem(vpc, envName);
    this.efsAccessPoint = this.createEfsAccessPoint(this.fileSystem);

    // ========================================================================
    // ECS CLUSTER
    // ========================================================================
    this.cluster = new ecs.Cluster(this, "MonitoringCluster", {
      vpc,
      clusterName: `${envName}-monitoring-cluster`,
      containerInsights: true,
    });

    // ========================================================================
    // EC2 AUTO SCALING GROUP
    // ========================================================================
    this.autoScalingGroup = this.createAutoScalingGroup(
      vpc,
      envName,
      this.fileSystem
    );

    // ========================================================================
    // CLOUDWATCH LOG GROUPS
    // ========================================================================
    this.taskLogGroup = new logs.LogGroup(this, "MonitoringTaskLogs", {
      logGroupName: `/ecs/${this.stackName}/tasks`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.eventLogGroup = new logs.LogGroup(this, "MonitoringEcsEvents", {
      logGroupName: `/ecs/${this.stackName}/events`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ECS Event Rule
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
        new cdk.aws_events_targets.CloudWatchLogGroup(this.eventLogGroup),
      ],
    });

    // ========================================================================
    // APPLICATION LOAD BALANCER
    // ========================================================================
    this.loadBalancer = this.createLoadBalancer(vpc, envName, allowedIpRanges);
    this.listener = this.loadBalancer.addListener("MonitoringListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        path: "/grafana",
        permanent: true,
      }),
    });

    // ========================================================================
    // SECURITY GROUP CONNECTIONS
    // ========================================================================
    this.configureSecurityGroups();

    // ========================================================================
    // OUTPUTS
    // ========================================================================
    this.createOutputs(envName);

    // ========================================================================
    // CDK NAG SUPPRESSIONS & TAGS
    // ========================================================================
    SuppressionManager.applyToStack(this, "MonitoringInfraStack", envName);
    cdk.Tags.of(this).add("Stack", "MonitoringInfra");
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("Layer", "Infrastructure");
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }

  /**
   * Create EFS file system for persistent monitoring data AND configuration
   * Uses One Zone storage class for cost optimization (~47% cheaper)
   */
  private createEfsFileSystem(vpc: ec2.IVpc, envName: string): efs.FileSystem {
    const publicSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
    });
    const availabilityZone = publicSubnets.availabilityZones[0];

    const fileSystem = new efs.FileSystem(this, "MonitoringEfs", {
      vpc,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      outOfInfrequentAccessPolicy:
        efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      encrypted: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
        availabilityZones: [availabilityZone],
      },
    });

    // Set One Zone storage class
    const cfnFileSystem = fileSystem.node.defaultChild as efs.CfnFileSystem;
    cfnFileSystem.availabilityZoneName = availabilityZone;

    cdk.Tags.of(fileSystem).add("Name", `${envName}-monitoring-efs`);
    cdk.Tags.of(fileSystem).add("Environment", envName);
    cdk.Tags.of(fileSystem).add("StorageClass", "One-Zone-IA");

    return fileSystem;
  }

  /**
   * Create EFS Access Point for config directory
   */
  private createEfsAccessPoint(fileSystem: efs.FileSystem): efs.AccessPoint {
    return new efs.AccessPoint(this, "ConfigAccessPoint", {
      fileSystem,
      path: "/config",
      createAcl: {
        ownerGid: "0",
        ownerUid: "0",
        permissions: "755",
      },
      posixUser: {
        gid: "0",
        uid: "0",
      },
    });
  }

  private createAutoScalingGroup(
    vpc: ec2.IVpc,
    envName: string,
    fileSystem: efs.FileSystem
  ): autoscaling.AutoScalingGroup {
    const asg = this.cluster.addCapacity("MonitoringCapacity", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      associatePublicIpAddress: true,
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

    // Allow EFS access
    fileSystem.connections.allowDefaultPortFrom(
      asg,
      "Allow ECS instances to mount EFS"
    );

    // Grant EFS IAM permissions for mounting with IAM authentication
    asg.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:ClientRootAccess",
        ],
        resources: [fileSystem.fileSystemArn],
      })
    );

    // User data to mount EFS and setup directory structure
    asg.addUserData(
      "#!/bin/bash",
      "set -e",
      "",
      "# Install EFS utilities",
      "yum install -y amazon-efs-utils",
      "",
      "# Create mount point and mount EFS",
      "mkdir -p /mnt/efs",
      `mount -t efs -o tls ${fileSystem.fileSystemId}:/ /mnt/efs`,
      "",
      "# Add to fstab for persistence across reboots",
      `echo "${fileSystem.fileSystemId}:/ /mnt/efs efs _netdev,tls 0 0" >> /etc/fstab`,
      "",
      "# Create directory structure on EFS",
      "# Data directories (persistent)",
      "mkdir -p /mnt/efs/prometheus-data",
      "mkdir -p /mnt/efs/grafana-data",
      "",
      "# Config directories (can be updated without CDK deploy)",
      "mkdir -p /mnt/efs/config/prometheus",
      "mkdir -p /mnt/efs/config/grafana/provisioning/datasources",
      "mkdir -p /mnt/efs/config/grafana/provisioning/dashboards",
      "mkdir -p /mnt/efs/config/grafana/dashboards",
      "mkdir -p /mnt/efs/config/alertmanager",
      "",
      "# Create symlinks for container access",
      "ln -sf /mnt/efs/prometheus-data /mnt/prometheus-data",
      "ln -sf /mnt/efs/grafana-data /mnt/grafana-data",
      "ln -sf /mnt/efs/config/prometheus /mnt/prometheus-config",
      "ln -sf /mnt/efs/config/grafana/provisioning /mnt/grafana-provisioning",
      "ln -sf /mnt/efs/config/grafana/dashboards /mnt/grafana-dashboards",
      "",
      "# Set permissions",
      "chown -R 65534:65534 /mnt/efs/prometheus-data /mnt/efs/config/prometheus",
      "chown -R 472:0 /mnt/efs/grafana-data /mnt/efs/config/grafana",
      "chmod -R 755 /mnt/efs/prometheus-data /mnt/efs/config/prometheus",
      "chmod -R 775 /mnt/efs/grafana-data /mnt/efs/config/grafana"
    );

    // Security group rules
    asg.connections.allowToAnyIpv4(
      ec2.Port.tcp(443),
      "Allow HTTPS outbound for ECS agent"
    );
    asg.connections.allowInternally(
      ec2.Port.tcp(9100),
      "Allow Prometheus to scrape Node Exporter"
    );
    asg.connections.allowInternally(
      ec2.Port.tcp(9090),
      "Allow Grafana to query Prometheus"
    );

    cdk.Tags.of(this.cluster).add("Environment", envName);
    cdk.Tags.of(this.cluster).add("Purpose", "Monitoring");

    return asg;
  }

  private createLoadBalancer(
    vpc: ec2.IVpc,
    envName: string,
    allowedIpRanges?: string[]
  ): elbv2.ApplicationLoadBalancer {
    const albSecurityGroup = new ec2.SecurityGroup(this, "MonitoringAlbSg", {
      vpc,
      description: "Security group for monitoring ALB",
      allowAllOutbound: true,
    });

    const ipRanges = allowedIpRanges || ["0.0.0.0/0"];
    ipRanges.forEach((ipRange) => {
      albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(ipRange),
        ec2.Port.tcp(80),
        `Allow HTTP access from ${ipRange}`
      );
    });

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

  private configureSecurityGroups(): void {
    this.autoScalingGroup.connections.allowFrom(
      this.loadBalancer,
      ec2.Port.tcp(9090),
      "Allow ALB to reach Prometheus"
    );
    this.autoScalingGroup.connections.allowFrom(
      this.loadBalancer,
      ec2.Port.tcp(3000),
      "Allow ALB to reach Grafana"
    );
  }

  private createOutputs(envName: string): void {
    new cdk.CfnOutput(this, "ClusterArn", {
      value: this.cluster.clusterArn,
      description: "ECS Cluster ARN",
      exportName: `${this.stackName}-cluster-arn`,
    });

    new cdk.CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      description: "ECS Cluster name",
      exportName: `${this.stackName}-cluster-name`,
    });

    new cdk.CfnOutput(this, "EfsFileSystemId", {
      value: this.fileSystem.fileSystemId,
      description: "EFS File System ID",
      exportName: `${this.stackName}-efs-id`,
    });

    new cdk.CfnOutput(this, "LoadBalancerDns", {
      value: this.loadBalancer.loadBalancerDnsName,
      description: "ALB DNS name",
      exportName: `${this.stackName}-alb-dns`,
    });

    new cdk.CfnOutput(this, "LoadBalancerArn", {
      value: this.loadBalancer.loadBalancerArn,
      description: "ALB ARN",
      exportName: `${this.stackName}-alb-arn`,
    });

    new cdk.CfnOutput(this, "ListenerArn", {
      value: this.listener.listenerArn,
      description: "ALB Listener ARN",
      exportName: `${this.stackName}-listener-arn`,
    });

    new cdk.CfnOutput(this, "GrafanaUrl", {
      value: `http://${this.loadBalancer.loadBalancerDnsName}/grafana`,
      description: "Grafana Dashboard URL",
      exportName: `${this.stackName}-grafana-url`,
    });

    new cdk.CfnOutput(this, "PrometheusUrl", {
      value: `http://${this.loadBalancer.loadBalancerDnsName}/prometheus`,
      description: "Prometheus URL",
      exportName: `${this.stackName}-prometheus-url`,
    });
  }
}
