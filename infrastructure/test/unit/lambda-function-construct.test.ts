/** @format */

import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Template, Match } from "aws-cdk-lib/assertions";

import { LambdaFunctionConstruct } from "../../lib/constructs/compute/lambda/lambda-function-construct";

describe("LambdaFunctionConstruct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  const ENTRY_PATH = "lib/lambda/monitoring/update-prometheus-targets/index.ts";

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
    });
  });

  describe("Function Creation", () => {
    test("creates Lambda function with correct name", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "dev-my-function",
      });
    });

    test("creates function with correct handler", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
        handler: "customHandler",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: Match.stringLikeRegexp("customHandler"),
      });
    });

    test("uses default handler when not specified", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: Match.stringLikeRegexp("handler"),
      });
    });

    test("creates function with correct runtime", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
        runtime: lambda.Runtime.NODEJS_18_X,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs18.x",
      });
    });

    test("uses default Node.js 20.x runtime when not specified", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs20.x",
      });
    });

    test("creates function with correct timeout", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
        timeout: cdk.Duration.minutes(10),
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Timeout: 600,
      });
    });

    test("uses default 5 minute timeout when not specified", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Timeout: 300,
      });
    });

    test("creates function with correct memory size", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
        memorySize: 512,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        MemorySize: 512,
      });
    });

    test("uses default 256 MB memory when not specified", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        MemorySize: 256,
      });
    });

    test("creates function with environment variables", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
        environment: {
          TABLE_NAME: "my-table",
          BUCKET_NAME: "my-bucket",
        },
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            TABLE_NAME: "my-table",
            BUCKET_NAME: "my-bucket",
          }),
        }),
      });
    });
  });

  describe("Log Group", () => {
    test("creates CloudWatch log group", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::Logs::LogGroup", 1);
    });

    test("log group has correct name", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/aws/lambda/dev-my-function",
      });
    });

    test("log group has correct retention", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
        logRetention: logs.RetentionDays.TWO_WEEKS,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        RetentionInDays: 14,
      });
    });

    test("uses default one week retention when not specified", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        RetentionInDays: 7,
      });
    });
  });

  describe("IAM Role", () => {
    test("creates IAM role for Lambda", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      const roles = template.findResources("AWS::IAM::Role");
      expect(Object.keys(roles).length).toBeGreaterThanOrEqual(1);
    });

    test("role has assume role policy for Lambda service", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Principal: {
                Service: "lambda.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            }),
          ]),
        }),
      });
    });

    test("exposes role property", () => {
      const construct = new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      expect(construct.role).toBeDefined();
      expect(construct.role.roleArn).toBeDefined();
    });
  });

  describe("Outputs", () => {
    test("exports function ARN", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(Object.keys(outputs).length).toBeGreaterThan(0);
      expect(
        Object.keys(outputs).some((key) => key.includes("FunctionArn"))
      ).toBe(true);
    });

    test("exports function name", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(
        Object.keys(outputs).some((key) => key.includes("FunctionName"))
      ).toBe(true);
    });

    test("exports have correct export names", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      const outputValues = Object.values(outputs);
      const exportNames = outputValues
        .map((output: any) => output.Export?.Name)
        .filter(Boolean);

      expect(exportNames).toContain("dev-my-function-arn");
      expect(exportNames).toContain("dev-my-function-name");
    });
  });

  describe("Tags", () => {
    test("applies environment tag", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Environment",
            Value: "dev",
          }),
        ]),
      });
    });

    test("applies ManagedBy tag", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "ManagedBy",
            Value: "CDK",
          }),
        ]),
      });
    });

    test("applies Function tag", () => {
      new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Function",
            Value: "my-function",
          }),
        ]),
      });
    });
  });

  describe("Construct Properties", () => {
    test("exposes function property", () => {
      const construct = new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      expect(construct.function).toBeDefined();
      expect(construct.function.functionArn).toBeDefined();
      expect(construct.function.functionName).toBeDefined();
    });

    test("exposes log group property", () => {
      const construct = new LambdaFunctionConstruct(stack, "TestFunction", {
        envName: "dev",
        functionName: "my-function",
        entry: ENTRY_PATH,
      });

      expect(construct.logGroup).toBeDefined();
      expect(construct.logGroup.logGroupName).toBeDefined();
    });
  });

  describe("Multiple Functions", () => {
    test("creates multiple functions with different names", () => {
      new LambdaFunctionConstruct(stack, "Function1", {
        envName: "dev",
        functionName: "function-1",
        entry: ENTRY_PATH,
      });

      new LambdaFunctionConstruct(stack, "Function2", {
        envName: "dev",
        functionName: "function-2",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::Lambda::Function", 2);
    });

    test("each function has its own log group", () => {
      new LambdaFunctionConstruct(stack, "Function1", {
        envName: "dev",
        functionName: "function-1",
        entry: ENTRY_PATH,
      });

      new LambdaFunctionConstruct(stack, "Function2", {
        envName: "dev",
        functionName: "function-2",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::Logs::LogGroup", 2);
    });

    test("each function has its own IAM role", () => {
      new LambdaFunctionConstruct(stack, "Function1", {
        envName: "dev",
        functionName: "function-1",
        entry: ENTRY_PATH,
      });

      new LambdaFunctionConstruct(stack, "Function2", {
        envName: "dev",
        functionName: "function-2",
        entry: ENTRY_PATH,
      });

      const template = Template.fromStack(stack);
      const roles = template.findResources("AWS::IAM::Role");
      expect(Object.keys(roles).length).toBeGreaterThanOrEqual(2);
    });
  });
});
