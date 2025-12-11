/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as cr from "aws-cdk-lib/custom-resources";
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
    // EFS INITIALIZATION CUSTOM RESOURCE
    // ========================================================================
    this.createEfsInitializationCustomResource(
      vpc,
      envName,
      crossAccountTargets
    );

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

    // Store configuration as SSM parameter for Custom Resource to use
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

  private createEfsInitializationCustomResource(
    vpc: ec2.IVpc,
    envName: string,
    crossAccountTargets?: CrossAccountTarget[]
  ) {
    // Create Lambda execution role
    const lambdaRole = new iam.Role(this, "EfsInitLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole"
        ),
      ],
      inlinePolicies: {
        EfsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "elasticfilesystem:ClientMount",
                "elasticfilesystem:ClientWrite",
                "elasticfilesystem:ClientRootAccess",
              ],
              resources: [this.fileSystem.fileSystemArn],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["ssm:GetParameter", "ssm:GetParameters"],
              resources: [
                `arn:aws:ssm:${this.region}:${this.account}:parameter/monitoring/${this.stackName}/*`,
              ],
            }),
          ],
        }),
      },
    });

    // Create security group for Lambda
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, "EfsInitLambdaSg", {
      vpc,
      description: "Security group for EFS initialization Lambda",
      allowAllOutbound: true,
    });

    // Allow Lambda to access EFS
    this.mountTargetSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(2049),
      "Allow Lambda to access EFS"
    );

    // Create Lambda function
    const initFunction = new lambda.Function(this, "EfsInitFunction", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.handler",
      role: lambdaRole,
      vpc,
      vpcSubnets: {
        availabilityZones: [this.efsAvailabilityZone],
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroups: [lambdaSecurityGroup],
      allowPublicSubnet: true, // Required since we don't have NAT Gateway
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        EFS_ID: this.fileSystem.fileSystemId,
        EFS_ACCESS_POINT_ID: this.accessPoint.accessPointId,
        REGION: this.region,
        STACK_NAME: this.stackName,
      },
      code: lambda.Code.fromInline(`
import json
import os
import subprocess
import boto3
import logging
from typing import Dict, Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Custom Resource handler for EFS initialization
    """
    try:
        request_type = event['RequestType']
        logger.info(f"Request type: {request_type}")
        
        if request_type in ['Create', 'Update']:
            return initialize_efs(event, context)
        elif request_type == 'Delete':
            return cleanup_efs(event, context)
        else:
            raise ValueError(f"Unknown request type: {request_type}")
            
    except Exception as e:
        logger.error(f"Error in handler: {str(e)}")
        return {
            'Status': 'FAILED',
            'Reason': str(e),
            'PhysicalResourceId': event.get('PhysicalResourceId', 'efs-init-failed'),
            'Data': {}
        }

def initialize_efs(event: Dict[str, Any], context) -> Dict[str, Any]:
    """Initialize EFS with directory structure and configuration files"""
    
    efs_id = os.environ['EFS_ID']
    access_point_id = os.environ['EFS_ACCESS_POINT_ID']
    region = os.environ['REGION']
    stack_name = os.environ['STACK_NAME']
    
    logger.info(f"Initializing EFS {efs_id} with access point {access_point_id}")
    
    # Mount EFS
    mount_point = "/mnt/efs"
    mount_efs(efs_id, access_point_id, mount_point, region)
    
    # Create directory structure
    create_directory_structure(mount_point)
    
    # Create configuration files
    create_configuration_files(mount_point, stack_name, region)
    
    # Set permissions
    set_permissions(mount_point)
    
    logger.info("EFS initialization completed successfully")
    
    return {
        'Status': 'SUCCESS',
        'PhysicalResourceId': f"efs-init-{efs_id}",
        'Data': {
            'EfsId': efs_id,
            'AccessPointId': access_point_id,
            'InitializationStatus': 'Complete'
        }
    }

def cleanup_efs(event: Dict[str, Any], context) -> Dict[str, Any]:
    """Cleanup handler for delete operations"""
    logger.info("EFS cleanup - no action needed (data preserved)")
    
    return {
        'Status': 'SUCCESS',
        'PhysicalResourceId': event.get('PhysicalResourceId', 'efs-init-cleanup'),
        'Data': {}
    }

def mount_efs(efs_id: str, access_point_id: str, mount_point: str, region: str):
    """Mount EFS using access point"""
    try:
        # Create mount point
        subprocess.run(['mkdir', '-p', mount_point], check=True)
        
        # Mount EFS with access point
        mount_cmd = [
            'mount', '-t', 'efs', '-o', f'tls,iam,accesspoint={access_point_id}',
            f'{efs_id}.efs.{region}.amazonaws.com:/', mount_point
        ]
        
        result = subprocess.run(mount_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"Failed to mount EFS: {result.stderr}")
            
        logger.info(f"EFS mounted successfully at {mount_point}")
        
    except Exception as e:
        logger.error(f"Error mounting EFS: {str(e)}")
        raise

def create_directory_structure(mount_point: str):
    """Create the required directory structure"""
    directories = [
        # Data directories
        f"{mount_point}/prometheus-data",
        f"{mount_point}/grafana-data",
        f"{mount_point}/grafana-data/plugins",
        f"{mount_point}/grafana-data/logs",
        f"{mount_point}/grafana-data/csv",
        f"{mount_point}/grafana-data/png",
        
        # Config directories
        f"{mount_point}/config/prometheus",
        f"{mount_point}/config/grafana/provisioning/datasources",
        f"{mount_point}/config/grafana/provisioning/dashboards",
        f"{mount_point}/config/grafana/dashboards",
        f"{mount_point}/config/alertmanager",
    ]
    
    for directory in directories:
        try:
            subprocess.run(['mkdir', '-p', directory], check=True)
            logger.info(f"Created directory: {directory}")
        except Exception as e:
            logger.error(f"Failed to create directory {directory}: {str(e)}")
            raise

def create_configuration_files(mount_point: str, stack_name: str, region: str):
    """Create configuration files from SSM parameters"""
    
    ssm = boto3.client('ssm', region_name=region)
    
    try:
        # Get Prometheus config from SSM
        prometheus_param = ssm.get_parameter(
            Name=f'/monitoring/{stack_name}/prometheus-config'
        )
        prometheus_config = json.loads(prometheus_param['Parameter']['Value'])
        
        # Write prometheus.yml
        prometheus_yml_path = f"{mount_point}/config/prometheus/prometheus.yml"
        write_yaml_file(prometheus_yml_path, prometheus_config)
        logger.info(f"Created Prometheus config: {prometheus_yml_path}")
        
        # Get Grafana datasource config from SSM
        grafana_ds_param = ssm.get_parameter(
            Name=f'/monitoring/{stack_name}/grafana-datasource-config'
        )
        grafana_ds_config = json.loads(grafana_ds_param['Parameter']['Value'])
        
        # Write Grafana datasource config
        grafana_ds_path = f"{mount_point}/config/grafana/provisioning/datasources/prometheus.yml"
        write_yaml_file(grafana_ds_path, grafana_ds_config)
        logger.info(f"Created Grafana datasource config: {grafana_ds_path}")
        
        # Get Grafana dashboard config from SSM
        grafana_db_param = ssm.get_parameter(
            Name=f'/monitoring/{stack_name}/grafana-dashboard-config'
        )
        grafana_db_config = json.loads(grafana_db_param['Parameter']['Value'])
        
        # Write Grafana dashboard config
        grafana_db_path = f"{mount_point}/config/grafana/provisioning/dashboards/dashboards.yml"
        write_yaml_file(grafana_db_path, grafana_db_config)
        logger.info(f"Created Grafana dashboard config: {grafana_db_path}")
        
    except Exception as e:
        logger.error(f"Error creating configuration files: {str(e)}")
        raise

def write_yaml_file(file_path: str, config_data: dict):
    """Write configuration data as YAML file"""
    import yaml
    
    try:
        with open(file_path, 'w') as f:
            yaml.dump(config_data, f, default_flow_style=False)
    except Exception as e:
        logger.error(f"Failed to write YAML file {file_path}: {str(e)}")
        raise

def set_permissions(mount_point: str):
    """Set correct permissions and ownership"""
    
    permission_commands = [
        # Prometheus permissions (UID 65534)
        ['chown', '-R', '65534:65534', f'{mount_point}/prometheus-data'],
        ['chown', '-R', '65534:65534', f'{mount_point}/config/prometheus'],
        ['chmod', '-R', '777', f'{mount_point}/prometheus-data'],
        ['chmod', '-R', '755', f'{mount_point}/config/prometheus'],
        
        # Grafana permissions (UID 472)
        ['chown', '-R', '472:0', f'{mount_point}/grafana-data'],
        ['chown', '-R', '472:0', f'{mount_point}/config/grafana'],
        ['chmod', '-R', '777', f'{mount_point}/grafana-data'],
        ['chmod', '-R', '755', f'{mount_point}/config/grafana'],
    ]
    
    for cmd in permission_commands:
        try:
            subprocess.run(cmd, check=True)
            logger.info(f"Executed: {' '.join(cmd)}")
        except Exception as e:
            logger.error(f"Failed to execute {' '.join(cmd)}: {str(e)}")
            raise
    
    logger.info("Permissions set successfully")
`),
    });

    // Create log group for Lambda
    new logs.LogGroup(this, "EfsInitFunctionLogGroup", {
      logGroupName: `/aws/lambda/${initFunction.functionName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Custom Resource Provider
    const provider = new cr.Provider(this, "EfsInitProvider", {
      onEventHandler: initFunction,
      logRetention: logs.RetentionDays.ONE_DAY,
    });

    // Create Custom Resource
    const customResource = new cdk.CustomResource(
      this,
      "EfsInitCustomResource",
      {
        serviceToken: provider.serviceToken,
        properties: {
          EfsId: this.fileSystem.fileSystemId,
          AccessPointId: this.accessPoint.accessPointId,
          StackName: this.stackName,
          // Force update when configuration changes
          ConfigVersion: this.node.tryGetContext("configVersion") || "1.0.0",
        },
      }
    );

    // Ensure Custom Resource runs after EFS is ready
    customResource.node.addDependency(this.fileSystem);
    customResource.node.addDependency(this.accessPoint);
  }

  private applyCdkNagSuppressions() {
    // Apply centralized CDK Nag suppressions
    SuppressionManager.applyToStack(this, "MonitoringEfsStack", this.stackName);
  }
}
