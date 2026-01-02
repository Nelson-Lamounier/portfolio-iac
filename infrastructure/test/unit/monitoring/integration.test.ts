/** @format */

// test/monitoring/integration.test.ts
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import { MonitoringInfraStack } from "../../../lib/stacks/monitoring/monitoring-infra-stack";
import { createTestMonitoringInfraStack } from "../../helpers/test-helpers";

describe("Monitoring Stack Integration", () => {
  let testSetup: {
    app: cdk.App;
    stack: MonitoringInfraStack;
    template: Template;
  };

  beforeEach(() => {
    testSetup = createTestMonitoringInfraStack({
      envName: "pipeline",
      account: "123456789012",
      region: "eu-west-1",
    });
  });

  // ---------------------------------------------------------------------------
  // Resource Count Tests
  // ---------------------------------------------------------------------------
  describe("Resource Counts", () => {
    test("creates expected number of security groups", () => {
      const sgCount = Object.keys(
        testSetup.template.findResources("AWS::EC2::SecurityGroup")
      ).length;
      expect(sgCount).toBeGreaterThanOrEqual(2); // At least ECS + ALB
      expect(sgCount).toBeLessThanOrEqual(10); // Not too many
    });

    test("creates expected number of IAM roles", () => {
      const roleCount = Object.keys(
        testSetup.template.findResources("AWS::IAM::Role")
      ).length;
      expect(roleCount).toBeGreaterThanOrEqual(2); // EC2 + Task roles
      expect(roleCount).toBeLessThanOrEqual(10);
    });

    test("creates ECS cluster for services", () => {
      // MonitoringInfraStack creates the cluster, not the services themselves
      // Services are created in a separate service stack
      testSetup.template.resourceCountIs("AWS::ECS::Cluster", 1);

      // Verify cluster has Container Insights enabled
      const clusters = testSetup.template.findResources("AWS::ECS::Cluster");
      Object.values(clusters).forEach((cluster: any) => {
        const settings = cluster.Properties?.ClusterSettings || [];
        const containerInsights = settings.find(
          (setting: any) => setting.Name === "containerInsights"
        );
        expect(containerInsights?.Value).toBe("enabled");
      });
    });

    test("creates ECS cluster", () => {
      testSetup.template.resourceCountIs("AWS::ECS::Cluster", 1);
    });

    test("creates Application Load Balancer", () => {
      testSetup.template.resourceCountIs(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        1
      );
    });

    test("creates Auto Scaling Group", () => {
      testSetup.template.resourceCountIs(
        "AWS::AutoScaling::AutoScalingGroup",
        1
      );
    });

    test("creates SSM State Manager resources", () => {
      // SSM Documents for ECS and CloudWatch Agent configuration
      const documentCount = Object.keys(
        testSetup.template.findResources("AWS::SSM::Document")
      ).length;
      expect(documentCount).toBeGreaterThanOrEqual(2); // At least 2 custom documents
      expect(documentCount).toBeLessThanOrEqual(5); // Not too many

      // SSM Associations for ECS and CloudWatch Agent setup
      const associationCount = Object.keys(
        testSetup.template.findResources("AWS::SSM::Association")
      ).length;
      expect(associationCount).toBeGreaterThanOrEqual(4); // At least 4 associations
      expect(associationCount).toBeLessThanOrEqual(10); // Not too many
    });
  });

  // ---------------------------------------------------------------------------
  // Integration Tests
  // ---------------------------------------------------------------------------
  describe("Stack Integration", () => {
    test("stack can be synthesized without errors", () => {
      expect(() => testSetup.app.synth()).not.toThrow();
    });

    test("all resources have required tags", () => {
      const resources = testSetup.template.toJSON().Resources;
      const resourcesWithTags = Object.values(resources).filter(
        (resource: any) => resource.Properties?.Tags
      );

      // Most resources should have tags
      expect(resourcesWithTags.length).toBeGreaterThan(0);

      // Check that tagged resources have Environment tag
      resourcesWithTags.forEach((resource: any) => {
        const tags = resource.Properties.Tags;
        const hasEnvironmentTag = tags.some(
          (tag: any) => tag.Key === "Environment"
        );
        expect(hasEnvironmentTag).toBe(true);
      });
    });

    test("security groups follow least privilege principle", () => {
      const securityGroups = testSetup.template.findResources(
        "AWS::EC2::SecurityGroup"
      );

      Object.values(securityGroups).forEach((sg: any) => {
        const ingressRules = sg.Properties?.SecurityGroupIngress || [];

        // Check no rules allow 0.0.0.0/0 on non-standard ports
        ingressRules.forEach((rule: any) => {
          if (rule.CidrIp === "0.0.0.0/0") {
            // Only allow standard web ports from internet
            const allowedPorts = [80, 443, 3000, 9090]; // HTTP, HTTPS, Grafana, Prometheus
            const port = rule.FromPort || rule.ToPort;
            expect(allowedPorts).toContain(port);
          }
        });
      });
    });

    test("ECS services are properly configured", () => {
      const services = testSetup.template.findResources("AWS::ECS::Service");

      Object.values(services).forEach((service: any) => {
        // Services should have desired count
        expect(service.Properties.DesiredCount).toBeGreaterThanOrEqual(1);

        // Services should have network configuration
        expect(service.Properties.NetworkConfiguration).toBeDefined();

        // Services should not assign public IPs (should be in private subnets)
        const networkConfig =
          service.Properties.NetworkConfiguration?.AwsvpcConfiguration;
        if (networkConfig) {
          expect(networkConfig.AssignPublicIp).toBe("DISABLED");
        }
      });
    });

    test("task definitions have resource limits", () => {
      const taskDefinitions = testSetup.template.findResources(
        "AWS::ECS::TaskDefinition"
      );

      Object.values(taskDefinitions).forEach((taskDef: any) => {
        const containers = taskDef.Properties?.ContainerDefinitions || [];

        containers.forEach((container: any) => {
          // Containers should have memory limits
          expect(container.Memory).toBeDefined();
          expect(container.Memory).toBeGreaterThan(0);

          // Memory should be reasonable (not too high)
          expect(container.Memory).toBeLessThanOrEqual(4096);
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Performance and Cost Optimization Tests
  // ---------------------------------------------------------------------------
  describe("Performance and Cost Optimization", () => {
    test("uses appropriate instance types", () => {
      const launchTemplates = testSetup.template.findResources(
        "AWS::EC2::LaunchTemplate"
      );

      Object.values(launchTemplates).forEach((lt: any) => {
        const instanceType = lt.Properties?.LaunchTemplateData?.InstanceType;
        if (instanceType) {
          // Should use cost-effective instance types for monitoring
          const allowedTypes = [
            "t3.micro",
            "t3.small",
            "t3.medium",
            "t3.large",
          ];
          expect(allowedTypes).toContain(instanceType);
        }
      });
    });

    test("Auto Scaling Group has appropriate capacity", () => {
      const asgs = testSetup.template.findResources(
        "AWS::AutoScaling::AutoScalingGroup"
      );

      Object.values(asgs).forEach((asg: any) => {
        const minSize = parseInt(asg.Properties?.MinSize || "0");
        const maxSize = parseInt(asg.Properties?.MaxSize || "0");
        const desiredCapacity = parseInt(
          asg.Properties?.DesiredCapacity || "0"
        );

        // Reasonable capacity limits for monitoring
        expect(minSize).toBeGreaterThanOrEqual(1);
        expect(maxSize).toBeLessThanOrEqual(10);
        expect(desiredCapacity).toBeGreaterThanOrEqual(minSize);
        expect(desiredCapacity).toBeLessThanOrEqual(maxSize);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Monitoring and Observability Tests
  // ---------------------------------------------------------------------------
  describe("Monitoring and Observability", () => {
    test("CloudWatch logs are configured", () => {
      const logGroups = testSetup.template.findResources("AWS::Logs::LogGroup");
      expect(Object.keys(logGroups).length).toBeGreaterThan(0);

      // Log groups should have retention policies
      Object.values(logGroups).forEach((logGroup: any) => {
        expect(logGroup.Properties?.RetentionInDays).toBeDefined();
      });
    });

    test("ECS cluster has Container Insights enabled", () => {
      const clusters = testSetup.template.findResources("AWS::ECS::Cluster");

      Object.values(clusters).forEach((cluster: any) => {
        const settings = cluster.Properties?.ClusterSettings || [];
        const containerInsights = settings.find(
          (setting: any) => setting.Name === "containerInsights"
        );
        expect(containerInsights?.Value).toBe("enabled");
      });
    });
  });
});
