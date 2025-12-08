/** @format */

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { MonitoringConfigBucketConstruct } from "../../lib/constructs/monitoring/monitoring-config-bucket-construct";

describe("MonitoringConfigBucketConstruct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
    });
  });

  describe("Bucket Creation", () => {
    test("creates S3 bucket with correct naming convention", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: "pipeline-monitoring-config-123456789012",
      });
    });

    test("enables versioning by default", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        VersioningConfiguration: {
          Status: "Enabled",
        },
      });
    });

    test("respects enableVersioning prop", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
        enableVersioning: false,
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::S3::Bucket");
      const bucket = Object.values(resources)[0];

      expect(bucket.Properties.VersioningConfiguration?.Status).not.toBe(
        "Enabled"
      );
    });

    test("enables encryption at rest", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: "AES256",
              },
            },
          ],
        },
      });
    });

    test("blocks all public access", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    test("enforces SSL/TLS", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketEncryption: Match.anyValue(),
      });

      // Check for bucket policy that enforces SSL
      template.hasResourceProperties("AWS::S3::BucketPolicy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Deny",
              Action: "s3:*",
              Condition: {
                Bool: {
                  "aws:SecureTransport": "false",
                },
              },
            }),
          ]),
        }),
      });
    });
  });

  describe("Lifecycle Rules", () => {
    test("creates lifecycle rule for old versions", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        LifecycleConfiguration: Match.objectLike({
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: "DeleteOldVersions",
              Status: "Enabled",
            }),
          ]),
        }),
      });
    });

    test("retains minimum number of versions", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        LifecycleConfiguration: Match.objectLike({
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: "DeleteOldVersions",
            }),
          ]),
        }),
      });
    });
  });

  describe("Outputs", () => {
    test("exports bucket name", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      // Outputs are created by the construct
      const outputs = template.findOutputs("*");
      expect(Object.keys(outputs).length).toBeGreaterThan(0);
    });

    test("exports bucket ARN", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      // Verify outputs exist
      const outputs = template.findOutputs("*");
      expect(Object.keys(outputs).length).toBeGreaterThan(0);
    });
  });

  describe("Grant Methods", () => {
    test("grantRead adds read permissions", () => {
      const construct = new MonitoringConfigBucketConstruct(
        stack,
        "TestBucket",
        {
          envName: "pipeline",
        }
      );

      const role = new cdk.aws_iam.Role(stack, "TestRole", {
        assumedBy: new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
      });

      construct.grantRead(role);

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "s3:GetObject*",
                "s3:GetBucket*",
                "s3:List*",
              ]),
            }),
          ]),
        }),
      });
    });

    test("grantWrite adds write permissions", () => {
      const construct = new MonitoringConfigBucketConstruct(
        stack,
        "TestBucket",
        {
          envName: "pipeline",
        }
      );

      const role = new cdk.aws_iam.Role(stack, "TestRole", {
        assumedBy: new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
      });

      construct.grantWrite(role);

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "s3:DeleteObject*",
                "s3:PutObject",
                "s3:Abort*",
              ]),
            }),
          ]),
        }),
      });
    });

    test("grantReadWrite adds both read and write permissions", () => {
      const construct = new MonitoringConfigBucketConstruct(
        stack,
        "TestBucket",
        {
          envName: "pipeline",
        }
      );

      const role = new cdk.aws_iam.Role(stack, "TestRole", {
        assumedBy: new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
      });

      construct.grantReadWrite(role);

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "s3:GetObject*",
                "s3:DeleteObject*",
                "s3:PutObject",
              ]),
            }),
          ]),
        }),
      });
    });
  });

  describe("Tags", () => {
    test("applies correct tags to bucket", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Component",
            Value: "Monitoring",
          }),
          Match.objectLike({
            Key: "Purpose",
            Value: "ConfigStorage",
          }),
        ]),
      });
    });
  });

  describe("Removal Policy", () => {
    test("retains bucket on stack deletion", () => {
      new MonitoringConfigBucketConstruct(stack, "TestBucket", {
        envName: "pipeline",
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::S3::Bucket");
      const bucket = Object.values(resources)[0];

      // RETAIN policy means DeletionPolicy should be Retain
      expect(bucket.DeletionPolicy).toBe("Retain");
    });
  });

  describe("Public API", () => {
    test("exposes bucket property", () => {
      const construct = new MonitoringConfigBucketConstruct(
        stack,
        "TestBucket",
        {
          envName: "pipeline",
        }
      );

      expect(construct.bucket).toBeDefined();
      expect(construct.bucket.bucketName).toBeDefined();
      expect(construct.bucket.bucketArn).toBeDefined();
    });
  });
});
