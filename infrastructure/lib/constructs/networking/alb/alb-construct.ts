/** @format */

import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cdk from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";
import { SuppressionManager } from "../../../cdk-nag";

export interface AlbConstructProps {
  vpc: ec2.IVpc;
  envName: string;
  loadBalancerName: string;
  internetFacing?: boolean;
  securityGroup?: ec2.ISecurityGroup;
  deletionProtection?: boolean;
  accessLogEnabled?: boolean;
  accessLogBucket?: s3.IBucket;
  accessLogPrefix?: string;
}

/**
 * Reusable construct for creating an Application Load Balancer
 *
 * This construct focuses solely on creating the ALB resource itself.
 * Listeners, target groups, and security groups are managed separately.
 *
 * Features:
 * - Creates ALB in specified VPC
 * - Configurable internet-facing or internal
 * - Optional deletion protection
 * - Automatic tagging
 */
export class AlbConstruct extends Construct {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly securityGroup: ec2.ISecurityGroup;
  public readonly accessLogBucket?: s3.IBucket;

  constructor(scope: Construct, id: string, props: AlbConstructProps) {
    super(scope, id);

    // Create security group if not provided
    this.securityGroup =
      props.securityGroup ||
      new ec2.SecurityGroup(this, "SecurityGroup", {
        vpc: props.vpc,
        description: `Security group for ${props.loadBalancerName}`,
        allowAllOutbound: true,
      });

    // Create S3 bucket for access logs if enabled and not provided
    if (props.accessLogEnabled) {
      this.accessLogBucket =
        props.accessLogBucket ||
        new s3.Bucket(this, "AccessLogBucket", {
          bucketName: `${props.loadBalancerName}-access-logs-${cdk.Stack.of(this).account}`,
          encryption: s3.BucketEncryption.S3_MANAGED,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          enforceSSL: true, // Require SSL/TLS for all requests
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          autoDeleteObjects: false,
          lifecycleRules: [
            {
              id: "DeleteOldLogs",
              enabled: true,
              expiration: cdk.Duration.days(90),
              transitions: [
                {
                  storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                  transitionAfter: cdk.Duration.days(30),
                },
              ],
            },
          ],
          serverAccessLogsPrefix: "bucket-access-logs/",
        });

      // Add bucket policy to allow ALB to write logs
      // No need to add bucket policy explicitly as CDK handles this automatically
      // when logAccessLogs is called
    }

    // Create the Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      vpc: props.vpc,
      loadBalancerName: props.loadBalancerName,
      internetFacing: props.internetFacing ?? true,
      securityGroup: this.securityGroup,
      vpcSubnets: {
        subnetType: props.internetFacing
          ? ec2.SubnetType.PUBLIC
          : ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      deletionProtection: props.deletionProtection ?? false,
    });

    // Enable access logs if configured
    if (props.accessLogEnabled && this.accessLogBucket) {
      this.loadBalancer.logAccessLogs(
        this.accessLogBucket,
        props.accessLogPrefix || "alb-logs"
      );
    }

    // Add tags
    cdk.Tags.of(this.loadBalancer).add("Environment", props.envName);
    cdk.Tags.of(this.loadBalancer).add("ManagedBy", "CDK");
    cdk.Tags.of(this.loadBalancer).add("Name", props.loadBalancerName);

    // Apply CDK Nag suppressions for internet-facing ALB security group
    // Stack-level suppressions don't always reach construct-level resources
    if (props.internetFacing) {
      NagSuppressions.addResourceSuppressions(
        this.securityGroup,
        SuppressionManager.getPublicAccessSuppressions(),
        true
      );
    }
  }

  /**
   * Allow inbound traffic on a specific port
   */
  public allowInbound(
    peer: ec2.IPeer,
    port: ec2.Port,
    description?: string
  ): void {
    if (this.securityGroup instanceof ec2.SecurityGroup) {
      this.securityGroup.addIngressRule(peer, port, description);
    }
  }

  /**
   * Get the load balancer ARN
   */
  public get loadBalancerArn(): string {
    return this.loadBalancer.loadBalancerArn;
  }

  /**
   * Get the load balancer DNS name
   */
  public get dnsName(): string {
    return this.loadBalancer.loadBalancerDnsName;
  }

  /**
   * Get the load balancer full name
   */
  public get loadBalancerFullName(): string {
    return this.loadBalancer.loadBalancerFullName;
  }
}
