/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { SuppressionManager } from "../../cdk-nag";
import { CrossAccountTarget } from "../../types";

/**
 * LAYER 0: Monitoring EFS Stack
 *
 * This stack manages persistent storage and configuration for monitoring:
 * - EFS FileSystem for persistent data
 * - Configuration files (prometheus.yml, grafana configs)
 * - Directory structure setup
 * - Access points and security groups
 *
 * Deploy: When changing monitoring configuration or storage setup
 * Depends on: NetworkingStack
 */
export interface MonitoringEfsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  envName: string;
  crossAccountTargets?: CrossAccountTarget[];
  enableEncryption?: boolean;
  lifecyclePolicy?: efs.LifecyclePolicy;
}

export class MonitoringEfsStack extends cdk.Stack {
  public readonly fileSystem: efs.FileSystem;
  public readonly accessPoint: efs.AccessPoint;
  public readonly mountTargetSecurityGroup: ec2.SecurityGroup;
  public readonly efsAvailabilityZone: string;

  constructor(scope: Construct, id: string, props: MonitoringEfsStackProps) {
    super(scope, id, props);

    const {
      vpc,
      envName,
      crossAccountTargets,
      enableEncryption = true,
      lifecyclePolicy = efs.LifecyclePolicy.AFTER_30_DAYS,
    } = props;

    // ========================================================================
    // EFS FILE SYSTEM
    // ========================================================================
    const efsResult = this.createEfsFileSystem(
      vpc,
      envName,
      enableEncryption,
      lifecyclePolicy
    );
    this.fileSystem = efsResult.fileSystem;
    this.efsAvailabilityZone = efsResult.availabilityZone;

    // ========================================================================
    // EFS ACCESS POINT
    // ========================================================================
    this.accessPoint = this.createEfsAccessPoint(this.fileSystem);

    // ========================================================================
    // SECURITY GROUP FOR MOUNT TARGETS
    // ========================================================================
    this.mountTargetSecurityGroup = this.createMountTargetSecurityGroup(
      vpc,
      envName
    );

    // ========================================================================
    // CONFIGURATION FILES & DIRECTORY STRUCTURE
    // ========================================================================
    this.createMonitoringConfigurations(crossAccountTargets);
    this.createDirectoryStructure();

    // ========================================================================
    // OUTPUTS
    // ========================================================================
    this.createOutputs();

    // ========================================================================
    // CDK NAG SUPPRESSIONS
    // ========================================================================
    this.applyCdkNagSuppressions();
  }

  private createEfsFileSystem(
    vpc: ec2.IVpc,
    envName: string,
    enableEncryption: boolean,
    lifecyclePolicy: efs.LifecyclePolicy
  ): { fileSystem: efs.FileSystem; availabilityZone: string } {
    // Use first public subnet's AZ for One Zone storage class (cost optimization)
    const publicSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
    });
    const availabilityZone = publicSubnets.availabilityZones[0];

    const fileSystem = new efs.FileSystem(this, "MonitoringEfs", {
      vpc,
      lifecyclePolicy,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      encrypted: enableEncryption,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Protect data
      // CRITICAL: For One Zone EFS, mount targets must be in the same AZ as the FileSystem
      vpcSubnets: {
        availabilityZones: [availabilityZone],
        subnetType: ec2.SubnetType.PUBLIC, // Use public subnets since no NAT Gateway
      },
      // Note: Backup policy needs to be configured separately
    });

    // Set One Zone storage class for cost optimization
    const cfnFileSystem = fileSystem.node.defaultChild as efs.CfnFileSystem;
    cfnFileSystem.availabilityZoneName = availabilityZone;
    cfnFileSystem.throughputMode = "provisioned";
    cfnFileSystem.provisionedThroughputInMibps = 10; // 10 MiB/s baseline

    // Add tags
    cdk.Tags.of(fileSystem).add("Name", `${envName}-monitoring-efs`);
    cdk.Tags.of(fileSystem).add("Environment", envName);
    cdk.Tags.of(fileSystem).add("Purpose", "monitoring-storage");

    return { fileSystem, availabilityZone };
  }

  private createEfsAccessPoint(fileSystem: efs.FileSystem): efs.AccessPoint {
    return new efs.AccessPoint(this, "MonitoringEfsAccessPoint", {
      fileSystem,
      path: "/monitoring",
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

  private createMountTargetSecurityGroup(
    vpc: ec2.IVpc,
    envName: string
  ): ec2.SecurityGroup {
    const securityGroup = new ec2.SecurityGroup(this, "EfsMountTargetSg", {
      vpc,
      description: `EFS mount target security group for ${envName} monitoring`,
      allowAllOutbound: false,
    });

    // Allow NFS traffic from VPC
    securityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(2049),
      "Allow NFS traffic from VPC"
    );

    cdk.Tags.of(securityGroup).add("Name", `${envName}-efs-mount-target-sg`);

    return securityGroup;
  }

  private createMonitoringConfigurations(
    crossAccountTargets?: CrossAccountTarget[]
  ) {
    // Create Prometheus configuration
    this.createPrometheusConfig(crossAccountTargets);

    // Create Grafana configuration
    this.createGrafanaConfig();

    // Create AlertManager configuration (future use)
    this.createAlertManagerConfig();
  }

  private createPrometheusConfig(crossAccountTargets?: CrossAccountTarget[]) {
    const scrapeConfigs = [
      {
        job_name: "prometheus",
        static_configs: [{ targets: ["localhost:9090"] }],
        scrape_interval: "15s",
        metrics_path: "/prometheus/metrics",
      },
      {
        job_name: "node-exporter",
        static_configs: [{ targets: ["localhost:9100"] }],
        scrape_interval: "15s",
      },
    ];

    // Add cross-account targets if provided
    if (crossAccountTargets) {
      crossAccountTargets.forEach((target) => {
        scrapeConfigs.push({
          job_name: `${target.targetType}-${target.envName}`,
          static_configs: [{ targets: [`${target.privateIp}:${target.port}`] }],
          scrape_interval: "30s",
          metrics_path: target.metricsPath || "/metrics",
        });
      });
    }

    const prometheusConfig = {
      global: {
        scrape_interval: "15s",
        evaluation_interval: "15s",
        external_labels: {
          environment: this.stackName,
          region: this.region,
        },
      },
      scrape_configs: scrapeConfigs,
    };

    // Store configuration as SSM parameter for now
    // In a real implementation, you'd write this directly to EFS
    new ssm.StringParameter(this, "PrometheusConfig", {
      parameterName: `/monitoring/${this.stackName}/prometheus-config`,
      stringValue: JSON.stringify(prometheusConfig, null, 2),
      description: "Prometheus configuration for monitoring stack",
      tier: ssm.ParameterTier.STANDARD,
    });
  }

  private createGrafanaConfig() {
    const datasourceConfig = {
      apiVersion: 1,
      datasources: [
        {
          name: "Prometheus",
          type: "prometheus",
          url: "http://localhost:9090/prometheus",
          access: "proxy",
          isDefault: true,
          editable: true,
        },
      ],
    };

    // Store configuration as SSM parameter
    new ssm.StringParameter(this, "GrafanaDatasourceConfig", {
      parameterName: `/monitoring/${this.stackName}/grafana-datasource-config`,
      stringValue: JSON.stringify(datasourceConfig, null, 2),
      description: "Grafana datasource configuration",
      tier: ssm.ParameterTier.STANDARD,
    });

    const dashboardConfig = {
      apiVersion: 1,
      providers: [
        {
          name: "default",
          orgId: 1,
          folder: "",
          type: "file",
          disableDeletion: false,
          updateIntervalSeconds: 10,
          allowUiUpdates: true,
          options: {
            path: "/mnt/grafana-dashboards",
          },
        },
      ],
    };

    new ssm.StringParameter(this, "GrafanaDashboardConfig", {
      parameterName: `/monitoring/${this.stackName}/grafana-dashboard-config`,
      stringValue: JSON.stringify(dashboardConfig, null, 2),
      description: "Grafana dashboard provider configuration",
      tier: ssm.ParameterTier.STANDARD,
    });
  }

  private createAlertManagerConfig() {
    const alertManagerConfig = {
      global: {
        smtp_smarthost: "localhost:587",
        smtp_from: "alertmanager@example.com",
      },
      route: {
        group_by: ["alertname"],
        group_wait: "10s",
        group_interval: "10s",
        repeat_interval: "1h",
        receiver: "web.hook",
      },
      receivers: [
        {
          name: "web.hook",
          webhook_configs: [
            {
              url: "http://127.0.0.1:5001/",
            },
          ],
        },
      ],
      inhibit_rules: [
        {
          source_match: {
            severity: "critical",
          },
          target_match: {
            severity: "warning",
          },
          equal: ["alertname", "dev", "instance"],
        },
      ],
    };

    new ssm.StringParameter(this, "AlertManagerConfig", {
      parameterName: `/monitoring/${this.stackName}/alertmanager-config`,
      stringValue: JSON.stringify(alertManagerConfig, null, 2),
      description: "AlertManager configuration",
      tier: ssm.ParameterTier.STANDARD,
    });
  }

  private createOutputs() {
    new cdk.CfnOutput(this, "FileSystemId", {
      value: this.fileSystem.fileSystemId,
      description: "EFS File System ID for monitoring",
      exportName: `${this.stackName}-efs-id`,
    });

    new cdk.CfnOutput(this, "FileSystemArn", {
      value: this.fileSystem.fileSystemArn,
      description: "EFS File System ARN for monitoring",
      exportName: `${this.stackName}-efs-arn`,
    });

    new cdk.CfnOutput(this, "AccessPointId", {
      value: this.accessPoint.accessPointId,
      description: "EFS Access Point ID for monitoring",
      exportName: `${this.stackName}-access-point-id`,
    });

    new cdk.CfnOutput(this, "AccessPointArn", {
      value: this.accessPoint.accessPointArn,
      description: "EFS Access Point ARN for monitoring",
      exportName: `${this.stackName}-access-point-arn`,
    });

    new cdk.CfnOutput(this, "MountTargetSecurityGroupId", {
      value: this.mountTargetSecurityGroup.securityGroupId,
      description: "Security Group ID for EFS mount targets",
      exportName: `${this.stackName}-mount-sg-id`,
    });

    new cdk.CfnOutput(this, "EfsAvailabilityZone", {
      value: this.efsAvailabilityZone,
      description: "Availability Zone for EFS One Zone storage",
      exportName: `${this.stackName}-efs-az`,
    });
  }

  private createDirectoryStructure() {
    // Create a Lambda function to initialize EFS directory structure
    // This ensures the directories exist when the infrastructure stack mounts EFS

    // For now, we'll document the expected structure
    // In a future enhancement, this could use a CDK custom resource
    // to create the directories via Lambda

    new ssm.StringParameter(this, "EfsDirectoryStructure", {
      parameterName: `/monitoring/${this.stackName}/efs-directory-structure`,
      stringValue: JSON.stringify(
        {
          directories: [
            "/monitoring/prometheus-data",
            "/monitoring/grafana-data",
            "/monitoring/config/prometheus",
            "/monitoring/config/grafana/provisioning/datasources",
            "/monitoring/config/grafana/provisioning/dashboards",
            "/monitoring/config/grafana/dashboards",
            "/monitoring/config/alertmanager",
          ],
          permissions: {
            "prometheus-data": { owner: "65534:65534", mode: "777" },
            "grafana-data": { owner: "472:0", mode: "777" },
            "config/prometheus": { owner: "65534:65534", mode: "755" },
            "config/grafana": { owner: "472:0", mode: "755" },
          },
        },
        null,
        2
      ),
      description: "EFS directory structure and permissions for monitoring",
      tier: ssm.ParameterTier.STANDARD,
    });
  }

  private applyCdkNagSuppressions() {
    // Apply centralized CDK Nag suppressions
    SuppressionManager.applyToStack(this, "MonitoringEfsStack", this.stackName);
  }
}
