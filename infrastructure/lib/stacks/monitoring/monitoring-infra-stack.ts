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
  efsInitializationComplete: cdk.CustomResource;
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
      efsInitializationComplete,
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
      efsSecurityGroup,
      efsInitializationComplete
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
    efsSecurityGroup: ec2.ISecurityGroup,
    efsInitializationComplete: cdk.CustomResource
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

    // Allow EFS access (connect to EFS security group)
    asg.connections.allowTo(
      efsSecurityGroup,
      ec2.Port.tcp(2049),
      "Allow ECS instances to mount EFS"
    );

    // EFS security group is managed by MonitoringEfsStack
    // No additional configuration needed here

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

    // Grant EFS describe permissions for debugging
    asg.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "elasticfilesystem:DescribeFileSystems",
          "elasticfilesystem:DescribeMountTargets",
        ],
        resources: ["*"], // These actions don't support resource-level permissions
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

    // User data script - robust EFS mounting and setup with proper error handling
    asg.addUserData(
      "#!/bin/bash",
      "set -e",
      "",
      "# Enable detailed logging",
      "exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1",
      "echo 'Starting EFS setup user data script...'",
      "date",
      "",
      "# Install required packages",
      "echo 'Installing required packages...'",
      "yum update -y",
      "",
      "# Install amazon-efs-utils with verification and fallback",
      "echo 'Installing amazon-efs-utils package...'",
      "if yum install -y amazon-efs-utils; then",
      "  echo 'amazon-efs-utils installed via yum successfully'",
      "else",
      "  echo 'Standard yum installation failed, trying alternative method...'",
      "  # Fallback: Install from GitHub releases",
      "  yum install -y git rpm-build make",
      "  cd /tmp",
      "  git clone https://github.com/aws/efs-utils",
      "  cd efs-utils",
      "  make rpm",
      "  yum install -y build/amazon-efs-utils*rpm",
      "  cd /",
      "  rm -rf /tmp/efs-utils",
      "fi",
      "",
      "# Verify amazon-efs-utils installation",
      "echo 'Verifying amazon-efs-utils installation...'",
      "if rpm -qa | grep -q amazon-efs-utils; then",
      "  echo 'amazon-efs-utils package installed successfully'",
      "  EFS_UTILS_VERSION=$(rpm -qa | grep amazon-efs-utils)",
      '  echo "Installed version: $EFS_UTILS_VERSION"',
      "else",
      "  echo 'ERROR: amazon-efs-utils package not found after installation attempts'",
      "  echo 'Available packages:'",
      "  yum list available | grep efs || echo 'No EFS packages available'",
      "  exit 1",
      "fi",
      "",
      "# Verify EFS mount helper is available",
      "if command -v mount.efs >/dev/null 2>&1; then",
      "  echo 'EFS mount helper (mount.efs) is available'",
      "else",
      "  echo 'ERROR: EFS mount helper (mount.efs) not found'",
      "  echo 'Checking /sbin/ directory:'",
      "  ls -la /sbin/mount.* | grep efs || echo 'No EFS mount helpers found'",
      "  exit 1",
      "fi",
      "",
      "# Install AWS CLI",
      "echo 'Installing AWS CLI...'",
      "yum install -y awscli",
      "",
      "# Verify AWS CLI is working",
      "echo 'Verifying AWS CLI...'",
      "aws --version",
      "aws sts get-caller-identity",
      "",
      "# Configure EFS utils for One Zone file system",
      "echo 'Configuring EFS utils for One Zone file system...'",
      "cat > /etc/efs-fscache.conf << 'EOF'",
      "# EFS Intelligent Tiering cache configuration for One Zone EFS",
      "optimize_for_performance = true",
      "cache_size_mb = 256",
      "EOF",
      "",
      "# Configure EFS utils main configuration",
      "cat >> /etc/efs-utils.conf << 'EOF'",
      "",
      "# One Zone EFS configuration",
      "[mount]",
      "# Use mount targets for One Zone file systems",
      "region = " + this.region,
      "# Enable IAM authentication by default",
      "iam = true",
      "# Use TLS encryption in transit",
      "tls = true",
      "# Optimize for One Zone EFS performance",
      "rsize = 1048576",
      "wsize = 1048576",
      "hard = true",
      "intr = true",
      "timeo = 600",
      "retrans = 2",
      "EOF",
      "",
      "# Verify EFS utils configuration",
      "echo 'Verifying EFS utils configuration...'",
      "if [ -f /etc/efs-utils.conf ]; then",
      "  echo 'EFS utils configuration file exists'",
      "  echo 'Configuration contents:'",
      "  cat /etc/efs-utils.conf",
      "else",
      "  echo 'ERROR: EFS utils configuration file not found'",
      "  exit 1",
      "fi",
      "",
      "if [ -f /etc/efs-fscache.conf ]; then",
      "  echo 'EFS cache configuration file exists'",
      "  echo 'Cache configuration contents:'",
      "  cat /etc/efs-fscache.conf",
      "else",
      "  echo 'ERROR: EFS cache configuration file not found'",
      "  exit 1",
      "fi",
      "",
      "# Test EFS mount helper availability",
      "echo 'Testing EFS mount helper...'",
      "mount.efs --help >/dev/null 2>&1 && echo 'EFS mount helper is functional' || echo 'WARNING: EFS mount helper may have issues'",
      "",
      "# Create mount point",
      "mkdir -p /mnt/efs",
      "",
      "# Validate EFS has mount targets before attempting mount",
      `echo 'Validating EFS ${fileSystem.fileSystemId} has mount targets...'`,
      `MOUNT_TARGETS=$(aws efs describe-mount-targets --region ${this.region} --file-system-id ${fileSystem.fileSystemId} --query 'length(MountTargets)' --output text 2>/dev/null || echo '0')`,
      'if [ "$MOUNT_TARGETS" = "0" ]; then',
      `  echo 'ERROR: EFS ${fileSystem.fileSystemId} has no mount targets'`,
      "  echo 'This indicates an orphaned EFS instance from a previous deployment'",
      "  echo 'Please redeploy the EFS stack or clean up orphaned EFS instances'",
      "  exit 1",
      "fi",
      'echo "Found $MOUNT_TARGETS mount target(s) for EFS"',
      "",
      "# Mount EFS using mount helper with retry logic",
      `echo 'Mounting EFS ${fileSystem.fileSystemId} using mount helper...'`,
      "MOUNT_RETRIES=5",
      "MOUNT_DELAY=15",
      "for i in $(seq 1 $MOUNT_RETRIES); do",
      `  echo "Mount attempt $i of $MOUNT_RETRIES for EFS ${fileSystem.fileSystemId}"`,
      "  ",
      "  # Use EFS mount helper for One Zone file system with IAM authentication",
      `  if timeout 90 mount -t efs -o tls,iam ${fileSystem.fileSystemId}:/ /mnt/efs; then`,
      "    echo 'EFS mounted successfully using mount helper'",
      "    break",
      "  else",
      "    echo 'EFS mount helper failed, trying direct NFS mount...'",
      "    # Fallback: Try to find mount target IP and mount directly",
      `    MOUNT_TARGET_IP=$(aws efs describe-mount-targets --region ${this.region} --file-system-id ${fileSystem.fileSystemId} --query 'MountTargets[0].IpAddress' --output text 2>/dev/null || echo '')`,
      '    if [ ! -z "$MOUNT_TARGET_IP" ] && [ "$MOUNT_TARGET_IP" != "None" ]; then',
      '      echo "Found mount target IP: $MOUNT_TARGET_IP"',
      "      if timeout 90 mount -t nfs4 -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,intr,timeo=600 $MOUNT_TARGET_IP:/ /mnt/efs; then",
      "        echo 'EFS mounted successfully using direct NFS'",
      "        break",
      "      fi",
      "    fi",
      '    echo "Mount attempt $i failed, retrying in $MOUNT_DELAY seconds..."',
      "    if [ $i -eq $MOUNT_RETRIES ]; then",
      "      echo 'ERROR: Failed to mount EFS after all retries'",
      "      echo 'Checking EFS mount helper configuration:'",
      "      cat /etc/efs-fscache.conf || echo 'No cache config found'",
      "      echo 'Network connectivity test:'",
      "      ping -c 3 8.8.8.8 || echo 'No internet connectivity'",
      "      echo 'EFS mount targets in region:'",
      `      aws efs describe-mount-targets --region ${this.region} --file-system-id ${fileSystem.fileSystemId} || echo 'Failed to describe mount targets'`,
      "      echo 'Checking EFS utils version:'",
      "      rpm -qa | grep amazon-efs-utils",
      "      echo 'Available EFS file systems:'",
      `      aws efs describe-file-systems --region ${this.region} || echo 'Failed to list EFS'`,
      "      exit 1",
      "    fi",
      "    sleep $MOUNT_DELAY",
      "  fi",
      "done",
      "",
      "# Verify mount was successful",
      "if ! mountpoint -q /mnt/efs; then",
      "  echo 'ERROR: EFS is not properly mounted'",
      "  mount | grep efs || echo 'No EFS mounts found'",
      "  exit 1",
      "fi",
      "",
      "# Add to fstab for persistence across reboots using mount helper",
      `echo "${fileSystem.fileSystemId}:/ /mnt/efs efs defaults,_netdev,tls,iam 0 0" >> /etc/fstab`,
      "",
      "# Wait for EFS to be fully ready",
      "echo 'Waiting for EFS to be fully ready...'",
      "sleep 10",
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

    // CRITICAL: Ensure ASG waits for EFS initialization to complete
    // This prevents EC2 instances from starting before the Lambda has created
    // the SSM parameters containing the EFS setup script
    asg.node.addDependency(efsInitializationComplete);

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
