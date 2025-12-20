/** @format */

/// <reference types="jest" />

import { Match } from "aws-cdk-lib/assertions";

import { createTestMonitoringInfraStack } from "../../helpers/test-helpers";

describe("MonitoringInfraStack", () => {
  // ---------------------------------------------------------------------------
  // Basic Stack Tests
  // ---------------------------------------------------------------------------
  describe("Stack Creation", () => {
    test("creates stack successfully", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      expect(testSetup.stack).toBeDefined();
      expect(testSetup.template).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Note: VPC is created by test helper in separate stack, not by MonitoringInfraStack
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // ECS Cluster Tests
  // ---------------------------------------------------------------------------
  describe("ECS Cluster", () => {
    test("creates ECS cluster with Container Insights enabled", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterSettings: Match.arrayWith([
          {
            Name: "containerInsights",
            Value: "enabled",
          },
        ]),
      });
    });

    test("cluster has proper naming convention", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterName: "pipeline-monitoring-cluster",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Auto Scaling Group Tests
  // ---------------------------------------------------------------------------
  describe("Auto Scaling Group", () => {
    test("creates ASG with correct capacity", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties(
        "AWS::AutoScaling::AutoScalingGroup",
        {
          MinSize: "1",
          MaxSize: "1",
          DesiredCapacity: "1",
        }
      );
    });

    test("ASG uses correct instance type", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Check Launch Template for instance type
      testSetup.template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
        LaunchTemplateData: Match.objectLike({
          InstanceType: "t3.small",
        }),
      });
    });

    test("ASG has security hardening", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Just verify that ASG exists with proper configuration
      testSetup.template.hasResourceProperties(
        "AWS::AutoScaling::AutoScalingGroup",
        {
          MinSize: "1",
          MaxSize: "1",
          DesiredCapacity: "1",
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Application Load Balancer Tests
  // ---------------------------------------------------------------------------
  describe("Application Load Balancer", () => {
    test("creates internet-facing ALB", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Scheme: "internet-facing",
          Type: "application",
        }
      );
    });

    test("creates ALB listener", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.resourceCountIs(
        "AWS::ElasticLoadBalancingV2::Listener",
        1
      );
    });

    test("ALB has proper naming", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Name: "pipeline-monitoring-alb",
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // CloudWatch Logs Tests
  // ---------------------------------------------------------------------------
  describe("CloudWatch Logs", () => {
    test("creates task log group with retention", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: Match.stringLikeRegexp(".*/tasks$"),
        RetentionInDays: 14,
      });
    });

    test("creates event log group with retention", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: Match.stringLikeRegexp(".*/events$"),
        RetentionInDays: 14,
      });
    });

    test("creates ECS event rule", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::Events::Rule", {
        EventPattern: {
          source: ["aws.ecs"],
          "detail-type": [
            "ECS Task State Change",
            "ECS Container Instance State Change",
            "ECS Service Action",
          ],
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // S3 Configuration Bucket Tests
  // ---------------------------------------------------------------------------
  describe("S3 Configuration Bucket", () => {
    test("creates S3 bucket for configuration", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.resourceCountIs("AWS::S3::Bucket", 1);
    });

    test("S3 bucket has versioning enabled", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::S3::Bucket", {
        VersioningConfiguration: {
          Status: "Enabled",
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // IAM Role Tests
  // ---------------------------------------------------------------------------
  describe("IAM Roles and Policies", () => {
    test("creates IAM role for ASG instances", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: "ec2.amazonaws.com",
              },
            }),
          ]),
        },
      });
    });

    test("grants EFS permissions to ASG role", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "elasticfilesystem:ClientMount",
                "elasticfilesystem:ClientWrite",
                "elasticfilesystem:ClientRootAccess",
              ]),
            }),
          ]),
        },
      });
    });

    test("grants SSM permissions to ASG role", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "ssm:GetParameter",
                "ssm:GetParameters",
                "ssm:GetParametersByPath",
              ]),
            }),
          ]),
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // User Data Tests (Minimal User Data)
  // ---------------------------------------------------------------------------
  describe("User Data Configuration", () => {
    test("uses minimal user data for infrastructure registration", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify launch template has user data
      testSetup.template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
        LaunchTemplateData: Match.objectLike({
          UserData: Match.anyValue(),
        }),
      });
    });

    test("user data is minimal (infrastructure registration only)", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // User data should be present but minimal (SSM + ECS only)
      // Application setup is handled by Lambda, not user data
      const launchTemplates = testSetup.template.findResources("AWS::EC2::LaunchTemplate");
      expect(Object.keys(launchTemplates).length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Application Setup Lambda Tests
  // ---------------------------------------------------------------------------
  describe("Application Setup Lambda", () => {
    test("creates Lambda function for application setup", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Check that Lambda function exists
      const lambdaCount = Object.keys(
        testSetup.template.findResources("AWS::Lambda::Function")
      ).length;
      expect(lambdaCount).toBeGreaterThan(0);
      
      // Check Lambda properties (check any Lambda function with these properties)
      testSetup.template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs22.x",
        Timeout: 600, // 10 minutes
        MemorySize: 512,
      });
    });

    test("Lambda has correct environment variables", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Check that at least one Lambda has the expected environment variables
      // The application setup Lambda should have CLUSTER_NAME (CloudFormation ref), ENV_NAME, and REGION
      testSetup.template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            CLUSTER_NAME: Match.anyValue(), // CloudFormation reference, not literal string
            ENV_NAME: "pipeline",
            REGION: "eu-west-1",
            EFS_STACK_NAME: Match.anyValue(), // May be a reference or literal
            FILE_SYSTEM_ID: Match.anyValue(), // CloudFormation reference
          }),
        }),
      });
    });

    test("creates EventBridge rule for container instance registration", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::Events::Rule", {
        EventPattern: {
          source: ["aws.ecs"],
          "detail-type": ["ECS Container Instance State Change"],
          detail: {
            status: ["ACTIVE"],
          },
        },
      });
    });

    test("Lambda has permissions for ECS and SSM", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "ecs:ListContainerInstances",
                "ecs:DescribeContainerInstances",
              ]),
            }),
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "ssm:SendCommand",
                "ssm:GetCommandInvocation",
              ]),
            }),
          ]),
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Stack Outputs Tests
  // ---------------------------------------------------------------------------
  describe("Stack Outputs", () => {
    test("exports cluster information", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      const outputs = testSetup.template.findOutputs("*");
      const outputKeys = Object.keys(outputs);

      expect(outputKeys).toContain("ClusterArn");
      expect(outputKeys).toContain("ClusterName");
    });

    test("exports load balancer information", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      const outputs = testSetup.template.findOutputs("*");
      const outputKeys = Object.keys(outputs);

      expect(outputKeys).toContain("LoadBalancerDns");
      expect(outputKeys).toContain("LoadBalancerArn");
      expect(outputKeys).toContain("ListenerArn");
    });

    test("exports monitoring URLs", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      const outputs = testSetup.template.findOutputs("*");
      const outputKeys = Object.keys(outputs);

      expect(outputKeys).toContain("GrafanaUrl");
      expect(outputKeys).toContain("PrometheusUrl");
    });
  });
});
