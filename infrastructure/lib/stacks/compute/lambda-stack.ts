/** @format */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { LambdaFunctionConstruct } from "../../constructs/compute/lambda";

export interface LambdaStackProps extends cdk.StackProps {
  /**
   * Environment name
   */
  envName: string;

  /**
   * S3 bucket name for resume storage (optional)
   */
  resumeBucketName?: string;

  /**
   * SNS topic ARN for contact form notifications (optional)
   */
  contactFormTopicArn?: string;
}

/**
 * Lambda Stack
 *
 * Manages Lambda functions for the application:
 * - Resume download function
 * - Contact form submission function
 *
 * Usage:
 * ```typescript
 * new LambdaStack(app, 'LambdaStack-dev', {
 *   envName: 'development',
 *   resumeBucketName: 'my-resume-bucket',
 *   contactFormTopicArn: 'arn:aws:sns:...',
 * });
 * ```
 */
export class LambdaStack extends cdk.Stack {
  public readonly resumeDownloadFunction?: LambdaFunctionConstruct;
  public readonly contactFormFunction?: LambdaFunctionConstruct;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // ========================================================================
    // RESUME DOWNLOAD FUNCTION
    // ========================================================================
    if (props.resumeBucketName) {
      this.resumeDownloadFunction = new LambdaFunctionConstruct(
        this,
        "ResumeDownload",
        {
          envName: props.envName,
          functionName: "resume-download",
          entry: "lambda/handlers/resume-download.ts",
          environment: {
            BUCKET_NAME: props.resumeBucketName,
          },
          timeout: cdk.Duration.seconds(30),
          memorySize: 256,
          initialPolicy: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["s3:GetObject"],
              resources: [`arn:aws:s3:::${props.resumeBucketName}/resumes/*`],
            }),
          ],
        }
      );

      // Output function URL (if using Lambda Function URLs)
      new cdk.CfnOutput(this, "ResumeDownloadFunctionArn", {
        value: this.resumeDownloadFunction.function.functionArn,
        description: "Resume download Lambda function ARN",
        exportName: `${props.envName}-resume-download-function-arn`,
      });
    }

    // ========================================================================
    // CONTACT FORM FUNCTION
    // ========================================================================
    if (props.contactFormTopicArn) {
      this.contactFormFunction = new LambdaFunctionConstruct(
        this,
        "ContactForm",
        {
          envName: props.envName,
          functionName: "contact-form",
          entry: "lambda/handlers/contact-form.ts",
          environment: {
            SNS_TOPIC_ARN: props.contactFormTopicArn,
          },
          timeout: cdk.Duration.seconds(30),
          memorySize: 256,
          initialPolicy: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["sns:Publish"],
              resources: [props.contactFormTopicArn],
            }),
          ],
        }
      );

      // Output function URL
      new cdk.CfnOutput(this, "ContactFormFunctionArn", {
        value: this.contactFormFunction.function.functionArn,
        description: "Contact form Lambda function ARN",
        exportName: `${props.envName}-contact-form-function-arn`,
      });
    }

    // ========================================================================
    // TAGS
    // ========================================================================
    cdk.Tags.of(this).add("Stack", "Lambda");
    cdk.Tags.of(this).add("Environment", props.envName);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}
