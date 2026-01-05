/** @format */

import * as path from "path";

import * as cdk from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";

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
  public readonly updateTrigger: cdk.CustomResource;

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
    // Path resolution: Handle both compiled (dist/) and source (lib/) contexts
    // - From lib/constructs/monitoring/: ../../../ goes to infrastructure root, then lambda/...
    // - From dist/lib/constructs/monitoring/: ../../../../ goes to infrastructure root (when running from infrastructure/)
    //   or repo root (when running from repo root)
    const isCompiled = __dirname.includes("/dist/");
    let lambdaEntryPath: string;

    if (isCompiled) {
      // Compiled: dist/lib/constructs/monitoring/ -> ../../../../ -> infrastructure root or repo root
      const possibleRoot = path.resolve(__dirname, "../../../../");
      const fs = require("fs");

      // Try lambda/ directly first (if already in infrastructure directory)
      const pathDirect = path.join(
        possibleRoot,
        "lambda/monitoring/application-setup/index.ts"
      );
      if (fs.existsSync(pathDirect)) {
        lambdaEntryPath = pathDirect;
      } else {
        // Try infrastructure/lambda/ (if running from repo root)
        const pathWithInfra = path.join(
          possibleRoot,
          "infrastructure/lambda/monitoring/application-setup/index.ts"
        );
        lambdaEntryPath = pathWithInfra;
      }
    } else {
      // Source/test: lib/constructs/monitoring/ -> ../../../ -> infrastructure root
      lambdaEntryPath = path.join(
        path.resolve(__dirname, "../../../"),
        "lambda/monitoring/application-setup/index.ts"
      );
    }

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

    // Grant permissions to stop old tasks (critical for preventing credential exhaustion)
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ecs:ListServices",
          "ecs:ListTasks",
          "ecs:DescribeTasks",
          "ecs:StopTask",
        ],
        resources: [
          `arn:aws:ecs:${props.region}:${cdk.Stack.of(this).account}:cluster/${props.clusterName}`,
          `arn:aws:ecs:${props.region}:${cdk.Stack.of(this).account}:service/${props.clusterName}/*`,
          `arn:aws:ecs:${props.region}:${cdk.Stack.of(this).account}:task/${props.clusterName}/*`,
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
          // GetCommandInvocation requires permission on the command invocation resource
          `arn:aws:ssm:${props.region}:${cdk.Stack.of(this).account}:*`,
        ],
      })
    );

    // Grant permissions to read SSM parameters (use envName for correct path)
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          // Allow reading from both paths for backward compatibility
          // `arn:aws:ssm:${props.region}:${cdk.Stack.of(this).account}:parameter/monitoring/${props.efsStackName}/*`,
          `arn:aws:ssm:${props.region}:${cdk.Stack.of(this).account}:parameter/monitoring/${props.envName}/*`,
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
      description:
        "Trigger application setup when container instance registers",
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
    // CUSTOM RESOURCE TO TRIGGER ON STACK UPDATES
    // ========================================================================
    // This ensures the Lambda runs on stack updates, not just new instance registration
    const provider = new cr.Provider(this, "ApplicationSetupProvider", {
      onEventHandler: this.function,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Create Custom Resource that triggers on stack updates
    this.updateTrigger = new cdk.CustomResource(
      this,
      "ApplicationSetupTrigger",
      {
        serviceToken: provider.serviceToken,
        properties: {
          clusterName: props.clusterName,
          fileSystemId: props.fileSystemId,
          efsStackName: props.efsStackName,
          region: props.region,
          envName: props.envName,
          // Force update when stack is updated (timestamp changes on each deploy)
          Timestamp: Date.now().toString(),
        },
      }
    );

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
              regex: "/^Resource::arn:aws:ec2:.*:.*:instance\\/\\*$/",
            },
            // Also include the literal pattern for the specific region/account
            `Resource::arn:aws:ec2:${props.region}:${cdk.Stack.of(this).account}:instance/*`,
            // SSM GetCommandInvocation requires wildcard access to command invocation resources
            `Resource::arn:aws:ssm:${props.region}:${cdk.Stack.of(this).account}:*`,
            {
              regex: "/^Resource::arn:aws:ssm:.*:.*:\\*$/",
            },
            // ECS task management requires wildcard permissions for service and task ARNs
            // Services and tasks are created dynamically and cannot be pre-specified
            `Resource::arn:aws:ecs:${props.region}:${cdk.Stack.of(this).account}:service/${props.clusterName}/*`,
            {
              regex: "/^Resource::arn:aws:ecs:.*:.*:service\\/.*\\/\\*$/",
            },
            `Resource::arn:aws:ecs:${props.region}:${cdk.Stack.of(this).account}:task/${props.clusterName}/*`,
            {
              regex: "/^Resource::arn:aws:ecs:.*:.*:task\\/.*\\/\\*$/",
            },
            "Resource::*", // For ec2:DescribeInstances which doesn't support resource-level permissions
          ],
        },
      ],
      true // Apply to children (default policy)
    );

    // Suppress wildcard permissions for Custom Resource Provider's framework Lambda
    // The Provider creates a framework Lambda that needs to invoke the handler Lambda
    NagSuppressions.addResourceSuppressions(
      provider,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "Custom Resource Provider framework Lambda requires wildcard permissions to invoke the handler Lambda function. " +
            "The handler Lambda ARN is determined at runtime and cannot be pre-specified. " +
            "This is a standard pattern for CDK Custom Resources. " +
            "See: https://docs.aws.amazon.com/cdk/v2/guide/custom_resources.html",
        },
      ],
      true // Apply to children (default policy)
    );
  }
}
