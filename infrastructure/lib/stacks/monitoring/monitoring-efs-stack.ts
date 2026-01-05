/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

import { SuppressionManager } from "../../cdk-nag";
import { CrossAccountTarget } from "../../types";
import { LambdaFunctionConstruct } from "../../constructs/compute/lambda";
import {
  EfsFileSystemConstruct,
  EfsAccessPointConstruct,
  EfsSecurityGroupConstruct,
} from "../../constructs/storage/efs";

/**
 * LAYER 0: Monitoring EFS Stack (Refactored)
 *
 * This stack manages persistent storage and configuration for monitoring using
 * standardized constructs following DevOps best practices:
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
  public efsInitializationComplete: cdk.CustomResource;

  constructor(scope: Construct, id: string, props: MonitoringEfsStackProps) {
    super(scope, id, props);

    const {
      vpc,
      envName,
      crossAccountTargets,
      enableEncryption = true,
      lifecyclePolicy = efs.LifecyclePolicy.AFTER_30_DAYS,
    } = props;

    // Select all public subnets (one per AZ) to match where EC2 instances can be placed
    // This ensures EFS mount targets are available in the same subnets as the instances
    // Using dynamic subnet selection (not hardcoded) to avoid errors on redeployment
    const publicSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
      onePerAz: true, // One subnet per availability zone
    });

    // ========================================================================
    // EFS SECURITY GROUP
    // ========================================================================
    const efsSecurityGroupConstruct = new EfsSecurityGroupConstruct(
      this,
      "EfsSecurityGroup",
      {
        vpc,
        envName,
        allowedCidrs: [vpc.vpcCidrBlock],
        allowAllOutbound: false,
      }
    );

    this.mountTargetSecurityGroup = efsSecurityGroupConstruct.securityGroup;

    // ========================================================================
    // EFS FILE SYSTEM
    // ========================================================================
    // Use all public subnets (one per AZ) for mount targets to match instance placement
    // This ensures instances in any AZ can access EFS
    const efsFileSystemConstruct = new EfsFileSystemConstruct(
      this,
      "EfsFileSystem",
      {
        vpc,
        envName,
        enableEncryption,
        lifecyclePolicy,
        securityGroup: this.mountTargetSecurityGroup,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        mountTargetSubnetSelection: { subnets: publicSubnets.subnets },
      }
    );

    this.fileSystem = efsFileSystemConstruct.fileSystem;
    this.efsAvailabilityZone = efsFileSystemConstruct.availabilityZone;

    // ========================================================================
    // EFS ACCESS POINT
    // ========================================================================
    const efsAccessPointConstruct = new EfsAccessPointConstruct(
      this,
      "EfsAccessPoint",
      {
        fileSystem: this.fileSystem,
        envName,
        path: "/monitoring",
        posixUser: { uid: "0", gid: "0" },
        creationAcl: { ownerUid: "0", ownerGid: "0", permissions: "755" },
      }
    );

    this.accessPoint = efsAccessPointConstruct.accessPoint;

    // ========================================================================
    // EFS INITIALIZATION LAMBDA
    // ========================================================================
    const efsInitLambda = new LambdaFunctionConstruct(this, "EfsInitLambda", {
      envName,
      functionName: `${envName}-efs-initialization`,
      entry: "lambda/handlers/efs-initialization.ts",
      handler: "handler",
      timeout: cdk.Duration.minutes(5),
      environment: {
        EFS_FILE_SYSTEM_ID: this.fileSystem.fileSystemId,
        EFS_ACCESS_POINT_ID: this.accessPoint.accessPointId,
        ENVIRONMENT: envName,
      },
    });

    // Grant EFS permissions to Lambda
    this.fileSystem.grant(
      efsInitLambda.function,
      "elasticfilesystem:ClientWrite"
    );
    efsInitLambda.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:AccessedViaMountTarget",
          "ssm:GetParameter",
          "ssm:PutParameter",
        ],
        resources: [
          this.fileSystem.fileSystemArn,
          this.accessPoint.accessPointArn,
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/monitoring/${envName}/*`,
        ],
      })
    );

    // Create custom resource for EFS initialization
    this.efsInitializationComplete = new cdk.CustomResource(
      this,
      "EfsInitialization",
      {
        serviceToken: efsInitLambda.function.functionArn,
        properties: {
          FileSystemId: this.fileSystem.fileSystemId,
          AccessPointId: this.accessPoint.accessPointId,
          Environment: envName,
          // Force update when stack is updated
          Timestamp: Date.now().toString(),
        },
      }
    );

    // ========================================================================
    // SSM PARAMETERS FOR CONFIGURATION
    // ========================================================================
    this.createConfigurationParameters(envName, crossAccountTargets);

    // ========================================================================
    // CDK NAG SUPPRESSIONS & TAGS
    // ========================================================================
    SuppressionManager.applyToStack(this, "MonitoringEfsStack", envName);
    cdk.Tags.of(this).add("Stack", "MonitoringEfs");
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("Layer", "Storage");
    cdk.Tags.of(this).add("ManagedBy", "CDK");

    // ========================================================================
    // STACK OUTPUTS
    // ========================================================================
    // Stack outputs - only export for non-pipeline environments to avoid conflicts
    const shouldExport = !envName.includes("pipeline");

    new cdk.CfnOutput(this, "FileSystemId", {
      value: this.fileSystem.fileSystemId,
      description: "EFS File System ID for monitoring storage",
      ...(shouldExport && { exportName: `${this.stackName}-efs-id` }),
    });

    new cdk.CfnOutput(this, "AccessPointId", {
      value: this.accessPoint.accessPointId,
      description: "EFS Access Point ID for monitoring",
      ...(shouldExport && { exportName: `${this.stackName}-access-point-id` }),
    });

    new cdk.CfnOutput(this, "MountTargetSecurityGroupId", {
      value: this.mountTargetSecurityGroup.securityGroupId,
      description: "EFS Security Group ID",
      ...(shouldExport && { exportName: `${this.stackName}-efs-sg-id` }),
    });

    new cdk.CfnOutput(this, "EfsAvailabilityZone", {
      value: this.efsAvailabilityZone,
      description: "EFS Availability Zone",
      ...(shouldExport && { exportName: `${this.stackName}-efs-az` }),
    });
  }

  private createConfigurationParameters(
    envName: string,
    crossAccountTargets?: CrossAccountTarget[]
  ): void {
    const region = cdk.Stack.of(this).region;

    // Prometheus scrape configuration type
    type ScrapeConfig = {
      job_name: string;
      static_configs?: Array<{
        targets: string[];
        labels?: Record<string, string>;
      }>;
      ec2_sd_configs?: Array<{
        region: string;
        role_arn?: string;
        port: number;
        filters: Array<{ name: string; values: string[] }>;
      }>;
      relabel_configs?: Array<{
        source_labels: string[];
        target_label: string;
        replacement?: string;
      }>;
      metrics_path?: string;
    };

    // Prometheus configuration
    const scrapeConfigs: ScrapeConfig[] = [
      {
        job_name: "prometheus",
        static_configs: [{ targets: ["localhost:9090"] }],
        // Use /prometheus/metrics because Prometheus is started with --web.route-prefix=/prometheus
        // This prefix applies to ALL endpoints, including when scraping from localhost
        metrics_path: "/prometheus/metrics",
      },
      {
        job_name: "node-exporter",
        static_configs: [{ targets: ["localhost:9100"] }],
      },
    ];

    // Add pipeline account EC2 service discovery (same account - no role_arn needed)
    scrapeConfigs.push({
      job_name: "node-exporter-pipeline",
      ec2_sd_configs: [
        {
          region: region,
          port: 9100,
          filters: [
            {
              name: "tag:Environment",
              values: [envName],
            },
            {
              name: "tag:Service",
              values: ["NodeExporter", "monitoring"],
            },
            {
              name: "instance-state-name",
              values: ["running"],
            },
          ],
        },
      ],
      relabel_configs: [
        {
          source_labels: ["__meta_ec2_private_ip"],
          target_label: "__address__",
          replacement: "${1}:9100",
        },
        {
          source_labels: ["__meta_ec2_tag_Environment"],
          target_label: "environment",
        },
        {
          source_labels: ["__meta_ec2_tag_Service"],
          target_label: "service",
        },
        {
          source_labels: ["__meta_ec2_instance_id"],
          target_label: "instance_id",
        },
        {
          source_labels: ["__meta_ec2_tag_Name"],
          target_label: "instance_name",
        },
      ],
    });

    // Add cross-account targets using EC2 service discovery or static configs
    if (crossAccountTargets && crossAccountTargets.length > 0) {
      // Group targets by environment and type
      const targetsByEnv = crossAccountTargets.reduce(
        (acc, target) => {
          const key = `${target.envName}-${target.targetType}`;
          if (!acc[key]) {
            acc[key] = [];
          }
          acc[key].push(target);
          return acc;
        },
        {} as Record<string, CrossAccountTarget[]>
      );

      // Generate scrape configs for each environment/type combination
      for (const targets of Object.values(targetsByEnv)) {
        const firstTarget = targets[0];
        const useEc2Sd =
          firstTarget.useEc2ServiceDiscovery !== false &&
          firstTarget.accountId &&
          firstTarget.roleArn;

        if (useEc2Sd) {
          // Use EC2 service discovery for cross-account scraping
          scrapeConfigs.push({
            job_name: `${firstTarget.targetType}-${firstTarget.envName}`,
            ec2_sd_configs: [
              {
                region: region,
                role_arn: firstTarget.roleArn,
                port: firstTarget.port,
                filters: [
                  {
                    name: "tag:Environment",
                    values: [firstTarget.envName],
                  },
                  {
                    name: "instance-state-name",
                    values: ["running"],
                  },
                  ...(firstTarget.targetType === "node-exporter"
                    ? [
                        {
                          name: "tag:Service",
                          values: ["NodeExporter", "monitoring"],
                        },
                      ]
                    : []),
                ],
              },
            ],
            relabel_configs: [
              {
                source_labels: ["__meta_ec2_private_ip"],
                target_label: "__address__",
                replacement: `\${1}:${firstTarget.port}`,
              },
              {
                source_labels: ["__meta_ec2_tag_Environment"],
                target_label: "environment",
              },
              {
                source_labels: ["__meta_ec2_instance_id"],
                target_label: "instance_id",
              },
              {
                source_labels: ["__meta_ec2_tag_Name"],
                target_label: "instance_name",
              },
              {
                source_labels: ["__meta_ec2_tag_Service"],
                target_label: "service",
              },
            ],
            metrics_path: firstTarget.metricsPath || "/metrics",
          });
        } else if (firstTarget.privateIp) {
          // Fallback to static configs if EC2 SD not available
          scrapeConfigs.push({
            job_name: `${firstTarget.targetType}-${firstTarget.envName}`,
            static_configs: [
              {
                targets: targets.map((t) => `${t.privateIp}:${t.port}`),
                labels: {
                  environment: firstTarget.envName,
                  service: firstTarget.targetType,
                  account: firstTarget.accountId || firstTarget.envName,
                },
              },
            ],
            metrics_path: firstTarget.metricsPath || "/metrics",
          });
        }
      }
    }

    const prometheusConfig = {
      global: {
        scrape_interval: "15s",
        evaluation_interval: "15s",
        external_labels: {
          environment: envName,
          cluster: `${envName}-monitoring`,
        },
      },
      rule_files: ["/etc/prometheus/alerts.yml"],
      scrape_configs: scrapeConfigs,
    };

    new ssm.StringParameter(this, "PrometheusConfig", {
      parameterName: `/monitoring/${envName}/prometheus-config`,
      stringValue: JSON.stringify(prometheusConfig, null, 2),
      description: "Prometheus configuration for monitoring stack",
      tier: ssm.ParameterTier.STANDARD,
    });

    // Grafana datasource configuration
    const grafanaDatasourceConfig = {
      apiVersion: 1,
      datasources: [
        {
          name: "Prometheus",
          type: "prometheus",
          access: "proxy",
          url: "http://localhost:9090/prometheus",
          isDefault: true,
        },
      ],
    };

    new ssm.StringParameter(this, "GrafanaDatasourceConfig", {
      parameterName: `/monitoring/${envName}/grafana-datasource-config`,
      stringValue: JSON.stringify(grafanaDatasourceConfig, null, 2),
      description: "Grafana datasource configuration",
      tier: ssm.ParameterTier.STANDARD,
    });

    // Grafana dashboard configuration
    const grafanaDashboardConfig = {
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
            path: "/var/lib/grafana/dashboards",
          },
        },
      ],
    };

    new ssm.StringParameter(this, "GrafanaDashboardConfig", {
      parameterName: `/monitoring/${envName}/grafana-dashboard-config`,
      stringValue: JSON.stringify(grafanaDashboardConfig, null, 2),
      description: "Grafana dashboard provider configuration",
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
