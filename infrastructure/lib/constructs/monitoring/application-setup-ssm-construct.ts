/**
 * Application Setup SSM State Manager Construct
 *
 * Replaces the Application Setup Lambda with SSM State Manager Association.
 * This provides:
 * - Automatic execution on instance launch (via tags)
 * - Self-healing (runs on schedule)
 * - No Lambda or VPC configuration needed
 * - Better observability via SSM Compliance dashboard
 *
 * @format
 */

import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { NagSuppressions } from "../../cdk-nag";
import { buildApplicationSetupScript } from "./application-setup-script";

export interface ApplicationSetupSsmAssociationProps {
  /**
   * Environment name for resource naming and instance targeting
   */
  envName: string;

  /**
   * EFS File System ID to mount
   */
  fileSystemId: string;

  /**
   * AWS Region
   */
  region: string;

  /**
   * Optional: Custom targets for the association
   * Default: All instances with Environment=${envName} and Service=monitoring tags
   */
  targets?: ssm.CfnAssociation.TargetProperty[];

  /**
   * Optional: Schedule expression for self-healing
   * Default: "rate(1 hour)" - runs every hour
   * Set to empty string to disable scheduled runs (only run on instance launch)
   */
  scheduleExpression?: string;

  /**
   * Optional: S3 bucket for command output storage
   * If not provided, output goes to CloudWatch Logs only
   */
  outputS3BucketName?: string;
}

/**
 * SSM State Manager Association for Application Setup
 *
 * This association runs the application setup script on EC2 instances:
 * - Mounts EFS
 * - Creates directory structure
 * - Sets permissions
 * - Downloads configs from SSM
 * - Creates symlinks
 * - Fixes Grafana database permissions
 * - Reloads Prometheus
 */
export class ApplicationSetupSsmAssociationConstruct extends Construct {
  public readonly association: ssm.CfnAssociation;

  constructor(
    scope: Construct,
    id: string,
    props: ApplicationSetupSsmAssociationProps
  ) {
    super(scope, id);

    const {
      envName,
      fileSystemId,
      region,
      targets,
      scheduleExpression = "rate(1 hour)",
      outputS3BucketName,
    } = props;

    // Build setup script
    const setupScript = buildApplicationSetupScript({
      fileSystemId,
      region,
      envName,
    });

    // Default targets: All instances with Environment and Service tags
    const defaultTargets: ssm.CfnAssociation.TargetProperty[] = [
      {
        key: "tag:Environment",
        values: [envName],
      },
      {
        key: "tag:Service",
        values: ["monitoring"],
      },
      {
        key: "instance-state-name",
        values: ["running"],
      },
    ];

    const associationTargets = targets || defaultTargets;

    // Build output location (optional S3 storage)
    const outputLocation = outputS3BucketName
      ? {
          s3Location: {
            outputS3Region: region,
            outputS3BucketName: outputS3BucketName,
            outputS3KeyPrefix: `application-setup/${envName}/`,
          },
        }
      : undefined;

    // Create SSM Association
    this.association = new ssm.CfnAssociation(
      this,
      "ApplicationSetupAssociation",
      {
        name: "AWS-RunShellScript", // Use AWS managed document
        associationName: `${envName}-application-setup`,
        targets: associationTargets,
        parameters: {
          commands: [setupScript],
          workingDirectory: [""],
          executionTimeout: ["3600"], // 1 hour
        },
        // Run immediately on instance launch AND on schedule (if provided)
        scheduleExpression: scheduleExpression || undefined,
        applyOnlyAtCronInterval: false, // Also run on instance launch, not just schedule
        complianceSeverity: "CRITICAL", // Mark as critical for compliance dashboard
        outputLocation: outputLocation,
        // Automatically retry on failure
        maxErrors: "5",
        maxConcurrency: "10", // Run on up to 10 instances concurrently
      }
    );

    // Add tags
    cdk.Tags.of(this.association).add("Component", "ApplicationSetup");
    cdk.Tags.of(this.association).add("Environment", envName);
    cdk.Tags.of(this.association).add("ManagedBy", "CDK");

    // CDK Nag suppressions
    NagSuppressions.addResourceSuppressions(
      this.association,
      [
        {
          id: "AwsSolutions-SSM2",
          reason:
            "Application setup script requires shell script execution. " +
            "The script is idempotent and safe to run multiple times. " +
            "SSM State Manager provides built-in retry and error handling.",
        },
      ],
      true
    );
  }
}
