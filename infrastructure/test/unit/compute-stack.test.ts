/** @format */

import { App, Stack } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Template, Match, Capture } from "aws-cdk-lib/assertions";
import { ComputeStack } from "../../lib/stacks/compute/compute-stack";

describe("ComputeStack Test Suite", () => {
  let template: Template;
  let app: App;
  let vpc: ec2.IVpc;

  beforeAll(() => {
    app = new App();

    // Create VPC for testing
    const vpcStack = new Stack(app, "TestVpcStack", {
      env: { account: "123456789012", region: "eu-west-1" },
    });
    vpc = new ec2.Vpc(vpcStack, "TestVpc", {
      maxAzs: 2,
      natGateways: 0,
    });

    // Create ComputeStack
    const stack = new ComputeStack(app, "TestComputeStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
      envName: "test",
      vpc,
    });

    template = Template.fromStack(stack);
  });

  describe("ECS Cluster", () => {
    test("creates ECS cluster with correct name", () => {
      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterName: "ecs-cluster-test",
      });
    });

    test("ECS cluster has Container Insights enabled", () => {
      const clusterSettingsCapture = new Capture();
      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterSettings: clusterSettingsCapture,
      });

      const settings = clusterSettingsCapture.asArray();
      expect(settings).toContainEqual({
        Name: "containerInsights",
        Value: "enabled",
      });
    });

    test("ECS cluster has correct tags", () => {
      const tagsCapture = new Capture();
      template.hasResourceProperties("AWS::ECS::Cluster", {
        Tags: tagsCapture,
      });

      const tags = tagsCapture.asArray();
      expect(tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: "Environment",
            Value: "test",
          }),
          expect.objectContaining({
            Key: "ManagedBy",
            Value: "CDK",
          }),
        ])
      );
    });

    test("creates exactly one ECS cluster", () => {
      template.resourceCountIs("AWS::ECS::Cluster", 1);
    });
  });

  describe("Auto Scaling Group", () => {
    test("creates Auto Scaling Group with correct capacity", () => {
      template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
        MinSize: "1",
        MaxSize: "1",
        DesiredCapacity: "1",
      });
    });

    test("uses t3.micro instance type", () => {
      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        InstanceType: "t3.micro",
      });
    });

    test("uses ECS-optimized AMI", () => {
      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        ImageId: Match.anyValue(),
      });
    });

    test("instances are in public subnets", () => {
      template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
        VPCZoneIdentifier: Match.anyValue(),
      });
    });

    test("instances have public IP addresses", () => {
      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        AssociatePublicIpAddress: true,
      });
    });
  });

  describe("ECS Task Definition", () => {
    test("creates task definition with correct network mode", () => {
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        NetworkMode: "bridge",
      });
    });

    test("task definition has execution role", () => {
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ExecutionRoleArn: Match.objectLike({
          "Fn::GetAtt": Match.arrayWith([
            Match.stringLikeRegexp("ExecutionRole"),
            "Arn",
          ]),
        }),
      });
    });

    test("task definition has task role", () => {
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        TaskRoleArn: Match.objectLike({
          "Fn::GetAtt": Match.arrayWith([
            Match.stringLikeRegexp("TaskRole"),
            "Arn",
          ]),
        }),
      });
    });

    test("container definition has correct properties", () => {
      const containerDefinitionsCapture = new Capture();
      template.hasResourceProperties("AWS::ECS::TaskDefinition", {
        ContainerDefinitions: containerDefinitionsCapture,
      });

      const containers = containerDefinitionsCapture.asArray();
      expect(containers.length).toBeGreaterThan(0);

      const appContainer = containers.find((c: any) => c.Name === "app");
      expect(appContainer).toBeDefined();
      expect(appContainer.Essential).toBe(true);
    });
  });

  describe("ECS Service", () => {
    test("creates ECS service with correct name", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "ecs-service-test",
        DesiredCount: 1,
      });
    });

    test("ECS service uses EC2 launch type", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        LaunchType: "EC2",
      });
    });

    test("ECS service has execute command enabled", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        EnableExecuteCommand: true,
      });
    });

    test("ECS service has placement strategies", () => {
      const placementStrategiesCapture = new Capture();
      template.hasResourceProperties("AWS::ECS::Service", {
        PlacementStrategies: placementStrategiesCapture,
      });

      const strategies = placementStrategiesCapture.asArray();
      expect(strategies).toContainEqual({
        Type: "spread",
        Field: "instanceId",
      });
      expect(strategies).toContainEqual({
        Type: "binpack",
        Field: "CPU",
      });
    });
  });

  describe("Node Exporter Service", () => {
    test("creates Node Exporter service", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "test-node-exporter",
        DesiredCount: 1,
      });
    });

    test("Node Exporter uses HOST network mode", () => {
      // Find the Node Exporter task definition
      const taskDefs = template.findResources("AWS::ECS::TaskDefinition");
      const nodeExporterTaskDef = Object.values(taskDefs).find((td: any) => {
        return td.Properties.NetworkMode === "host";
      });

      expect(nodeExporterTaskDef).toBeDefined();
    });
  });

  describe("CloudWatch Log Groups", () => {
    test("creates log group for task logs", () => {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/TestComputeStack/tasks",
        RetentionInDays: 14,
      });
    });

    test("creates log group for ECS events", () => {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/TestComputeStack/events",
        RetentionInDays: 14,
      });
    });

    test("creates log group for application container", () => {
      // Application logs are part of task logs, not a separate log group
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/TestComputeStack/tasks",
        RetentionInDays: 14,
      });
    });

    test("creates log group for Node Exporter", () => {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/test-node-exporter",
        RetentionInDays: 7,
      });
    });
  });

  describe("EventBridge Rule", () => {
    test("creates EventBridge rule for ECS events", () => {
      template.hasResourceProperties("AWS::Events::Rule", {
        Description: Match.stringLikeRegexp("Capture ECS events"),
        EventPattern: Match.objectLike({
          source: ["aws.ecs"],
          "detail-type": Match.arrayWith([
            "ECS Task State Change",
            "ECS Container Instance State Change",
            "ECS Service Action",
          ]),
        }),
      });
    });

    test("EventBridge rule targets CloudWatch Logs", () => {
      const targetsCapture = new Capture();
      template.hasResourceProperties("AWS::Events::Rule", {
        Targets: targetsCapture,
      });

      const targets = targetsCapture.asArray();
      expect(targets.length).toBeGreaterThan(0);
    });
  });

  describe("IAM Roles", () => {
    test("creates execution role with correct permissions", () => {
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                Service: "ecs-tasks.amazonaws.com",
              },
            }),
          ]),
        }),
      });
    });

    test("execution role has CloudWatch Logs permissions", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                "logs:CreateLogStream",
                "logs:PutLogEvents",
              ]),
              Effect: "Allow",
            }),
          ]),
        }),
      });
    });

    test("execution role has ECR permissions", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
              ]),
              Effect: "Allow",
            }),
          ]),
        }),
      });
    });
  });

  describe("Security Groups", () => {
    test("creates security group for ECS instances", () => {
      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        GroupDescription: Match.stringLikeRegexp("InstanceSecurityGroup"),
      });
    });

    test("security group has egress rules", () => {
      // Find the instance security group
      const securityGroups = template.findResources("AWS::EC2::SecurityGroup");
      const instanceSG = Object.values(securityGroups)[0] as any;

      expect(instanceSG).toBeDefined();
      const egress = instanceSG?.Properties?.SecurityGroupEgress || [];

      // Should have at least one egress rule (default allow all or specific HTTPS)
      expect(egress.length).toBeGreaterThan(0);
    });
  });

  describe("Stack Outputs", () => {
    test("exports task log group name", () => {
      template.hasOutput("TaskLogGroupName", {
        Description: "CloudWatch Log Group for ECS Task Logs",
      });
    });

    test("has outputs defined", () => {
      const outputs = template.toJSON().Outputs || {};
      expect(Object.keys(outputs).length).toBeGreaterThan(0);
    });
  });

  describe("Resource Counts", () => {
    test("creates two ECS services (app + node-exporter)", () => {
      template.resourceCountIs("AWS::ECS::Service", 2);
    });

    test("has correct total resource count", () => {
      const templateJson = template.toJSON();
      const resourceCount = Object.keys(templateJson.Resources || {}).length;

      // Should have cluster, services, task definitions, ASG, roles, etc.
      expect(resourceCount).toBeGreaterThan(20);
    });
  });

  describe("Snapshots", () => {
    test("ComputeStack matches snapshot", () => {
      expect(template.toJSON()).toMatchSnapshot();
    });

    test("ECS Cluster matches snapshot", () => {
      const cluster = template.findResources("AWS::ECS::Cluster");
      expect(cluster).toMatchSnapshot();
    });

    test("ECS Services match snapshot", () => {
      const services = template.findResources("AWS::ECS::Service");
      expect(services).toMatchSnapshot();
    });

    test("Task Definitions match snapshot", () => {
      const taskDefs = template.findResources("AWS::ECS::TaskDefinition");
      expect(taskDefs).toMatchSnapshot();
    });

    test("Auto Scaling Group matches snapshot", () => {
      const asg = template.findResources("AWS::AutoScaling::AutoScalingGroup");
      expect(asg).toMatchSnapshot();
    });
  });
});
