/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Template, Match } from "aws-cdk-lib/assertions";
import { EcsConstruct } from "../../lib/constructs/compute/ecs-construct";

describe("ECS Service - Detailed Tests", () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let vpc: ec2.IVpc;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    vpc = new ec2.Vpc(stack, "TestVpc", { maxAzs: 2 });
  });

  describe("Service Configuration", () => {
    test("service is created with correct launch type", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        LaunchType: "EC2",
      });
    });

    test("service uses correct task definition", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        TaskDefinition: Match.objectLike({
          Ref: Match.stringLikeRegexp("TestEcsTaskDef.*"),
        }),
      });
    });

    test("service references correct cluster", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        Cluster: Match.objectLike({
          Ref: Match.stringLikeRegexp("TestEcsCluster.*"),
        }),
      });
    });

    test("service has deployment configuration", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        DeploymentConfiguration: Match.objectLike({
          MaximumPercent: Match.anyValue(),
          MinimumHealthyPercent: Match.anyValue(),
        }),
      });
    });
  });

  describe("Service Placement Strategy", () => {
    test("uses spread across instances strategy", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        PlacementStrategies: Match.arrayWith([
          Match.objectLike({
            Type: "spread",
            Field: "instanceId",
          }),
        ]),
      });
    });

    test("uses packed by CPU strategy", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        PlacementStrategies: Match.arrayWith([
          Match.objectLike({
            Type: "binpack",
            Field: "CPU",
          }),
        ]),
      });
    });

    test("has both placement strategies in correct order", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        PlacementStrategies: [
          { Type: "spread", Field: "instanceId" },
          { Type: "binpack", Field: "CPU" },
        ],
      });
    });
  });

  describe("Service Scaling", () => {
    test("service desired count matches capacity setting", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        desiredCapacity: 2,
        maxCapacity: 3,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        DesiredCount: 2,
      });
    });

    test("service defaults to 1 task when no capacity specified", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        DesiredCount: 1,
      });
    });

    test("service respects minimum capacity of 1", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        minCapacity: 1,
        desiredCapacity: 1,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        DesiredCount: 1,
      });
    });
  });

  describe("Service Naming", () => {
    test("service name includes environment for dev", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "dev",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "ecs-service-dev",
      });
    });

    test("service name includes environment for staging", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "staging",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "ecs-service-staging",
      });
    });

    test("service name includes environment for production", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "production",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "ecs-service-production",
      });
    });
  });

  describe("Service Tagging", () => {
    test("service has Environment tag", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "production",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Environment",
            Value: "production",
          }),
        ]),
      });
    });

    test("service has ManagedBy tag", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "ManagedBy",
            Value: "CDK",
          }),
        ]),
      });
    });

    test("service has Service tag", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Service",
            Value: "ECS",
          }),
        ]),
      });
    });

    test("service has all required tags", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "staging",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        Tags: [
          { Key: "Environment", Value: "staging" },
          { Key: "ManagedBy", Value: "CDK" },
          { Key: "Service", Value: "ECS" },
        ],
      });
    });
  });

  describe("Service Integration", () => {
    test("service is properly integrated with cluster and task definition", () => {
      const ecsConstruct = new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });

      expect(ecsConstruct.service.cluster).toBe(ecsConstruct.cluster);
      expect(ecsConstruct.service.taskDefinition).toBe(
        ecsConstruct.taskDefinition
      );
    });

    test("service can be accessed via public property", () => {
      const ecsConstruct = new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });

      expect(ecsConstruct.service).toBeInstanceOf(ecs.Ec2Service);
      expect(ecsConstruct.service.serviceName).toContain("Token");
      expect(ecsConstruct.service.serviceArn).toBeDefined();
    });
  });

  describe("Service with Different Configurations", () => {
    test("service works with custom container port", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        containerPort: 8080,
        desiredCapacity: 2,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "ecs-service-test",
        DesiredCount: 2,
      });

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            PortMappings: Match.arrayWith([
              Match.objectLike({
                ContainerPort: 8080,
                HostPort: 0,
              }),
            ]),
          }),
        ]),
      });
    });

    test("service works with custom CPU and memory", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        cpu: 1024,
        memoryLimitMiB: 2048,
        desiredCapacity: 1,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        DesiredCount: 1,
      });

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Cpu: 1024,
            Memory: 2048,
          }),
        ]),
      });
    });

    test("service works with custom instance type", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        instanceType: new ec2.InstanceType("t3.small"),
        desiredCapacity: 2,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        DesiredCount: 2,
      });

      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        InstanceType: "t3.small",
      });
    });
  });

  describe("Service Resource Count", () => {
    test("creates exactly one service per construct", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      // Now creates 2 services per construct: app + node-exporter
      template.resourceCountIs("AWS::ECS::Service", 2);
    });

    test("multiple constructs create multiple services", () => {
      new EcsConstruct(stack, "TestEcs1", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });

      new EcsConstruct(stack, "TestEcs2", {
        vpc,
        envName: "staging",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });

      const template = Template.fromStack(stack);
      // Each construct creates 2 services (app + node-exporter), so 2 constructs = 4 services
      template.resourceCountIs("AWS::ECS::Service", 4);
    });
  });
});
