/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import { Construct } from "constructs";

export interface EfsFileSystemConstructProps {
  /**
   * VPC where the EFS file system will be created
   */
  vpc: ec2.IVpc;

  /**
   * Environment name for resource naming and tagging
   */
  envName: string;

  /**
   * Whether to enable encryption at rest
   * @default true
   */
  enableEncryption?: boolean;

  /**
   * Lifecycle policy for transitioning files to IA storage
   * @default AFTER_30_DAYS
   */
  lifecyclePolicy?: efs.LifecyclePolicy;

  /**
   * Performance mode for the file system
   * @default GENERAL_PURPOSE
   */
  performanceMode?: efs.PerformanceMode;

  /**
   * Throughput mode for the file system
   * @default ELASTIC (cheapest for spiky/low-average workloads)
   */
  throughputMode?: efs.ThroughputMode;

  /**
   * Provisioned throughput in MiB/s (only used with PROVISIONED mode)
   * @default 10
   */
  provisionedThroughputPerSecond?: cdk.Size;

  /**
   * Removal policy for the file system
   * @default RETAIN
   */
  removalPolicy?: cdk.RemovalPolicy;

  /**
   * Security group for the file system
   */
  securityGroup?: ec2.ISecurityGroup;

  /**
   * Optional subnet selection to control where mount targets are placed
   * (e.g., single public subnet/AZ to align with ECS EC2 instances).
   */
  mountTargetSubnetSelection?: ec2.SubnetSelection;
}

/**
 * Construct for creating an EFS file system with monitoring-specific configuration
 */
export class EfsFileSystemConstruct extends Construct {
  public readonly fileSystem: efs.FileSystem;
  public readonly availabilityZone: string;

  constructor(
    scope: Construct,
    id: string,
    props: EfsFileSystemConstructProps
  ) {
    super(scope, id);

    const {
      vpc,
      envName,
      enableEncryption = true,
      lifecyclePolicy = efs.LifecyclePolicy.AFTER_30_DAYS,
      performanceMode = efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode = efs.ThroughputMode.ELASTIC,
      provisionedThroughputPerSecond = cdk.Size.mebibytes(10),
      removalPolicy = cdk.RemovalPolicy.RETAIN,
      securityGroup,
      mountTargetSubnetSelection,
    } = props;

    const selectedSubnets = mountTargetSubnetSelection
      ? vpc.selectSubnets(mountTargetSubnetSelection)
      : undefined;

    // Create EFS file system
    this.fileSystem = new efs.FileSystem(this, `MonitoringEfs-${envName}`, {
      vpc,
      lifecyclePolicy,
      performanceMode,
      throughputMode,
      provisionedThroughputPerSecond:
        throughputMode === efs.ThroughputMode.PROVISIONED
          ? provisionedThroughputPerSecond
          : undefined,
      encrypted: enableEncryption,
      removalPolicy,
      securityGroup,
      vpcSubnets: selectedSubnets,
      fileSystemName: `${envName}-monitoring-efs`,
    });

    // Get the selected availability zone (or fallback to first VPC AZ)
    this.availabilityZone =
      selectedSubnets?.availabilityZones?.[0] ?? vpc.availabilityZones[0];

    // Configure backup policy and pin to a single AZ (One Zone EFS)
    const cfnFileSystem = this.fileSystem.node
      .defaultChild as efs.CfnFileSystem;
    cfnFileSystem.backupPolicy = {
      status: "ENABLED",
    };
    // Setting availabilityZoneName makes this a One Zone file system
    cfnFileSystem.availabilityZoneName = this.availabilityZone;

    // Add tags
    cdk.Tags.of(this.fileSystem).add("Name", `${envName}-monitoring-efs`);
    cdk.Tags.of(this.fileSystem).add("Environment", envName);
    cdk.Tags.of(this.fileSystem).add("Purpose", "MonitoringStorage");
    cdk.Tags.of(this.fileSystem).add("ManagedBy", "CDK");

    // Output file system ID
    new cdk.CfnOutput(this, "FileSystemId", {
      value: this.fileSystem.fileSystemId,
      description: `EFS File System ID for ${envName} monitoring`,
      exportName: `${cdk.Stack.of(this).stackName}-efs-id`,
    });

    new cdk.CfnOutput(this, "FileSystemArn", {
      value: this.fileSystem.fileSystemArn,
      description: `EFS File System ARN for ${envName} monitoring`,
      exportName: `${cdk.Stack.of(this).stackName}-efs-arn`,
    });
  }
}
