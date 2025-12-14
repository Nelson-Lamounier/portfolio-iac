/** @format */

import * as path from "path";

import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export interface PrometheusAutoUpdateConstructProps {
  /** Pipeline EC2 instance ID where Prometheus runs */
  pipelineInstanceId: string;

  /** Environment name */
  envName: string;

  /** S3 bucket name for monitoring configs */
  configBucketName: string;

  /** Development account ID */
  devAccountId?: string;

  /** Staging account ID */
  stagingAccountId?: string;

  /** Production account ID */
  prodAccountId?: string;

  /** AWS region */
  region: string;
}

/**
 * Construct that automatically updates Prometheus targets when EC2 instances change state
 *
 * Features:
 * - Listens to EC2 state change events (running, stopped, terminated)
 * - Queries all environment accounts for running instances
 * - Generates updated Prometheus config with current IPs
 * - Uploads config to EFS via SSM
 * - Reloads Prometheus without restart
 *
 * Usage:
 * ```typescript
 * new PrometheusAutoUpdateConstruct(this, 'PrometheusAutoUpdate', {
 *   pipelineInstanceId: monitoringStack.instanceId,
 *   configBucketName: configBucket.bucket.bucketName,
 *   envName: 'pipeline',
 *   devAccountId: '123456789012',
 *   region: 'eu-west-1',
 * });
 * ```
 */
export class PrometheusAutoUpdateConstruct extends Construct {
  public readonly function: nodejs.NodejsFunction;
  public readonly rule: events.Rule;

  constructor(
    scope: Construct,
    id: string,
    props: PrometheusAutoUpdateConstructProps
  ) {
    super(scope, id);

    // Create Lambda function
    this.function = new nodejs.NodejsFunction(this, "Function", {
      entry: path.join(
        __dirname,
        "../../lambda/monitoring/update-prometheus-targets/index.ts"
      ),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      environment: {
        PIPELINE_INSTANCE_ID: props.pipelineInstanceId,
        CONFIG_BUCKET: props.configBucketName,
        DEV_ACCOUNT_ID: props.devAccountId || "",
        STAGING_ACCOUNT_ID: props.stagingAccountId || "",
        PROD_ACCOUNT_ID: props.prodAccountId || "",
        AWS_REGION: props.region,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ["@aws-sdk/*"],
      },
    });

    // Grant permissions to describe EC2 instances
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:DescribeInstances"],
        resources: ["*"],
      })
    );

    // Grant permissions to send SSM commands to pipeline instance
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ssm:SendCommand",
          "ssm:GetCommandInvocation",
          "ssm:ListCommandInvocations",
        ],
        resources: [
          `arn:aws:ec2:${props.region}:${cdk.Stack.of(this).account}:instance/${props.pipelineInstanceId}`,
          `arn:aws:ssm:${props.region}::document/AWS-RunShellScript`,
          `arn:aws:ssm:${props.region}:${cdk.Stack.of(this).account}:*`,
        ],
      })
    );

    // Grant permissions to read from S3 config bucket
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:ListBucket",
          "s3:ListBucketVersions",
        ],
        resources: [
          `arn:aws:s3:::${props.configBucketName}`,
          `arn:aws:s3:::${props.configBucketName}/*`,
        ],
      })
    );

    // Create EventBridge rule for EC2 state changes
    this.rule = new events.Rule(this, "EC2StateChangeRule", {
      description: "Trigger Prometheus target update on EC2 state changes",
      eventPattern: {
        source: ["aws.ec2"],
        detailType: ["EC2 Instance State-change Notification"],
        detail: {
          state: ["running", "stopped", "terminated"],
        },
      },
    });

    // Add Lambda as target
    this.rule.addTarget(
      new targets.LambdaFunction(this.function, {
        retryAttempts: 2,
      })
    );

    // Outputs
    new cdk.CfnOutput(this, "FunctionName", {
      value: this.function.functionName,
      description: "Prometheus auto-update Lambda function name",
    });

    new cdk.CfnOutput(this, "RuleName", {
      value: this.rule.ruleName,
      description: "EventBridge rule name",
    });

    // Tags
    cdk.Tags.of(this).add("Component", "Monitoring");
    cdk.Tags.of(this).add("Purpose", "PrometheusAutoUpdate");
  }

  /**
   * Manually invoke the function to update targets now
   */
  public grantInvoke(grantee: iam.IGrantable): iam.Grant {
    return this.function.grantInvoke(grantee);
  }
}
