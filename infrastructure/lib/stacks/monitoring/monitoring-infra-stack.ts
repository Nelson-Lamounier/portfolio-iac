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
import { MonitoringConfigBucketConstruct } from "../../constructs/monitoring";

import {
  AlbConstruct,
  AlbListenerConstruct,
} from "../../constructs/networking/alb";

/**
 * LAYER 1: Monitoring Infrastructure Stack
 *
 * This stack contains long-lived infrastructure resources that rarely change:
 * - VPC references
 * - ECS Cluster
 * - EC2 Auto Scaling Group
 * - Application Load Balancer
 * - Security Groups
 * - IAM Roles
 *
 * Deploy: Only when infrastructure changes (rare)
 * Depends on: NetworkingStack, MonitoringEfsStack
 */
export interface MonitoringInfraStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  envName: string;
  allowedIpRanges?: string[];
  certificateArn?: string;
  enableHttps?: boolean;
  enableAccessLogs?: boolean;
  // External EFS resources (from MonitoringEfsStack)
  fileSystem: efs.IFileSystem;
  efsAccessPoint: efs.IAccessPoint;
  efsAvailabilityZone: string;
  efsSecurityGroup: ec2.ISecurityGroup;
}

export class MonitoringInfraStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly autoScalingGroup: autoscaling.AutoScalingGroup;
  public readonly fileSystem: efs.IFileSystem;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly listener: elbv2.ApplicationListener;
  public readonly taskLogGroup: logs.LogGroup;
  public readonly eventLogGroup: logs.LogGroup;
  public readonly efsAccessPoint: efs.IAccessPoint;
  public readonly configBucket: MonitoringConfigBucketConstruct;
  public readonly alb: AlbConstruct;
  public readonly listeners: AlbListenerConstruct;
  public readonly efsAvailabilityZone: string;

  constructor(scope: Construct, id: string, props: MonitoringInfraStackProps) {
    super(scope, id, props);

    const {
      vpc,
      envName,
      allowedIpRanges = ["0.0.0.0/0"],
      certificateArn,
      enableHttps = !!certificateArn,
      enableAccessLogs = true,
      fileSystem,
      efsAccessPoint,
      efsAvailabilityZone,
      efsSecurityGroup,
    } = props;

    // Store external EFS resources
    this.fileSystem = fileSystem;
    this.efsAccessPoint = efsAccessPoint;
    this.efsAvailabilityZone = efsAvailabilityZone;

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
    // EFS FILE SYSTEM (External - from MonitoringEfsStack)
    // ========================================================================
    // EFS resources are now provided by the external MonitoringEfsStack
    // This ensures proper separation of concerns and independent lifecycle management

    // ========================================================================
    // ECS CLUSTER
    // ========================================================================
    this.cluster = new ecs.Cluster(this, "MonitoringCluster", {
      vpc,
      clusterName: `${envName}-monitoring-cluster`,
    });

    // Enable Container Insights for enhanced monitoring
    const cfnCluster = this.cluster.node.defaultChild as ecs.CfnCluster;
    cfnCluster.clusterSettings = [
      {
        name: "containerInsights",
        value: "enabled",
      },
    ];

    // ========================================================================
    // EC2 AUTO SCALING GROUP
    // ========================================================================
    // CRITICAL: ASG must be in same AZ as EFS One Zone mount target
    this.autoScalingGroup = this.createAutoScalingGroup(
      vpc,
      envName,
      this.fileSystem,
      this.efsAvailabilityZone,
      efsSecurityGroup
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

    if (enableHttps && certificateArn) {
      // HTTPS listener with certificate
      this.listener = this.loadBalancer.addListener("MonitoringListener", {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [elbv2.ListenerCertificate.fromArn(certificateArn)],
        defaultAction: elbv2.ListenerAction.redirect({
          path: "/grafana",
          permanent: true,
        }),
      });

      // HTTP to HTTPS redirect
      this.loadBalancer.addListener("HttpRedirect", {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: "HTTPS",
          port: "443",
          permanent: true,
        }),
      });
    } else {
      // HTTP only (fallback if no certificate)
      this.listener = this.loadBalancer.addListener("MonitoringListener", {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.redirect({
          path: "/grafana",
          permanent: true,
        }),
      });
    }

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

  private createAutoScalingGroup(
    vpc: ec2.IVpc,
    envName: string,
    fileSystem: efs.IFileSystem,
    availabilityZone: string,
    efsSecurityGroup: ec2.ISecurityGroup
  ): autoscaling.AutoScalingGroup {
    // CRITICAL: Constrain ASG to same AZ as EFS One Zone mount target
    // This ensures EC2 instances can always mount the EFS filesystem
    const asg = this.cluster.addCapacity("MonitoringCapacity", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
        availabilityZones: [availabilityZone], // Force same AZ as EFS
      },
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

    // Allow EFS access (connect to external EFS security group)
    asg.connections.allowTo(
      efsSecurityGroup,
      ec2.Port.tcp(2049),
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

    // Grant SSM permissions to read EFS setup script
    asg.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/monitoring/${this.stackName}/*`,
        ],
      })
    );

    // User data script - mount EFS, execute setup script, then create symlinks
    asg.addUserData(
      "#!/bin/bash",
      "set -e",
      "",
      "# Enable detailed logging",
      "exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1",
      "echo 'Starting EFS setup user data script...'",
      "",
      "# Install EFS utilities",
      "yum install -y amazon-efs-utils",
      "",
      "# Create mount point and mount EFS with IAM authentication",
      "mkdir -p /mnt/efs",
      `echo 'Mounting EFS ${fileSystem.fileSystemId}...'`,
      `mount -t efs -o tls,iam ${fileSystem.fileSystemId}:/ /mnt/efs`,
      "",
      "# Add to fstab for persistence across reboots",
      `echo "${fileSystem.fileSystemId}:/ /mnt/efs efs _netdev,tls,iam 0 0" >> /etc/fstab`,
      "",
      "# Wait a moment for EFS to be fully mounted",
      "sleep 5",
      "",
      "# Check if directories already exist (EFS might be persistent from previous deployments)",
      "if [ -d '/mnt/efs/prometheus-data' ] && [ -d '/mnt/efs/grafana-data' ]; then",
      "  echo 'EFS directories already exist, skipping setup script'",
      "else",
      "  echo 'EFS directories do not exist, executing setup script...'",
      "  ",
      "  # Download and execute EFS setup script from SSM",
      "  echo 'Downloading EFS setup script from SSM...'",
      `  aws ssm get-parameter --region ${this.region} --name "/monitoring/${this.stackName}/efs-setup-script" --query "Parameter.Value" --output text > /tmp/efs-setup.sh`,
      "  chmod +x /tmp/efs-setup.sh",
      "  ",
      "  # Execute setup script with error handling",
      "  if /tmp/efs-setup.sh; then",
      "    echo 'EFS setup script executed successfully'",
      "  else",
      "    echo 'ERROR: EFS setup script failed'",
      "    echo 'Setup script content:'",
      "    cat /tmp/efs-setup.sh",
      "    echo 'Current EFS contents:'",
      "    ls -la /mnt/efs/",
      "    exit 1",
      "  fi",
      "fi",
      "",
      "# Verify directory structure exists after setup",
      "echo 'Verifying EFS directory structure...'",
      "if [ ! -d '/mnt/efs/prometheus-data' ]; then",
      "  echo 'ERROR: prometheus-data directory still missing after setup'",
      "  ls -la /mnt/efs/",
      "  exit 1",
      "fi",
      "",
      "if [ ! -d '/mnt/efs/grafana-data' ]; then",
      "  echo 'ERROR: grafana-data directory still missing after setup'",
      "  ls -la /mnt/efs/",
      "  exit 1",
      "fi",
      "",
      "# Create symlinks for container access",
      "echo 'Creating symlinks for container access...'",
      "ln -sf /mnt/efs/prometheus-data /mnt/prometheus-data",
      "ln -sf /mnt/efs/grafana-data /mnt/grafana-data",
      "ln -sf /mnt/efs/config/prometheus /mnt/prometheus-config",
      "ln -sf /mnt/efs/config/grafana/provisioning /mnt/grafana-provisioning",
      "ln -sf /mnt/efs/config/grafana/dashboards /mnt/grafana-dashboards",
      "",
      "# Verify symlinks and permissions",
      "echo 'Verifying symlinks and permissions...'",
      "ls -la /mnt/ | grep -E '(prometheus|grafana)'",
      "ls -la /mnt/efs/grafana-data/",
      "ls -la /mnt/efs/prometheus-data/",
      "",
      "echo 'User data script completed successfully'"
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
    allowedIpRanges: string[]
  ): elbv2.ApplicationLoadBalancer {
    const albSecurityGroup = new ec2.SecurityGroup(this, "MonitoringAlbSg", {
      vpc,
      description: "Security group for monitoring ALB",
      allowAllOutbound: true,
    });

    allowedIpRanges.forEach((ipRange) => {
      // HTTP
      albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(ipRange),
        ec2.Port.tcp(80),
        `Allow HTTP access from ${ipRange}`
      );

      // HTTPS
      albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(ipRange),
        ec2.Port.tcp(443),
        `Allow HTTPS access from ${ipRange}`
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

    // EFS outputs are now handled by MonitoringEfsStack

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
