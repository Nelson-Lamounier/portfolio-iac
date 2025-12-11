/**
 * Reusable Lambda Function Construct
 *
 * This construct provides a standardized way to create Lambda functions
 * with TypeScript support, proper bundling, and consistent configuration.
 *
 * @format
 */

import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { join } from "path";

export interface LambdaFunctionProps {
  /**
   * The name of the Lambda function handler file (without .ts extension)
   * e.g., 'efs-initialization' for efs-initialization.ts
   */
  handlerName: string;

  /**
   * The exported function name in the handler file
   * @default 'handler'
   */
  handlerFunction?: string;

  /**
   * Lambda runtime configuration
   */
  runtime?: lambda.Runtime;
  timeout?: cdk.Duration;
  memorySize?: number;

  /**
   * Environment variables
   */
  environment?: Record<string, string>;

  /**
   * VPC configuration (optional)
   */
  vpc?: ec2.IVpc;
  vpcSubnets?: ec2.SubnetSelection;
  securityGroups?: ec2.ISecurityGroup[];
  allowPublicSubnet?: boolean;

  /**
   * IAM configuration
   */
  role?: iam.IRole;
  initialPolicy?: iam.PolicyStatement[];

  /**
   * CloudWatch Logs configuration
   */
  logRetention?: logs.RetentionDays;

  /**
   * Bundling configuration
   */
  bundling?: {
    externalModules?: string[];
    nodeModules?: string[];
  };

  /**
   * Additional props to pass to the NodejsFunction
   */
  additionalProps?: Partial<nodejs.NodejsFunctionProps>;
}

export class LambdaFunctionConstruct extends Construct {
  public readonly function: nodejs.NodejsFunction;
  public readonly logGroup: logs.LogGroup;
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: LambdaFunctionProps) {
    super(scope, id);

    const {
      handlerName,
      handlerFunction = "handler",
      runtime = lambda.Runtime.NODEJS_20_X,
      timeout = cdk.Duration.minutes(5),
      memorySize = 512,
      environment = {},
      vpc,
      vpcSubnets,
      securityGroups,
      allowPublicSubnet = false,
      role,
      initialPolicy = [],
      logRetention = logs.RetentionDays.TWO_WEEKS,
      bundling,
      additionalProps = {},
    } = props;

    // Create IAM role if not provided
    this.role =
      (role as iam.Role) ||
      new iam.Role(this, "LambdaRole", {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
          ...(vpc
            ? [
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                  "service-role/AWSLambdaVPCAccessExecutionRole"
                ),
              ]
            : []),
        ],
        inlinePolicies:
          initialPolicy.length > 0
            ? {
                LambdaPolicy: new iam.PolicyDocument({
                  statements: initialPolicy,
                }),
              }
            : undefined,
      });

    // Determine the handler file path
    const handlerPath = join(
      __dirname,
      "../../../lambda/handlers",
      `${handlerName}.ts`
    );

    // Create the Lambda function
    this.function = new nodejs.NodejsFunction(this, "Function", {
      entry: handlerPath,
      handler: handlerFunction,
      runtime,
      timeout,
      memorySize,
      environment: {
        AWS_REGION: cdk.Stack.of(this).region,
        ...environment,
      },
      role: this.role,
      vpc,
      vpcSubnets,
      securityGroups,
      allowPublicSubnet,
      bundling: {
        externalModules: ["@aws-sdk/*", ...(bundling?.externalModules || [])],
        nodeModules: bundling?.nodeModules,
        format: nodejs.OutputFormat.ESM,
        target: "es2022",
        keepNames: true,
        tsconfig: join(__dirname, "../../../tsconfig.json"),
      },
      ...additionalProps,
    });

    // Create CloudWatch Log Group
    this.logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/aws/lambda/${this.function.functionName}`,
      retention: logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add tags
    cdk.Tags.of(this.function).add("ManagedBy", "CDK");
    cdk.Tags.of(this.function).add("Runtime", runtime.name);
  }

  /**
   * Add additional IAM permissions to the Lambda function
   */
  public addToRolePolicy(statement: iam.PolicyStatement): void {
    this.role.addToPrincipalPolicy(statement);
  }

  /**
   * Grant the Lambda function permissions to access a resource
   */
  public grantInvoke(grantee: iam.IGrantable): iam.Grant {
    return this.function.grantInvoke(grantee);
  }

  /**
   * Add environment variables to the Lambda function
   */
  public addEnvironment(key: string, value: string): void {
    this.function.addEnvironment(key, value);
  }
}
