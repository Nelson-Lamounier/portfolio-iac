/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Template, Match } from "aws-cdk-lib/assertions";
import { SsmParametersConstruct } from "../../lib/constructs/config/ssm-parameters-construct";
import { StackOutputsConstruct } from "../../lib/constructs/config/stack-outputs-construct";

describe("SsmParametersConstruct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let vpc: ec2.IVpc;
  let repository: ecr.Repository;
  let cluster: ecs.ICluster;
  let service: ecs.IService;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
    });

    // Create VPC
    vpc = new ec2.Vpc(stack, "TestVpc", {
      maxAzs: 2,
      natGateways: 0,
    });

    // Create ECR Repository
    repository = new ecr.Repository(stack, "TestRepository", {
      repositoryName: "test-repo",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create ECS Cluster
    cluster = new ecs.Cluster(stack, "TestCluster", {
      vpc,
      clusterName: "test-cluster",
    });

    // Add EC2 capacity to cluster
    cluster.addCapacity("DefaultCapacity", {
      desiredCapacity: 1,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
    });

    // Create ECS Service
    const taskDefinition = new ecs.Ec2TaskDefinition(stack, "TestTaskDef", {
      networkMode: ecs.NetworkMode.BRIDGE,
    });

    taskDefinition.addContainer("TestContainer", {
      image: ecs.ContainerImage.fromRegistry("nginx"),
      memoryLimitMiB: 256,
    });

    service = new ecs.Ec2Service(stack, "TestService", {
      cluster,
      taskDefinition,
      serviceName: "test-service",
    });
  });

  describe("SSM Parameters Creation", () => {
    test("creates VPC ID parameter", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/vpc/dev/vpc-id",
        Type: "String",
      });
    });

    test("creates ECR repository URI parameter", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/ecr/dev/repository-uri",
        Type: "String",
      });
    });

    test("creates ECR repository ARN parameter", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/ecr/dev/repository-arn",
        Type: "String",
      });
    });

    test("creates ECR repository name parameter", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/ecr/dev/repository-name",
        Type: "String",
      });
    });

    test("creates ECS cluster name parameter", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/ecs/dev/cluster-name",
        Type: "String",
      });
    });

    test("creates ECS cluster ARN parameter", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/ecs/dev/cluster-arn",
        Type: "String",
      });
    });

    test("creates ECS service name parameter", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/ecs/dev/service-name",
        Type: "String",
      });
    });

    test("creates all 7 SSM parameters", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::SSM::Parameter", 7);
    });

    test("parameters use STANDARD tier", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::SSM::Parameter");

      Object.values(resources).forEach((resource: any) => {
        expect(resource.Properties.Tier).toBe("Standard");
      });
    });

    test("parameters have descriptions", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::SSM::Parameter");

      Object.values(resources).forEach((resource: any) => {
        expect(resource.Properties.Description).toBeDefined();
        expect(resource.Properties.Description.length).toBeGreaterThan(0);
      });
    });

    test("parameters include environment name in description", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "production",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::SSM::Parameter");

      const descriptions = Object.values(resources)
        .map((r: any) => r.Properties.Description)
        .join(" ");

      expect(descriptions).toContain("production");
    });
  });

  describe("SSM Parameters with Different Environments", () => {
    test("creates parameters with dev environment prefix", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::SSM::Parameter");
      const names = Object.values(resources)
        .map((r: any) => r.Properties.Name)
        .join(",");

      expect(names).toContain("/vpc/dev/");
      expect(names).toContain("/ecr/dev/");
      expect(names).toContain("/ecs/dev/");
    });

    test("creates parameters with prod environment prefix", () => {
      new SsmParametersConstruct(stack, "TestParams", {
        envName: "prod",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::SSM::Parameter");
      const names = Object.values(resources)
        .map((r: any) => r.Properties.Name)
        .join(",");

      expect(names).toContain("/vpc/prod/");
      expect(names).toContain("/ecr/prod/");
      expect(names).toContain("/ecs/prod/");
    });
  });
});

describe("StackOutputsConstruct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let vpc: ec2.IVpc;
  let repository: ecr.Repository;
  let cluster: ecs.ICluster;
  let service: ecs.IService;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
    });

    // Create VPC
    vpc = new ec2.Vpc(stack, "TestVpc", {
      maxAzs: 2,
      natGateways: 0,
    });

    // Create ECR Repository
    repository = new ecr.Repository(stack, "TestRepository", {
      repositoryName: "test-repo",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create ECS Cluster
    cluster = new ecs.Cluster(stack, "TestCluster", {
      vpc,
      clusterName: "test-cluster",
    });

    // Add EC2 capacity to cluster
    cluster.addCapacity("DefaultCapacity", {
      desiredCapacity: 1,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
    });

    // Create ECS Service
    const taskDefinition = new ecs.Ec2TaskDefinition(stack, "TestTaskDef", {
      networkMode: ecs.NetworkMode.BRIDGE,
    });

    taskDefinition.addContainer("TestContainer", {
      image: ecs.ContainerImage.fromRegistry("nginx"),
      memoryLimitMiB: 256,
    });

    service = new ecs.Ec2Service(stack, "TestService", {
      cluster,
      taskDefinition,
      serviceName: "test-service",
    });
  });

  describe("Stack Outputs Creation", () => {
    test("creates VPC ID output", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(Object.keys(outputs).some((key) => key.includes("VpcId"))).toBe(
        true
      );
    });

    test("creates VPC CIDR output", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(Object.keys(outputs).some((key) => key.includes("VpcCidr"))).toBe(
        true
      );
    });

    test("creates ECR repository URI output", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(
        Object.keys(outputs).some((key) => key.includes("RepositoryUri"))
      ).toBe(true);
    });

    test("creates ECR repository ARN output", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(
        Object.keys(outputs).some((key) => key.includes("RepositoryArn"))
      ).toBe(true);
    });

    test("creates ECR repository name output", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(
        Object.keys(outputs).some((key) => key.includes("RepositoryName"))
      ).toBe(true);
    });

    test("creates ECS cluster name output", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(
        Object.keys(outputs).some((key) => key.includes("EcsClusterName"))
      ).toBe(true);
    });

    test("creates ECS cluster ARN output", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(
        Object.keys(outputs).some((key) => key.includes("EcsClusterArn"))
      ).toBe(true);
    });

    test("creates ECS service name output", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(
        Object.keys(outputs).some((key) => key.includes("EcsServiceName"))
      ).toBe(true);
    });

    test("creates all 8 outputs", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(Object.keys(outputs).length).toBe(8);
    });

    test("outputs have export names", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      Object.values(outputs).forEach((output: any) => {
        expect(output.Export).toBeDefined();
        expect(output.Export.Name).toBeDefined();
      });
    });

    test("export names include environment prefix", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      const exportNames = Object.values(outputs)
        .map((output: any) => output.Export?.Name)
        .join(",");

      expect(exportNames).toContain("dev-");
    });

    test("outputs have descriptions", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      Object.values(outputs).forEach((output: any) => {
        expect(output.Description).toBeDefined();
        expect(output.Description.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Stack Outputs with Different Environments", () => {
    test("creates outputs with dev environment prefix", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "dev",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      const exportNames = Object.values(outputs)
        .map((output: any) => output.Export?.Name)
        .join(",");

      expect(exportNames).toContain("dev-");
    });

    test("creates outputs with prod environment prefix", () => {
      new StackOutputsConstruct(stack, "TestOutputs", {
        envName: "prod",
        vpc,
        repository,
        cluster,
        service,
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      const exportNames = Object.values(outputs)
        .map((output: any) => output.Export?.Name)
        .join(",");

      expect(exportNames).toContain("prod-");
    });
  });
});
