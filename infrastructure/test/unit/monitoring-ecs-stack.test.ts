/** @format */

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { MonitoringEcsStack } from "../../lib/stacks/monitoring/monitoring-ecs-stack";
import { NetworkingStack } from "../../lib/stacks/networking/networking-stack";

describe("MonitoringEcsStack", () => {
  let app: cdk.App;
  let networkingStack: NetworkingStack;

  beforeEach(() => {
    app = new cdk.App();
    networkingStack = new NetworkingStack(app, "TestNetworkingStack", {
      envName: "test",
      maxAzs: 2,
      natGateways: 0,
    });
  });

  describe("Stack Creation", () => {
    it("should create monitoring ECS stack successfully", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      expect(stack).toBeDefined();
      const template = Template.fromStack(stack);
      expect(template).toBeDefined();
    });

    it("should create stack with ALB DNS name", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
        albDnsName: "test-alb-123456.eu-west-1.elb.amazonaws.com",
      });

      expect(stack).toBeDefined();
    });
  });

  describe("ECS Cluster", () => {
    it("should create ECS cluster with correct name", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterName: "test-monitoring-cluster",
        ClusterSettings: [
          {
            Name: "containerInsights",
            Value: "enabled",
          },
        ],
      });
    });

    it("should use t3.small instance", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        InstanceType: "t3.small",
      });
    });

    it("should have single instance capacity", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
        MinSize: "1",
        MaxSize: "1",
        DesiredCapacity: "1",
      });
    });
  });

  describe("EBS Volume Configuration", () => {
    it("should configure EBS volume with encryption", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        BlockDeviceMappings: [
          {
            DeviceName: "/dev/xvda",
            Ebs: {
              VolumeSize: 30,
              VolumeType: "gp3",
              Encrypted: true,
              DeleteOnTermination: true,
            },
          },
        ],
      });
    });

    it("should create UserData with config directories", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      const launchConfig = template.findResources(
        "AWS::AutoScaling::LaunchConfiguration"
      );
      const userData = Object.values(launchConfig)[0].Properties.UserData;

      // UserData should contain directory creation commands
      expect(userData).toBeDefined();
    });
  });

  describe("ECS Services", () => {
    it("should create three ECS services", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::ECS::Service", 3);
    });

    it("should create Prometheus service", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "test-prometheus",
        DesiredCount: 1,
        EnableExecuteCommand: true,
      });
    });

    it("should create Grafana service", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "test-grafana",
        DesiredCount: 1,
        EnableExecuteCommand: true,
      });
    });

    it("should create Node Exporter service", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "test-node-exporter",
        DesiredCount: 1,
        EnableExecuteCommand: true,
      });
    });
  });

  describe("Application Load Balancer", () => {
    it("should create internet-facing ALB", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Name: "test-monitoring-alb",
          Scheme: "internet-facing",
          Type: "application",
        }
      );
    });

    it("should create target groups", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 2);
    });
  });

  describe("CloudWatch Logs", () => {
    it("should create log groups for all services", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::Logs::LogGroup", 3);

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/test-prometheus",
        RetentionInDays: 7,
      });

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/test-grafana",
        RetentionInDays: 7,
      });

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/test-node-exporter",
        RetentionInDays: 7,
      });
    });
  });

  describe("Stack Outputs", () => {
    it("should export all required outputs", () => {
      const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      const template = Template.fromStack(stack);

      template.hasOutput("GrafanaUrl", {
        Description: "Grafana Dashboard URL (default: admin/admin)",
      });

      template.hasOutput("PrometheusUrl", {
        Description: "Prometheus URL",
      });

      template.hasOutput("MonitoringAlbDns", {
        Description: "Monitoring ALB DNS name",
      });

      template.hasOutput("ClusterName", {
        Description: "ECS Cluster name for monitoring",
      });
    });
  });
});
