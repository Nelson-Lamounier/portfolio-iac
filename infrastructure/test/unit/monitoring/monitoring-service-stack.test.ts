/** @format */

/// <reference types="jest" />

// import * as cdk from "aws-cdk-lib"; // Unused import
import { Template, Match } from "aws-cdk-lib/assertions";

import {
  createTestMonitoringServiceStack,
  disableCdkNag,
} from "../../helpers/test-helpers";

// Disable CDK Nag for testing
disableCdkNag();

describe("MonitoringServiceStack", () => {
  let testSetup: ReturnType<typeof createTestMonitoringServiceStack>;
  let template: Template;

  beforeEach(() => {
    testSetup = createTestMonitoringServiceStack({
      envName: "test",
      account: "123456789012",
      region: "eu-west-1",
    });
    template = testSetup.template;
  });

  // ========================================================================
  // STACK CREATION TESTS
  // ========================================================================

  describe("Stack Creation", () => {
    test("should create stack successfully", () => {
      expect(testSetup.stack).toBeDefined();
      expect(testSetup.stack.stackName).toBe("TestMonitoringServiceStack");
    });

    test("should have correct stack tags", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        Tags: Match.arrayWith([{ Key: "Stack", Value: "MonitoringService" }]),
      });
    });
  });

  // ========================================================================
  // ECS SERVICES TESTS
  // ========================================================================

  describe("ECS Services", () => {
    test("should create Prometheus ECS service", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: Match.stringLikeRegexp(".*prometheus.*"),
        LaunchType: "EC2",
        DesiredCount: 1,
      });
    });

    test("should create Grafana ECS service", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: Match.stringLikeRegexp(".*grafana.*"),
        LaunchType: "EC2",
        DesiredCount: 1,
      });
    });

    test("should create Node Exporter ECS service", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "test-monitoring-node-exporter",
        LaunchType: "EC2",
        SchedulingStrategy: "DAEMON",
      });
    });

    test("should have correct service count", () => {
      const services = template.findResources("AWS::ECS::Service");
      expect(Object.keys(services)).toHaveLength(3);
    });
  });

  // ========================================================================
  // TASK DEFINITIONS TESTS
  // ========================================================================

  describe("Task Definitions", () => {
    test("should create Prometheus task definition", () => {
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: "prometheus",
            Image: Match.stringLikeRegexp(".*prometheus.*"),
            PortMappings: Match.arrayWith([
              Match.objectLike({
                ContainerPort: 9090,
                Protocol: "tcp",
              }),
            ]),
          }),
        ]),
      });
    });

    test("should create Grafana task definition", () => {
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: "grafana",
            Image: Match.stringLikeRegexp(".*grafana.*"),
            PortMappings: Match.arrayWith([
              Match.objectLike({
                ContainerPort: 3000,
                Protocol: "tcp",
              }),
            ]),
          }),
        ]),
      });
    });

    test("should create Node Exporter task definition", () => {
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: "node-exporter",
            Image: Match.stringLikeRegexp(".*node.*exporter.*"),
            PortMappings: Match.arrayWith([
              Match.objectLike({
                ContainerPort: 9100,
                Protocol: "tcp",
              }),
            ]),
          }),
        ]),
      });
    });

    test("should have memory limits for all containers", () => {
      const taskDefinitions = template.findResources(
        "AWS::ECS::TaskDefinition"
      );
      Object.values(taskDefinitions).forEach((td: any) => {
        const containers = td.Properties?.ContainerDefinitions || [];
        containers.forEach((container: any) => {
          expect(container.Memory || container.MemoryReservation).toBeDefined();
        });
      });
    });
  });

  // ========================================================================
  // LOAD BALANCER TESTS
  // ========================================================================

  describe("Load Balancer Configuration", () => {
    test("should create Grafana target group", () => {
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          Port: 3000,
          Protocol: "HTTP",
          TargetType: "instance",
          HealthCheckPath: "/", // Root path - Grafana may redirect, so accept 200, 301, 302
          HealthCheckIntervalSeconds: 60, // Increased from 30s to 60s
          HealthCheckTimeoutSeconds: 30, // Increased from 10s to 30s for Grafana startup
          Matcher: {
            HttpCode: "200,301,302", // Accept redirects as healthy
          },
          HealthyThresholdCount: 2,
          UnhealthyThresholdCount: 3,
        }
      );
    });

    test("should create Prometheus target group", () => {
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          Port: 9090,
          Protocol: "HTTP",
          TargetType: "instance",
          HealthCheckPath: "/", // Root path - Prometheus may redirect, so accept 200, 301, 302
          HealthCheckIntervalSeconds: 60, // Increased from 30s to 60s
          HealthCheckTimeoutSeconds: 30, // Increased from 10s to 30s for Prometheus startup
          Matcher: {
            HttpCode: "200,301,302", // Accept redirects as healthy (Prometheus returns 302 redirects)
          },
          HealthyThresholdCount: 2,
          UnhealthyThresholdCount: 3,
        }
      );
    });

    test("should create listener rules for routing", () => {
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::ListenerRule",
        {
          Priority: 100,
          Conditions: [
            {
              Field: "path-pattern",
              PathPatternConfig: { Values: ["/grafana*"] },
            },
          ],
        }
      );

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::ListenerRule",
        {
          Priority: 200,
          Conditions: [
            {
              Field: "path-pattern",
              PathPatternConfig: { Values: ["/prometheus*"] },
            },
          ],
        }
      );
    });

    test("should have correct target group count", () => {
      const targetGroups = template.findResources(
        "AWS::ElasticLoadBalancingV2::TargetGroup"
      );
      expect(Object.keys(targetGroups)).toHaveLength(2);
    });

    test("should have correct listener rule count", () => {
      const listenerRules = template.findResources(
        "AWS::ElasticLoadBalancingV2::ListenerRule"
      );
      expect(Object.keys(listenerRules)).toHaveLength(2);
    });
  });

  // ========================================================================
  // SECURITY TESTS
  // ========================================================================

  describe("Security Configuration", () => {
    test("should create ECS services without security groups", () => {
      // MonitoringServiceStack only creates ECS services
      // Security groups are created in MonitoringInfraStack
      template.resourceCountIs("AWS::EC2::SecurityGroup", 0);
      template.resourceCountIs("AWS::ECS::Service", 3); // Prometheus, Grafana, NodeExporter
    });

    test("should not allow public access to monitoring ports", () => {
      const securityGroups = template.findResources("AWS::EC2::SecurityGroup");
      Object.values(securityGroups).forEach((sg: any) => {
        const ingressRules = sg.Properties?.SecurityGroupIngress || [];
        ingressRules.forEach((rule: any) => {
          if (rule.CidrIp === "0.0.0.0/0") {
            expect([80, 443]).toContain(rule.FromPort || rule.ToPort);
          }
        });
      });
    });
  });

  // ========================================================================
  // CONTAINER CONFIGURATION TESTS
  // ========================================================================

  describe("Container Configuration", () => {
    test("should configure Prometheus with correct volumes", () => {
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: "prometheus",
            MountPoints: Match.arrayWith([
              Match.objectLike({
                ContainerPath: "/prometheus",
                SourceVolume: "prometheus-data",
              }),
            ]),
          }),
        ]),
      });
    });

    test("should configure Grafana with correct volumes", () => {
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: "grafana",
            MountPoints: Match.arrayWith([
              Match.objectLike({
                ContainerPath: "/var/lib/grafana",
                SourceVolume: "grafana-data",
              }),
            ]),
          }),
        ]),
      });
    });

    test("should enable execute command for all services", () => {
      const services = template.findResources("AWS::ECS::Service");
      Object.values(services).forEach((service: any) => {
        expect(service.Properties?.EnableExecuteCommand).toBe(true);
      });
    });
  });

  // ========================================================================
  // ENVIRONMENT CONFIGURATION TESTS
  // ========================================================================

  describe("Environment Configuration", () => {
    test("should configure Prometheus with correct environment variables", () => {
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: "prometheus",
            Environment: Match.arrayWith([
              Match.objectLike({
                Name: "ENVIRONMENT",
                Value: "test",
              }),
            ]),
          }),
        ]),
      });
    });

    test("should configure Node Exporter with correct service name", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "test-monitoring-node-exporter",
      });
    });
  });

  // ========================================================================
  // OUTPUTS TESTS
  // ========================================================================

  describe("Stack Outputs", () => {
    test("should export Prometheus service ARN", () => {
      template.hasOutput("PrometheusServiceArn", {
        Description: "Prometheus ECS Service ARN",
        Export: {
          Name: "TestMonitoringServiceStack-prometheus-service-arn",
        },
      });
    });

    test("should export Grafana service ARN", () => {
      template.hasOutput("GrafanaServiceArn", {
        Description: "Grafana ECS Service ARN",
        Export: {
          Name: "TestMonitoringServiceStack-grafana-service-arn",
        },
      });
    });
  });

  // ========================================================================
  // RESOURCE COUNT VALIDATION
  // ========================================================================

  describe("Resource Count Validation", () => {
    test("should have expected number of ECS services", () => {
      template.resourceCountIs("AWS::ECS::Service", 3);
    });

    test("should have expected number of task definitions", () => {
      template.resourceCountIs("AWS::ECS::TaskDefinition", 3);
    });

    test("should have expected number of target groups", () => {
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 2);
    });

    test("should have expected number of listener rules", () => {
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::ListenerRule", 2);
    });
  });

  // ========================================================================
  // INTEGRATION TESTS
  // ========================================================================

  describe("Integration with Infrastructure Stack", () => {
    test("should use cluster from infrastructure stack", () => {
      expect(testSetup.stack.prometheusService.cluster).toBe(
        testSetup.infraStack.cluster
      );
      expect(testSetup.stack.grafanaService.cluster).toBe(
        testSetup.infraStack.cluster
      );
      expect(testSetup.stack.nodeExporterService.cluster).toBe(
        testSetup.infraStack.cluster
      );
    });

    test("should reference load balancer from infrastructure stack", () => {
      // Verify that listener rules reference the correct listener
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::ListenerRule",
        {
          ListenerArn: Match.anyValue(),
        }
      );
    });
  });
});
