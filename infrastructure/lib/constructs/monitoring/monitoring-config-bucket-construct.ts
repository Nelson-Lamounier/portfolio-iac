/** @format */

import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface MonitoringConfigBucketProps {
  envName: string;
  /**
   * Enable versioning for config rollback
   * @default true
   */
  enableVersioning?: boolean;
}

/**
 * S3 Bucket for storing monitoring configuration files
 *
 * Features:
 * - Versioning enabled for rollback capability
 * - Lifecycle rules to clean up old versions
 * - Encryption at rest
 * - Access logging
 *
 * Structure:
 * - prometheus/prometheus.yml
 * - prometheus/alerts.yml
 * - grafana/provisioning/datasources/*.yml
 * - grafana/provisioning/dashboards/*.yml
 * - grafana/dashboards/*.json
 */
export class MonitoringConfigBucketConstruct extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(
    scope: Construct,
    id: string,
    props: MonitoringConfigBucketProps
  ) {
    super(scope, id);

    const { envName, enableVersioning = true } = props;

    // Create S3 bucket for monitoring configs
    this.bucket = new s3.Bucket(this, "ConfigBucket", {
      bucketName: `${envName}-monitoring-config-${cdk.Stack.of(this).account}`,
      versioned: enableVersioning,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: "DeleteOldVersions",
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
          noncurrentVersionsToRetain: 10,
        },
      ],
    });

    // Add bucket policy to enforce SSL/TLS
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "EnforceSSLOnly",
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:*"],
        resources: [this.bucket.bucketArn, this.bucket.arnForObjects("*")],
        conditions: {
          Bool: {
            "aws:SecureTransport": "false",
          },
        },
      })
    );

    // Output bucket name
    new cdk.CfnOutput(this, "BucketName", {
      value: this.bucket.bucketName,
      description: "Monitoring configuration S3 bucket",
      exportName: `${envName}-monitoring-config-bucket`,
    });

    new cdk.CfnOutput(this, "BucketArn", {
      value: this.bucket.bucketArn,
      description: "Monitoring configuration S3 bucket ARN",
    });

    // Tags
    cdk.Tags.of(this).add("Component", "Monitoring");
    cdk.Tags.of(this).add("Purpose", "ConfigStorage");
  }

  /**
   * Grant read access to the bucket
   */
  grantRead(grantee: iam.IGrantable): iam.Grant {
    return this.bucket.grantRead(grantee);
  }

  /**
   * Grant write access to the bucket
   */
  grantWrite(grantee: iam.IGrantable): iam.Grant {
    return this.bucket.grantWrite(grantee);
  }

  /**
   * Grant read/write access to the bucket
   */
  grantReadWrite(grantee: iam.IGrantable): iam.Grant {
    return this.bucket.grantReadWrite(grantee);
  }
}
