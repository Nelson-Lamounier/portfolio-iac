/** @format */

import * as cdk from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";
import { Template, Match } from "aws-cdk-lib/assertions";
import { MonitoringConstruct } from "../../lib/constructs/monitoring/monitoring-construct";

describe("MonitoringConstruct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack");
  });

  describe("SNS Topic Creation", () => {
    test("creates SNS topic for alerts", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::SNS::Topic", 1);
    });

    test("SNS topic has correct display name", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "production",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SNS::Topic", {
        DisplayName: "production Infrastructure Alerts",
      });
    });

    test("adds email subscription when provided", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
        alertEmail: "test@example.com",
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::SNS::Subscription", 1);
      template.hasResourceProperties("AWS::SNS::Subscription", {
        Protocol: "email",
        Endpoint: "test@example.com",
      });
    });

    test("no subscription when email not provided", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::SNS::Subscription", 0);
    });
  });

  describe("CloudWatch Log Groups", () => {
    test("creates deployment log group", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/deployments/test",
      });
    });

    test("uses correct retention period", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
        logRetentionDays: logs.RetentionDays.ONE_WEEK,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        RetentionInDays: 7,
      });
    });
  });

  describe("Metric Filters", () => {
    test("creates deployment failure metric filter", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::MetricFilter", {
        FilterPattern: Match.stringLikeRegexp("ERROR.*FAILED.*FAILURE"),
        MetricTransformations: [
          Match.objectLike({
            MetricName: "DeploymentFailures",
            MetricNamespace: "Deployments",
          }),
        ],
      });
    });

    test("creates deployment success metric filter", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::MetricFilter", {
        FilterPattern: Match.stringLikeRegexp("SUCCESS.*COMPLETED"),
        MetricTransformations: [
          Match.objectLike({
            MetricName: "DeploymentSuccess",
            MetricNamespace: "Deployments",
          }),
        ],
      });
    });
  });

  describe("CloudWatch Alarms", () => {
    test("creates deployment failure alarm", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmName: "test-deployment-failures",
        MetricName: "DeploymentFailures",
        Namespace: "Deployments",
        Threshold: 1,
      });
    });

    test("creates ECS CPU alarm", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmName: "test-ecs-high-cpu",
        MetricName: "CPUUtilization",
        Namespace: "AWS/ECS",
        Threshold: 80,
      });
    });

    test("creates ECS memory alarm", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmName: "test-ecs-high-memory",
        MetricName: "MemoryUtilization",
        Namespace: "AWS/ECS",
        Threshold: 80,
      });
    });

    test("alarms have SNS actions", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmActions: Match.arrayWith([
          Match.objectLike({
            Ref: Match.stringLikeRegexp("TestMonitoringAlarmTopic.*"),
          }),
        ]),
      });
    });
  });

  describe("CloudWatch Dashboard", () => {
    test("creates dashboard when enabled", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
        enableDashboard: true,
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    });

    test("does not create dashboard when disabled", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
        enableDashboard: false,
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::CloudWatch::Dashboard", 0);
    });

    test("dashboard has correct name", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "production",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
        enableDashboard: true,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
        DashboardName: "production-infrastructure",
      });
    });
  });

  describe("Public Properties", () => {
    test("exposes alarm topic", () => {
      const monitoring = new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
      });

      expect(monitoring.alarmTopic).toBeDefined();
      expect(monitoring.alarmTopic.topicArn).toBeDefined();
    });

    test("exposes dashboard when enabled", () => {
      const monitoring = new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
        enableDashboard: true,
      });

      expect(monitoring.dashboard).toBeDefined();
    });

    test("dashboard is undefined when disabled", () => {
      const monitoring = new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "test",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
        enableDashboard: false,
      });

      expect(monitoring.dashboard).toBeUndefined();
    });
  });

  describe("Environment-Specific Configuration", () => {
    test("development environment configuration", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "development",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
        enableDashboard: false,
        logRetentionDays: logs.RetentionDays.ONE_WEEK,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/deployments/development",
        RetentionInDays: 7,
      });
      template.resourceCountIs("AWS::CloudWatch::Dashboard", 0);
    });

    test("production environment configuration", () => {
      new MonitoringConstruct(stack, "TestMonitoring", {
        envName: "production",
        ecsClusterName: "test-cluster",
        ecsServiceName: "test-service",
        enableDashboard: true,
        logRetentionDays: logs.RetentionDays.ONE_MONTH,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/deployments/production",
        RetentionInDays: 30,
      });
      template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    });
  });
});
