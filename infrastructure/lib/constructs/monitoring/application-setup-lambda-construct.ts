/** @format */

import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { NagSuppressions } from "cdk-nag";
import * as path from "path";
import { Construct } from "constructs";

export interface ApplicationSetupLambdaConstructProps {
  clusterName: string;
  fileSystemId: string;
  efsStackName: string;
  region: string;
  envName: string;
}

/**
 * Application Setup Lambda Construct
 *
 * Creates a Lambda function that handles application setup (EFS, Prometheus, Grafana)
 * after an EC2 instance has been registered with the ECS cluster.
 *
 * Triggered by:
 * - ECS Container Instance State Change Event (when instance registers)
 * - Manual invocation for existing instances
 */
export class ApplicationSetupLambdaConstruct extends Construct {
  public readonly function: nodejs.NodejsFunction;
  public readonly rule: events.Rule;

  constructor(
    scope: Construct,
    id: string,
    props: ApplicationSetupLambdaConstructProps
  ) {
    super(scope, id);

    // Create log group (replacing deprecated logRetention)
    const logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/aws/lambda/${props.envName}-application-setup`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Lambda function
    // Path resolution: __dirname in compiled code is dist/lib/constructs/monitoring/
    // From there: ../../ goes to dist/lib/, then lambda/monitoring/application-setup/
    // But our Lambda is at infrastructure/lambda/..., so we need to go up 4 levels
    // Alternative: Use path relative to infrastructure root
    const infrastructureRoot = path.resolve(__dirname, "../../../../");
    const lambdaEntryPath = path.join(
      infrastructureRoot,
      "lambda/monitoring/application-setup/index.ts"
    );

    this.function = new nodejs.NodejsFunction(this, "Function", {
      entry: lambdaEntryPath,
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      environment: {
        // Note: AWS_REGION is automatically provided by Lambda runtime, don't set it manually
        CLUSTER_NAME: props.clusterName,
        FILE_SYSTEM_ID: props.fileSystemId,
        EFS_STACK_NAME: props.efsStackName,
        ENV_NAME: props.envName,
        REGION: props.region, // Use REGION instead of AWS_REGION for explicit region value
      },
      logGroup: logGroup,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ["@aws-sdk/*"],
      },
    });

    // Grant permissions to describe ECS container instances
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ecs:ListContainerInstances",
          "ecs:DescribeContainerInstances",
        ],
        resources: [
          `arn:aws:ecs:${props.region}:${cdk.Stack.of(this).account}:cluster/${props.clusterName}`,
          `arn:aws:ecs:${props.region}:${cdk.Stack.of(this).account}:container-instance/${props.clusterName}/*`,
        ],
      })
    );

    // Grant permissions to send SSM commands
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ssm:SendCommand",
          "ssm:GetCommandInvocation",
          "ssm:ListCommandInvocations",
        ],
        resources: [
          `arn:aws:ec2:${props.region}:${cdk.Stack.of(this).account}:instance/*`,
          `arn:aws:ssm:${props.region}::document/AWS-RunShellScript`,
        ],
      })
    );

    // Grant permissions to read SSM parameters
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:${props.region}:${cdk.Stack.of(this).account}:parameter/monitoring/${props.efsStackName}/*`,
        ],
      })
    );

    // Grant permissions to describe EC2 instances
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:DescribeInstances"],
        resources: ["*"],
      })
    );

    // Create EventBridge rule to trigger on container instance registration
    this.rule = new events.Rule(this, "ContainerInstanceRegisteredRule", {
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Container Instance State Change"],
        detail: {
          clusterArn: [
            `arn:aws:ecs:${props.region}:${cdk.Stack.of(this).account}:cluster/${props.clusterName}`,
          ],
          status: ["ACTIVE"],
        },
      },
      description: "Trigger application setup when container instance registers",
    });

    // Add Lambda as target
    this.rule.addTarget(
      new eventsTargets.LambdaFunction(this.function, {
        event: events.RuleTargetInput.fromObject({
          clusterName: props.clusterName,
          fileSystemId: props.fileSystemId,
          efsStackName: props.efsStackName,
          region: props.region,
          envName: props.envName,
        }),
      })
    );

    // Grant EventBridge permission to invoke Lambda
    this.function.addPermission("AllowEventBridge", {
      principal: new iam.ServicePrincipal("events.amazonaws.com"),
      sourceArn: this.rule.ruleArn,
    });

    // ========================================================================
    // CDK NAG SUPPRESSIONS
    // ========================================================================
    // Suppress wildcard permissions required for dynamic instance discovery
    // Note: Using wildcard patterns because CDK tokens in ARNs make exact matching difficult
    NagSuppressions.addResourceSuppressions(
      this.function.role!,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "Application setup Lambda requires wildcard permissions to discover and configure EC2 instances dynamically. " +
            "Container instance ARNs are generated at runtime when instances register with ECS. " +
            "EC2 instance ARNs use wildcards because instances are launched dynamically by Auto Scaling Group. " +
            "SSM Run Command requires instance-level permissions that cannot be pre-determined. " +
            "See: https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-setting-up.html",
          appliesTo: [
            // Match container instance ARNs with CDK tokens (e.g., <EcsClusterFB9B21B5>)
            {
              regex:
                "/^Resource::arn:aws:ecs:.*:.*:container-instance\\/.*\\/\\*$/",
            },
            // Also match the literal pattern for non-tokenized ARNs
            `Resource::arn:aws:ecs:${props.region}:${cdk.Stack.of(this).account}:container-instance/${props.clusterName}/*`,
            // Match EC2 instance ARNs with specific region/account (CDK Nag checks exact ARN)
            {
              regex:
                "/^Resource::arn:aws:ec2:.*:.*:instance\\/\\*$/",
            },
            // Also include the literal pattern for the specific region/account
            `Resource::arn:aws:ec2:${props.region}:${cdk.Stack.of(this).account}:instance/*`,
            "Resource::*", // For ec2:DescribeInstances which doesn't support resource-level permissions
          ],
        },
      ],
      true // Apply to children (default policy)
    );
  }
}

