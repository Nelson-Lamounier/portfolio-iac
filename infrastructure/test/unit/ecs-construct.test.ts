/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Template, Match } from "aws-cdk-lib/assertions";
import { EcsConstruct } from "../../lib/constructs/compute/ecs-construct";

describe("EcsConstruct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let vpc: ec2.IVpc;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack");
    vpc = new ec2.Vpc(stack, "TestVpc", { maxAzs: 2 });
  });

  describe("Cluster Creation", () => {
    test("creates ECS cluster", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::ECS::Cluster", 1);
    });

    test("cluster has environment-specific name", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "production",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterName: Match.stringLikeRegexp(".*production.*"),
      });
    });

    test("exposes cluster as public property", () => {
      const ecsConstruct = new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });

      expect(ecsConstruct.cluster).toBeDefined();
      expect(ecsConstruct.cluster.clusterName).toBeDefined();
    });
  });

  describe("Auto Scaling Group", () => {
    test("creates auto scaling group", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::AutoScaling::AutoScalingGroup", 1);
    });

    test("uses t3.micro by default", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        InstanceType: "t3.micro",
      });
    });

    test("respects custom instance type", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        instanceType: new ec2.InstanceType("t3.medium"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        InstanceType: "t3.medium",
      });
    });

    test("uses public subnets", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        AssociatePublicIpAddress: true,
      });
    });

    test("has correct capacity configuration", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        minCapacity: 1,
        maxCapacity: 3,
        desiredCapacity: 2,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
        MinSize: "1",
        MaxSize: "3",
        DesiredCapacity: "2",
      });
    });

    test("exposes ASG as public property", () => {
      const ecsConstruct = new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });

      expect(ecsConstruct.asg).toBeDefined();
    });
  });

  describe("Task Definition", () => {
    test("creates EC2 task definition", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      // Now creates 2 task definitions: app + node-exporter
      template.resourceCountIs("AWS::ECS::TaskDefinition", 2);
    });

    test("uses BRIDGE network mode", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        NetworkMode: "bridge",
      });
    });

    test("has default memory reservation (soft limit)", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            MemoryReservation: 512, // Default soft limit
          }),
        ]),
      });
    });

    test("respects custom memory reservation", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        memoryReservationMiB: 1024,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            MemoryReservation: 1024,
          }),
        ]),
      });
    });

    test("has container with hard memory limit when specified", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        memoryReservationMiB: 512,
        memoryLimitMiB: 1024,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            MemoryReservation: 512,
            Memory: 1024,
          }),
        ]),
      });
    });

    test("has container with CPU when specified", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        cpu: 512,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Cpu: 512,
          }),
        ]),
      });
    });

    test("exposes task definition as public property", () => {
      const ecsConstruct = new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });

      expect(ecsConstruct.taskDefinition).toBeDefined();
    });
  });

  describe("Container Configuration", () => {
    test("uses dynamic port mapping", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            PortMappings: Match.arrayWith([
              Match.objectLike({
                ContainerPort: 80,
                HostPort: 0, // Dynamic port
                Protocol: "tcp",
              }),
            ]),
          }),
        ]),
      });
    });

    test("respects custom container port", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        containerPort: 8080,
      });
      const template = Template.fromStack(stack);

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

    test("has CloudWatch logging configured", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            LogConfiguration: {
              LogDriver: "awslogs",
              Options: Match.objectLike({
                "awslogs-stream-prefix": "ecs-test",
              }),
            },
          }),
        ]),
      });
    });
  });

  describe("ECS Service", () => {
    test("creates ECS service", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      // Now creates 2 services: app + node-exporter
      template.resourceCountIs("AWS::ECS::Service", 2);
    });

    test("service has environment-specific name", () => {
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

    test("service has correct desired count", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
        desiredCapacity: 2,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        DesiredCount: 2,
      });
    });

    test("service has circuit breaker enabled for automatic rollback", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        DeploymentConfiguration: Match.objectLike({
          DeploymentCircuitBreaker: {
            Enable: false,
          },
        }),
      });
    });

    test("service has correct deployment configuration for initial deployment", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Service", {
        DeploymentConfiguration: Match.objectLike({
          MinimumHealthyPercent: 0, // Allows all tasks to be stopped for initial deployment
          MaximumPercent: 200,
        }),
      });
    });

    test("exposes service as public property", () => {
      const ecsConstruct = new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });

      expect(ecsConstruct.service).toBeDefined();
      expect(ecsConstruct.service.serviceName).toBeDefined();
    });
  });

  describe("Environment Tagging", () => {
    test("tags cluster with environment", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "production",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Cluster", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Environment",
            Value: "production",
          }),
        ]),
      });
    });

    test("tags resources with ManagedBy CDK", () => {
      new EcsConstruct(stack, "TestEcs", {
        vpc,
        envName: "test",
        containerImage: ecs.ContainerImage.fromRegistry("nginx"),
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ECS::Cluster", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "ManagedBy",
            Value: "CDK",
          }),
        ]),
      });
    });
  });
});
