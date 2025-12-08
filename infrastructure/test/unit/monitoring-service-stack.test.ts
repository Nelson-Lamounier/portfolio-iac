/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Template, Match } from "aws-cdk-lib/assertions";
import { VpcConstruct } from "../../lib/constructs/networking/vpc-construct";
import { MonitoringInfraStack } from "../../lib/stacks/monitoring/monitoring-infra-stack";
import { MonitoringServiceStack } from "../../lib/stacks/monitoring/monitoring-service-stack";

describe("MonitoringServiceStack", () => {
  let app: cdk.App;
  let vpc: ec2.IVpc;
  let infraStack: MonitoringInfraStack;

  beforeEach(() => {
    app = new cdk.App();
    const vpcStack = new cdk.Stack(app, "VpcStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
    });
    const vpcConstruct = new VpcConstruct(vpcStack, "TestVpc", {
      maxAzs: 2,
      natGateways: 0,
    });
    vpc = vpcConstruct.vpc;

    infraStack = new MonitoringInfraStack(
      app,
      "MonitoringInfraStack-pipeline",
      {
        env: {
          account: "123456789012",
          region: "eu-west-1",
        },
        vpc,
        envName: "pipeline",
      }
    );
  });

  describe("Stack Creation", () => {
    test("creates stack with correct name", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      expect(serviceStack.stackName).toBe("MonitoringServiceStack-pipeline");
    });
  });

  describe("ECS Services", () => {
    test("creates Prometheus service", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: Match.stringLikeRegexp(".*prometheus.*"),
      });
    });

    test("creates Grafana service", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: Match.stringLikeRegexp(".*grafana.*"),
      });
    });

    test("creates Node Exporter service", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: Match.stringLikeRegexp(".*node-exporter.*"),
      });
    });

    test("exposes Prometheus service property", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      expect(serviceStack.prometheusService).toBeDefined();
      expect(serviceStack.prometheusService.serviceName).toBeDefined();
    });

    test("exposes Grafana service property", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      expect(serviceStack.grafanaService).toBeDefined();
      expect(serviceStack.grafanaService.serviceName).toBeDefined();
    });

    test("exposes Node Exporter service property", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      expect(serviceStack.nodeExporterService).toBeDefined();
      expect(serviceStack.nodeExporterService.serviceName).toBeDefined();
    });
  });

  describe("ECS Task Definitions", () => {
    test("creates task definitions for services", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      const taskDefs = template.findResources("AWS::ECS::TaskDefinition");
      expect(Object.keys(taskDefs).length).toBeGreaterThanOrEqual(3);
    });

    test("task definitions have container definitions", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: Match.stringLikeRegexp(".*"),
          }),
        ]),
      });
    });
  });

  describe("Load Balancer Target Groups", () => {
    test("creates Grafana target group", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          Port: 3000,
          Protocol: "HTTP",
          HealthCheckPath: "/grafana/api/health",
        }
      );
    });

    test("creates Prometheus target group", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          Port: 9090,
          Protocol: "HTTP",
          HealthCheckPath: "/prometheus/-/healthy",
        }
      );
    });

    test("target groups have health checks configured", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          HealthCheckIntervalSeconds: 30,
          HealthyThresholdCount: 2,
          UnhealthyThresholdCount: 3,
        }
      );
    });
  });

  describe("Listener Rules", () => {
    test("creates listener rules for routing", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      const rules = template.findResources(
        "AWS::ElasticLoadBalancingV2::ListenerRule"
      );
      // Should have at least 2 rules (Grafana and Prometheus)
      expect(Object.keys(rules).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("IAM Roles and Policies", () => {
    test("creates task execution roles", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      const roles = template.findResources("AWS::IAM::Role");
      expect(Object.keys(roles).length).toBeGreaterThanOrEqual(3);
    });

    test("task roles have policies attached", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      const policies = template.findResources("AWS::IAM::Policy");
      expect(Object.keys(policies).length).toBeGreaterThan(0);
    });
  });

  describe("Outputs", () => {
    test("exports Prometheus service ARN", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      template.hasOutput("PrometheusServiceArn", {
        Export: {
          Name: Match.stringLikeRegexp(".*prometheus-service-arn"),
        },
      });
    });

    test("exports Grafana service ARN", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);
      template.hasOutput("GrafanaServiceArn", {
        Export: {
          Name: Match.stringLikeRegexp(".*grafana-service-arn"),
        },
      });
    });
  });

  describe("Tags", () => {
    test("applies correct tags to stack", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(serviceStack);

      // Check that resources have expected tags
      template.hasResourceProperties("AWS::ECS::Service", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Environment",
            Value: "pipeline",
          }),
        ]),
      });
    });
  });

  describe("Dependencies", () => {
    test("services depend on infrastructure stack", () => {
      const serviceStack = new MonitoringServiceStack(
        app,
        "MonitoringServiceStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          cluster: infraStack.cluster,
          autoScalingGroup: infraStack.autoScalingGroup,
          loadBalancer: infraStack.loadBalancer,
          listener: infraStack.listener,
          envName: "pipeline",
        }
      );

      // Verify that services reference infrastructure resources
      expect(serviceStack.prometheusService.cluster).toBe(infraStack.cluster);
      expect(serviceStack.grafanaService.cluster).toBe(infraStack.cluster);
      expect(serviceStack.nodeExporterService.cluster).toBe(infraStack.cluster);
    });
  });
});
