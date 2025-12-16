/** @format */

import * as path from "path";

import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as efs from "aws-cdk-lib/aws-efs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3_assets from "aws-cdk-lib/aws-s3-assets";
import { Construct } from "constructs";

import {
  GrafanaConstruct,
  PrometheusConstruct,
  NodeExporterConstruct,
} from "../../constructs";
import { SuppressionManager } from "../../cdk-nag";
import { CrossAccountTarget } from "../../types";

export interface MonitoringEcsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  envName: string;
  albDnsName?: string;
  allowedIpRanges?: string[];
  /** Cross-account targets to scrape via VPC peering */
  crossAccountTargets?: CrossAccountTarget[];
  /** Enable EFS for persistent storage (survives instance replacement) */
  enablePersistence?: boolean;
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

    const {
      vpc,
      envName,
      albDnsName,
      allowedIpRanges,
      crossAccountTargets,
      enablePersistence,
    } = props;

    // DEPRECATED: EFS creation moved to dedicated MonitoringEfsStack
    // This stack now assumes external EFS is provided if persistence is needed
    // For new deployments, use MonitoringEfsStack + MonitoringInfraStack instead
    let fileSystem: efs.FileSystem | undefined;
    if (enablePersistence) {
      console.warn(
        "WARNING: MonitoringEcsStack EFS creation is deprecated. " +
          "Use MonitoringEfsStack for new deployments to avoid conflicts."
      );
      // EFS creation removed to prevent multiple EFS instances
      // If you need persistence, deploy MonitoringEfsStack separately
      fileSystem = undefined;
    }

    // Create ECS Cluster for monitoring
    const { cluster, autoScalingGroup } = this.createEcsCluster(
      vpc,
      envName,
      crossAccountTargets,
      fileSystem
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
    SuppressionManager.applyToStack(this, "MonitoringStack", envName);

    // ========================================================================
    // RESOURCE TAGGING
    // ========================================================================
    cdk.Tags.of(this).add("Stack", "MonitoringEcs");
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }

  /**
   * DEPRECATED: Create EFS file system for persistent monitoring data
   *
   * This method is deprecated to prevent multiple EFS instances.
   * Use MonitoringEfsStack for new deployments instead.
   *
   * Uses One Zone storage class for cost optimization (~47% cheaper than Standard)
   */
  private createEfsFileSystem(
    _vpc: ec2.IVpc,
    _envName: string
  ): efs.FileSystem {
    throw new Error(
      "DEPRECATED: MonitoringEcsStack.createEfsFileSystem() is deprecated. " +
        "Use MonitoringEfsStack for new deployments to avoid multiple EFS instances. " +
        "This method was disabled to prevent conflicts with the new centralized EFS stack."
    );

    // Original code commented out to prevent accidental usage
    /*
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

    const cfnFileSystem = fileSystem.node.defaultChild as efs.CfnFileSystem;
    cfnFileSystem.availabilityZoneName = availabilityZone;

    cdk.Tags.of(fileSystem).add("Name", `${envName}-monitoring-efs`);
    cdk.Tags.of(fileSystem).add("Environment", envName);
    cdk.Tags.of(fileSystem).add("StorageClass", "One-Zone-IA");

    new cdk.CfnOutput(this, "EfsFileSystemId", {
      value: fileSystem.fileSystemId,
      description: "EFS File System ID for monitoring data persistence",
      exportName: `${this.stackName}-efs-id`,
    });

    new cdk.CfnOutput(this, "EfsAvailabilityZone", {
      value: availabilityZone,
      description: "Availability Zone for One Zone EFS",
      exportName: `${this.stackName}-efs-az`,
    });

    return fileSystem;
    */
  }

  /**
   * Create ECS cluster with EC2 capacity and S3-based config provisioning
   */
  private createEcsCluster(
    vpc: ec2.IVpc,
    envName: string,
    crossAccountTargets?: CrossAccountTarget[],
    fileSystem?: efs.FileSystem
  ): { cluster: ecs.Cluster; autoScalingGroup: autoscaling.AutoScalingGroup } {
    // Constrain ECS capacity to the first public AZ to align with EFS mount target
    const publicAz0Subnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
      availabilityZones: [vpc.availabilityZones[0]],
      onePerAz: true,
    });

    const cluster = new ecs.Cluster(this, "MonitoringCluster", {
      vpc,
      clusterName: `${envName}-monitoring-cluster`,
    });

    // Enable Container Insights
    const cfnCluster = cluster.node.defaultChild as ecs.CfnCluster;
    cfnCluster.clusterSettings = [
      {
        name: "containerInsights",
        value: "enabled",
      },
    ];

    // Add EC2 capacity
    const autoScalingGroup = cluster.addCapacity("MonitoringCapacity", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      vpcSubnets: { subnets: publicAz0Subnets.subnets },
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

    // ========================================================================
    // S3 ASSETS FOR CONFIG FILES
    // CDK automatically uploads these to S3 and manages versioning
    // ========================================================================
    // Resolve path from compiled dist folder back to source config directory
    // __dirname points to: infrastructure/dist/lib/stacks/monitoring
    // We need to go up 4 levels to infrastructure root, then into config
    const configBasePath = path.resolve(__dirname, "../../../../config");

    const prometheusConfigAsset = new s3_assets.Asset(
      this,
      "PrometheusConfigAsset",
      {
        path: path.join(configBasePath, "prometheus"),
      }
    );

    const grafanaProvisioningAsset = new s3_assets.Asset(
      this,
      "GrafanaProvisioningAsset",
      {
        path: path.join(configBasePath, "grafana", "provisioning"),
      }
    );

    // Dashboard JSON files - pre-configured dashboards deployed with the stack
    const grafanaDashboardsAsset = new s3_assets.Asset(
      this,
      "GrafanaDashboardsAsset",
      {
        path: path.join(configBasePath, "grafana", "dashboards"),
      }
    );

    // Grant EC2 instances permission to read the S3 assets
    prometheusConfigAsset.grantRead(autoScalingGroup.role);
    grafanaProvisioningAsset.grantRead(autoScalingGroup.role);
    grafanaDashboardsAsset.grantRead(autoScalingGroup.role);

    // Allow EFS access from EC2 instances (if enabled)
    if (fileSystem) {
      fileSystem.connections.allowDefaultPortFrom(
        autoScalingGroup,
        "Allow ECS instances to mount EFS"
      );

      autoScalingGroup.role.addToPrincipalPolicy(
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
    }

    // Build and apply UserData
    const userDataCommands = this.buildUserData(
      envName,
      fileSystem,
      prometheusConfigAsset,
      grafanaProvisioningAsset,
      grafanaDashboardsAsset,
      crossAccountTargets
    );
    autoScalingGroup.addUserData(...userDataCommands);

    // Security group rules
    autoScalingGroup.connections.allowToAnyIpv4(
      ec2.Port.tcp(443),
      "Allow HTTPS outbound for ECS agent and S3"
    );

    autoScalingGroup.connections.allowInternally(
      ec2.Port.tcp(9100),
      "Allow Prometheus to scrape Node Exporter"
    );

    autoScalingGroup.connections.allowInternally(
      ec2.Port.tcp(9090),
      "Allow Grafana to query Prometheus"
    );

    cdk.Tags.of(cluster).add("Environment", envName);
    cdk.Tags.of(cluster).add("Purpose", "Monitoring");

    return { cluster, autoScalingGroup };
  }

  /**
   * Build UserData script that:
   * 1. Mounts EFS (if enabled)
   * 2. Downloads config templates from S3
   * 3. Processes templates with environment-specific values
   * 4. Starts ECS agent after setup completes
   */
  private buildUserData(
    envName: string,
    fileSystem: efs.FileSystem | undefined,
    prometheusAsset: s3_assets.Asset,
    grafanaAsset: s3_assets.Asset,
    dashboardsAsset: s3_assets.Asset,
    crossAccountTargets?: CrossAccountTarget[]
  ): string[] {
    const region = cdk.Stack.of(this).region;

    // Generate cross-account scrape config if targets are provided
    const crossAccountConfig =
      crossAccountTargets && crossAccountTargets.length > 0
        ? this.generateCrossAccountScrapeConfig(crossAccountTargets)
        : [];

    // EFS mounting commands (conditional)
    const efsCommands = fileSystem
      ? this.buildEfsMountCommands(fileSystem, region)
      : this.buildLocalStorageCommands();

    // Cross-account config injection (if any)
    const crossAccountInjection =
      crossAccountConfig.length > 0
        ? [
            "",
            "echo '=== Injecting cross-account scrape targets ==='",
            "cat >> /mnt/prometheus-config/prometheus.yml << 'CROSSACCOUNT'",
            ...crossAccountConfig,
            "CROSSACCOUNT",
          ]
        : [];

    return [
      "#!/bin/bash",
      "set -ex",
      "",
      "# ==========================================================================",
      "# MONITORING STACK PROVISIONING SCRIPT",
      "# This script is generated by CDK and runs on EC2 instance startup",
      "# ==========================================================================",
      "",
      "exec > >(tee -a /var/log/monitoring-setup.log) 2>&1",
      "",
      "echo '========================================='",
      "echo 'Monitoring Setup Started'",
      `echo 'Environment: ${envName}'`,
      `echo 'Region: ${region}'`,
      "date",
      "echo '========================================='",
      "",
      "# Stop ECS agent until setup completes to prevent task scheduling",
      "echo 'Stopping ECS agent...'",
      "systemctl stop ecs || true",
      "",
      "# Add ec2-user to docker group",
      "usermod -a -G docker ec2-user",
      "",
      "# ==========================================================================",
      "# STORAGE SETUP (EFS or Local)",
      "# ==========================================================================",
      ...efsCommands,
      "",
      "# ==========================================================================",
      "# CREATE CONFIG DIRECTORIES",
      "# ==========================================================================",
      "echo 'Creating config directories...'",
      "mkdir -p /mnt/prometheus-config",
      "mkdir -p /mnt/grafana-provisioning/datasources",
      "mkdir -p /mnt/grafana-provisioning/dashboards",
      "mkdir -p /mnt/grafana-dashboards",
      "",
      "# ==========================================================================",
      "# DOWNLOAD CONFIGS FROM S3 (CDK Assets)",
      "# ==========================================================================",
      "echo '=== Downloading config templates from S3 ==='",
      "",
      "# Download and extract Prometheus config",
      `aws s3 cp s3://${prometheusAsset.s3BucketName}/${prometheusAsset.s3ObjectKey} /tmp/prometheus-config.zip --region ${region}`,
      "mkdir -p /tmp/prometheus-config",
      "unzip -o /tmp/prometheus-config.zip -d /tmp/prometheus-config",
      'echo "Prometheus config contents after unzip:"',
      "ls -laR /tmp/prometheus-config/",
      "",
      "# Download and extract Grafana provisioning",
      `aws s3 cp s3://${grafanaAsset.s3BucketName}/${grafanaAsset.s3ObjectKey} /tmp/grafana-provisioning.zip --region ${region}`,
      "mkdir -p /tmp/grafana-provisioning",
      "unzip -o /tmp/grafana-provisioning.zip -d /tmp/grafana-provisioning",
      'echo "Grafana provisioning contents:"',
      "find /tmp/grafana-provisioning -type f",
      "",
      "# Download and extract Grafana dashboards",
      `aws s3 cp s3://${dashboardsAsset.s3BucketName}/${dashboardsAsset.s3ObjectKey} /tmp/grafana-dashboards.zip --region ${region}`,
      "mkdir -p /tmp/grafana-dashboards",
      "unzip -o /tmp/grafana-dashboards.zip -d /tmp/grafana-dashboards",
      'echo "Grafana dashboards contents:"',
      "find /tmp/grafana-dashboards -name '*.json'",
      "",
      "# ==========================================================================",
      "# PROCESS CONFIG TEMPLATES",
      "# Replace placeholders with actual values",
      "# ==========================================================================",
      "echo '=== Processing config templates ==='",
      "",
      "# Get host private IP (needed for Grafana -> Prometheus communication)",
      "HOST_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)",
      'echo "Host Private IP: $HOST_IP"',
      "",
      "# Process Prometheus config template",
      "echo 'Processing Prometheus config...'",
      "",
      "# Find the prometheus.yml file (might be nested in subdirectory)",
      "PROM_CONFIG=$(find /tmp/prometheus-config -name 'prometheus.yml' -o -name 'prometheus.yml.template' | head -1)",
      'echo "Found Prometheus config at: $PROM_CONFIG"',
      "",
      'if [ -z "$PROM_CONFIG" ]; then',
      '  echo "ERROR: No Prometheus config found in S3 asset"',
      "  echo 'Directory structure:'",
      "  find /tmp/prometheus-config -type f",
      "  exit 1",
      "fi",
      "",
      "# Check if it's a template or regular file",
      'if [[ "$PROM_CONFIG" == *.template ]]; then',
      '  echo "Processing template file..."',
      `  sed -e 's/{{ENV_NAME}}/${envName}/g' \\`,
      `      -e 's/{{REGION}}/${region}/g' \\`,
      "      -e '/CROSS_ACCOUNT_TARGETS_PLACEHOLDER/d' \\",
      '      "$PROM_CONFIG" > /mnt/prometheus-config/prometheus.yml',
      "  echo '✓ Prometheus config processed from template'",
      "else",
      '  echo "Copying regular config file..."',
      '  cp "$PROM_CONFIG" /mnt/prometheus-config/prometheus.yml',
      "  echo '✓ Prometheus config copied'",
      "fi",
      "",
      "# Also copy alerts.yml if it exists",
      "ALERTS_FILE=$(find /tmp/prometheus-config -name 'alerts.yml' | head -1)",
      'if [ -n "$ALERTS_FILE" ]; then',
      '  cp "$ALERTS_FILE" /mnt/prometheus-config/alerts.yml',
      "  echo '✓ Alerts config copied'",
      "fi",
      ...crossAccountInjection,
      "",
      "# Process Grafana datasource template",
      "echo 'Processing Grafana datasource config...'",
      "",
      "# Find datasource config (might be nested)",
      "DATASOURCE_CONFIG=$(find /tmp/grafana-provisioning -path '*/datasources/prometheus.yml*' | head -1)",
      'echo "Found datasource config at: $DATASOURCE_CONFIG"',
      "",
      'if [ -n "$DATASOURCE_CONFIG" ]; then',
      '  if [[ "$DATASOURCE_CONFIG" == *.template ]]; then',
      '    echo "Processing datasource template..."',
      '    sed -e "s/{{HOST_IP}}/$HOST_IP/g" \\',
      '        "$DATASOURCE_CONFIG" > /mnt/grafana-provisioning/datasources/prometheus.yml',
      "    echo '✓ Grafana datasource config processed from template'",
      "  else",
      '    echo "Copying datasource config..."',
      "    # Replace HOST_IP placeholder if it exists",
      '    sed -e "s/HOST_IP/$HOST_IP/g" \\',
      '        "$DATASOURCE_CONFIG" > /mnt/grafana-provisioning/datasources/prometheus.yml',
      "    echo '✓ Grafana datasource config copied'",
      "  fi",
      "else",
      '  echo "WARNING: No Grafana datasource config found, creating default..."',
      "  cat > /mnt/grafana-provisioning/datasources/prometheus.yml << EOF",
      "apiVersion: 1",
      "datasources:",
      "  - name: Prometheus",
      "    type: prometheus",
      "    uid: prometheus",
      "    access: proxy",
      "    url: http://${HOST_IP}:9090/prometheus",
      "    isDefault: true",
      "    editable: true",
      "EOF",
      "fi",
      "",
      "# Copy dashboard provisioning config",
      "echo 'Processing Grafana dashboard provisioning...'",
      "",
      "# Find dashboard provisioning config (might be nested)",
      "DASHBOARD_PROV=$(find /tmp/grafana-provisioning -path '*/dashboards/*.yml' | head -1)",
      'if [ -n "$DASHBOARD_PROV" ]; then',
      '  cp "$DASHBOARD_PROV" /mnt/grafana-provisioning/dashboards/dashboards.yml',
      "  echo '✓ Dashboard provisioning config copied'",
      "else",
      '  echo "Creating default dashboard provisioning..."',
      "  cat > /mnt/grafana-provisioning/dashboards/dashboards.yml << 'EOF'",
      "apiVersion: 1",
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
      "fi",
      "",
      "# Copy pre-configured dashboards",
      "echo 'Copying pre-configured dashboards...'",
      "DASHBOARD_COUNT=0",
      "while IFS= read -r -d '' dashboard; do",
      '  cp "$dashboard" /mnt/grafana-dashboards/',
      "  ((DASHBOARD_COUNT++))",
      "done < <(find /tmp/grafana-dashboards -name '*.json' -print0)",
      "",
      "if [ $DASHBOARD_COUNT -gt 0 ]; then",
      '  echo "✓ Copied $DASHBOARD_COUNT dashboard(s)"',
      "  ls -la /mnt/grafana-dashboards/",
      "else",
      '  echo "No dashboard JSON files found in S3 asset"',
      "fi",
      "",
      "# ==========================================================================",
      "# SET PERMISSIONS",
      "# ==========================================================================",
      "echo '=== Setting file permissions ==='",
      "",
      "# Prometheus runs as 'nobody' user (UID 65534)",
      "chown -R 65534:65534 /mnt/prometheus-config",
      "chmod -R 755 /mnt/prometheus-config",
      "",
      "# Grafana runs as 'grafana' user (UID 472)",
      "chown -R 472:0 /mnt/grafana-provisioning /mnt/grafana-dashboards",
      "chmod -R 755 /mnt/grafana-provisioning /mnt/grafana-dashboards",
      "",
      "# Set permissions on data directories",
      "if [ -d /mnt/efs ]; then",
      "  echo 'Setting EFS data directory permissions...'",
      "  chown -R 65534:65534 /mnt/efs/prometheus-data",
      "  chown -R 472:0 /mnt/efs/grafana-data",
      "  chmod -R 755 /mnt/efs/prometheus-data",
      "  chmod -R 775 /mnt/efs/grafana-data",
      "else",
      "  echo 'Setting local data directory permissions...'",
      "  chown -R 65534:65534 /mnt/prometheus-data",
      "  chown -R 472:0 /mnt/grafana-data",
      "  chmod -R 755 /mnt/prometheus-data",
      "  chmod -R 775 /mnt/grafana-data",
      "fi",
      "",
      "# ==========================================================================",
      "# VERIFICATION",
      "# ==========================================================================",
      "echo '=== Verifying setup ==='",
      "",
      "echo '--- Prometheus Config ---'",
      "cat /mnt/prometheus-config/prometheus.yml",
      "echo ''",
      "",
      "echo '--- Grafana Datasource Config ---'",
      "cat /mnt/grafana-provisioning/datasources/prometheus.yml",
      "echo ''",
      "",
      "echo '--- Directory Structure ---'",
      "ls -la /mnt/ | grep -E '(prometheus|grafana|efs)'",
      "",
      "if [ -d /mnt/efs ]; then",
      "  echo '--- EFS Contents ---'",
      "  ls -la /mnt/efs/",
      "fi",
      "",
      "# Verify critical files exist",
      "echo '--- Verifying required files ---'",
      "REQUIRED_FILES=()",
      'REQUIRED_FILES+=("/mnt/prometheus-config/prometheus.yml")',
      'REQUIRED_FILES+=("/mnt/grafana-provisioning/datasources/prometheus.yml")',
      'REQUIRED_FILES+=("/mnt/grafana-provisioning/dashboards/dashboards.yml")',
      "",
      'for f in "${REQUIRED_FILES[@]}"; do',
      '  if [ -f "$f" ]; then',
      '    echo "✓ $f exists"',
      "  else",
      '    echo "✗ ERROR: Missing required file: $f"',
      "    exit 1",
      "  fi",
      "done",
      "",
      "# Check for dashboards (not required, but log status)",
      "DASHBOARD_COUNT=$(find /mnt/grafana-dashboards -name '*.json' 2>/dev/null | wc -l)",
      'echo "✓ Found $DASHBOARD_COUNT pre-configured dashboard(s)"',
      "",
      "# Create completion marker",
      "touch /var/lib/cloud/instance/monitoring-setup-complete",
      "",
      "echo '========================================='",
      "echo '✓ Monitoring setup completed successfully!'",
      "date",
      "echo '========================================='",
      "",
      "# ==========================================================================",
      "# START ECS AGENT",
      "# ==========================================================================",
      "echo 'Starting ECS agent...'",
      "systemctl start ecs",
      "systemctl enable ecs",
      "",
      "echo '✓ ECS agent started - ready for task scheduling'",
      "echo ''",
      "echo 'Setup log available at: /var/log/monitoring-setup.log'",
    ];
  }

  /**
   * Build EFS mount commands for persistent storage
   */
  private buildEfsMountCommands(
    fileSystem: efs.FileSystem,
    region: string
  ): string[] {
    return [
      "echo '=== Setting up EFS persistent storage ==='",
      "",
      "# Install EFS utilities",
      "yum install -y amazon-efs-utils nfs-utils",
      "",
      "# Create EFS mount point",
      "mkdir -p /mnt/efs",
      "",
      "# Resolve EFS mount target IP",
      `EFS_ID="${fileSystem.fileSystemId}"`,
      `EFS_DNS="$EFS_ID.efs.${region}.amazonaws.com"`,
      'echo "EFS ID: $EFS_ID"',
      'echo "EFS DNS: $EFS_DNS"',
      "",
      "EFS_IP=$(nslookup $EFS_DNS | grep \"Address:\" | tail -n1 | awk '{print $2}')",
      'echo "Resolved EFS IP: $EFS_IP"',
      "",
      "# Mount EFS (try NFS4 first, fallback to EFS helper)",
      'if [ -n "$EFS_IP" ] && [ "$EFS_IP" != "" ]; then',
      '  echo "Mounting EFS using NFS4 with IP: $EFS_IP"',
      "  mount -t nfs4 -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2 $EFS_IP:/ /mnt/efs",
      "else",
      '  echo "DNS resolution failed, using EFS mount helper with TLS"',
      "  mount -t efs -o tls $EFS_ID:/ /mnt/efs",
      "fi",
      "",
      "# Verify mount succeeded",
      "if ! mountpoint -q /mnt/efs; then",
      '  echo "ERROR: Failed to mount EFS filesystem"',
      "  dmesg | tail -20",
      "  exit 1",
      "fi",
      "echo '✓ EFS mounted successfully at /mnt/efs'",
      "",
      "# Add to fstab for persistence across reboots",
      'echo "$EFS_ID:/ /mnt/efs efs defaults,_netdev,tls 0 0" >> /etc/fstab',
      "",
      "# Create persistent data directories on EFS",
      "echo 'Creating persistent directories on EFS...'",
      "mkdir -p /mnt/efs/prometheus-data",
      "mkdir -p /mnt/efs/grafana-data",
      "mkdir -p /mnt/efs/grafana-data/plugins",
      "mkdir -p /mnt/efs/grafana-data/logs",
      "",
      "# Remove any existing local directories and create symlinks to EFS",
      "rm -rf /mnt/prometheus-data /mnt/grafana-data 2>/dev/null || true",
      "ln -sf /mnt/efs/prometheus-data /mnt/prometheus-data",
      "ln -sf /mnt/efs/grafana-data /mnt/grafana-data",
      "",
      "# Verify symlinks",
      "if [ ! -L /mnt/prometheus-data ]; then",
      '  echo "ERROR: Failed to create prometheus-data symlink"',
      "  exit 1",
      "fi",
      "echo '✓ Data symlinks created successfully'",
    ];
  }

  /**
   * Build local storage commands (no EFS - data not persistent)
   */
  private buildLocalStorageCommands(): string[] {
    return [
      "echo '=== Setting up local storage (non-persistent) ==='",
      "echo 'WARNING: Data will not persist across instance replacement'",
      "",
      "# Create local data directories",
      "mkdir -p /mnt/prometheus-data",
      "mkdir -p /mnt/grafana-data",
      "mkdir -p /mnt/grafana-data/plugins",
      "mkdir -p /mnt/grafana-data/logs",
      "",
      "echo '✓ Local directories created'",
    ];
  }

  /**
   * Generate Prometheus scrape config for cross-account targets
   */
  private generateCrossAccountScrapeConfig(
    targets: CrossAccountTarget[]
  ): string[] {
    const lines: string[] = [];

    // Separate targets by type
    const nodeExporterTargets = targets.filter(
      (t) => !t.targetType || t.targetType === "node-exporter"
    );
    const applicationTargets = targets.filter(
      (t) => t.targetType === "application"
    );

    // Group node-exporter targets by environment
    const nodeExporterByEnv = nodeExporterTargets.reduce(
      (acc, target) => {
        if (!acc[target.envName]) {
          acc[target.envName] = [];
        }
        acc[target.envName].push(target);
        return acc;
      },
      {} as Record<string, CrossAccountTarget[]>
    );

    // Generate scrape config for node-exporter targets
    for (const [env, envTargets] of Object.entries(nodeExporterByEnv)) {
      lines.push("");
      lines.push(
        `  # Cross-Account: ${env} Environment - Node Exporter (via VPC Peering)`
      );
      lines.push(`  - job_name: 'node-exporter-${env}'`);
      lines.push("    static_configs:");
      lines.push("      - targets:");

      for (const target of envTargets) {
        const port = target.port;
        lines.push(`          - '${target.privateIp}:${port}'`);
      }

      lines.push("        labels:");
      lines.push(`          environment: '${env}'`);
      lines.push("          service: 'node-exporter'");
      lines.push(`          account: '${env}'`);
      lines.push("          source: 'cross-account'");
    }

    // Group application targets by environment
    const applicationByEnv = applicationTargets.reduce(
      (acc, target) => {
        if (!acc[target.envName]) {
          acc[target.envName] = [];
        }
        acc[target.envName].push(target);
        return acc;
      },
      {} as Record<string, CrossAccountTarget[]>
    );

    // Generate scrape config for application targets
    for (const [env, envTargets] of Object.entries(applicationByEnv)) {
      lines.push("");
      lines.push(
        `  # Cross-Account: ${env} Environment - Application (via VPC Peering)`
      );
      lines.push(`  - job_name: 'nextjs-${env}'`);
      lines.push("    metrics_path: '/api/metrics'");
      lines.push("    static_configs:");
      lines.push("      - targets:");

      for (const target of envTargets) {
        const port = target.port;
        lines.push(`          - '${target.privateIp}:${port}'`);
      }

      lines.push("        labels:");
      lines.push(`          environment: '${env}'`);
      lines.push("          service: 'nextjs'");
      lines.push("          app: 'portfolio'");
      lines.push(`          account: '${env}'`);
      lines.push("          source: 'cross-account'");
    }

    return lines;
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

  private configureSecurityGroupConnections(): void {
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
    const nodeExporter = new NodeExporterConstruct(this, "NodeExporter", {
      cluster: cluster,
      envName: `${envName}-monitoring`,
      serviceName: `${envName}-monitoring-node-exporter`,
      memoryReservationMiB: 64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      enableExecuteCommand: true,
    });

    return nodeExporter.service;
  }

  private configureLoadBalancerRouting(): void {
    const listener = this.loadBalancer.addListener("MonitoringListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

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
        deregistrationDelay: cdk.Duration.seconds(30),
      }
    );

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
        deregistrationDelay: cdk.Duration.seconds(30),
      }
    );

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

    listener.addAction("DefaultAction", {
      action: elbv2.ListenerAction.redirect({
        path: "/grafana",
        permanent: true,
      }),
    });

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
}
