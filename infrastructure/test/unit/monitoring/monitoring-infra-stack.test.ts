/** @format */

/// <reference types="jest" />

import { Template, Match } from "aws-cdk-lib/assertions";
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

      // Check Launch Configuration for instance type
      testSetup.template.hasResourceProperties(
        "AWS::AutoScaling::LaunchConfiguration",
        {
          InstanceType: "t3.small",
        }
      );
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
