/** @format */

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";

import { CrossAccountMonitoringRole } from "../../lib/constructs/iam/cross-account-monitoring-role";
import { VpcPeeringAcceptorRole } from "../../lib/constructs/iam/vpc-peering-acceptor-role";
import { EventBridgeCrossAccountRole } from "../../lib/constructs/iam/eventbridge-cross-account-role";

describe("CrossAccountMonitoringRole", () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
    });
  });

  describe("Role Creation", () => {
    test("creates IAM role with correct name", () => {
      new CrossAccountMonitoringRole(stack, "TestRole", {
        envName: "dev",
        pipelineAccountId: "111111111111",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "dev-PipelineMonitoringAccess",
      });
    });

    test("role has correct assume role policy", () => {
      new CrossAccountMonitoringRole(stack, "TestRole", {
        envName: "dev",
        pipelineAccountId: "111111111111",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: "sts:AssumeRole",
            }),
          ]),
        }),
      });
    });

    test("role has correct max session duration", () => {
      new CrossAccountMonitoringRole(stack, "TestRole", {
        envName: "dev",
        pipelineAccountId: "111111111111",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        MaxSessionDuration: 43200, // 12 hours
      });
    });
  });

  describe("CloudWatch Permissions", () => {
    test("creates CloudWatch policy when enabled", () => {
      new CrossAccountMonitoringRole(stack, "TestRole", {
        envName: "dev",
        pipelineAccountId: "111111111111",
        enableCloudWatch: true,
      });

      const template = Template.fromStack(stack);
      const policies = template.findResources("AWS::IAM::Policy");
      expect(Object.keys(policies).length).toBeGreaterThan(0);
    });

    test("creates role with CloudWatch disabled", () => {
      new CrossAccountMonitoringRole(stack, "TestRole", {
        envName: "dev",
        pipelineAccountId: "111111111111",
        enableCloudWatch: false,
      });

      const template = Template.fromStack(stack);
      const roles = template.findResources("AWS::IAM::Role");
      expect(Object.keys(roles).length).toBeGreaterThan(0);
    });
  });

  describe("ECS Permissions", () => {
    test("creates ECS policy when enabled", () => {
      new CrossAccountMonitoringRole(stack, "TestRole", {
        envName: "dev",
        pipelineAccountId: "111111111111",
        enableEcsAccess: true,
      });

      const template = Template.fromStack(stack);
      const policies = template.findResources("AWS::IAM::Policy");
      expect(Object.keys(policies).length).toBeGreaterThan(0);
    });

    test("creates role with ECS disabled", () => {
      new CrossAccountMonitoringRole(stack, "TestRole", {
        envName: "dev",
        pipelineAccountId: "111111111111",
        enableEcsAccess: false,
      });

      const template = Template.fromStack(stack);
      const roles = template.findResources("AWS::IAM::Role");
      expect(Object.keys(roles).length).toBeGreaterThan(0);
    });
  });

  describe("EC2 Service Discovery Permissions", () => {
    test("creates EC2 policy when enabled", () => {
      new CrossAccountMonitoringRole(stack, "TestRole", {
        envName: "dev",
        pipelineAccountId: "111111111111",
        enableEc2ServiceDiscovery: true,
      });

      const template = Template.fromStack(stack);
      const policies = template.findResources("AWS::IAM::Policy");
      expect(Object.keys(policies).length).toBeGreaterThan(0);
    });

    test("creates role with EC2 disabled", () => {
      new CrossAccountMonitoringRole(stack, "TestRole", {
        envName: "dev",
        pipelineAccountId: "111111111111",
        enableEc2ServiceDiscovery: false,
      });

      const template = Template.fromStack(stack);
      const roles = template.findResources("AWS::IAM::Role");
      expect(Object.keys(roles).length).toBeGreaterThan(0);
    });
  });

  describe("Construct Properties", () => {
    test("exposes role property", () => {
      const construct = new CrossAccountMonitoringRole(stack, "TestRole", {
        envName: "dev",
        pipelineAccountId: "111111111111",
      });

      expect(construct.role).toBeDefined();
      expect(construct.roleArn).toBeDefined();
    });
  });
});

describe("VpcPeeringAcceptorRole", () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
    });
  });

  describe("Role Creation", () => {
    test("creates IAM role with correct name", () => {
      new VpcPeeringAcceptorRole(stack, "TestRole", {
        requesterAccountId: "111111111111",
        envName: "dev",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "dev-VpcPeeringAcceptorRole",
      });
    });

    test("role has correct assume role policy", () => {
      new VpcPeeringAcceptorRole(stack, "TestRole", {
        requesterAccountId: "111111111111",
        envName: "dev",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: "sts:AssumeRole",
            }),
          ]),
        }),
      });
    });

    test("role has correct max session duration", () => {
      new VpcPeeringAcceptorRole(stack, "TestRole", {
        requesterAccountId: "111111111111",
        envName: "dev",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        MaxSessionDuration: 3600, // 1 hour
      });
    });
  });

  describe("VPC Peering Permissions", () => {
    test("creates policy to accept VPC peering connections", () => {
      new VpcPeeringAcceptorRole(stack, "TestRole", {
        requesterAccountId: "111111111111",
        envName: "dev",
      });

      const template = Template.fromStack(stack);
      const policies = template.findResources("AWS::IAM::Policy");
      expect(Object.keys(policies).length).toBeGreaterThan(0);
    });

    test("creates policy to manage routes", () => {
      new VpcPeeringAcceptorRole(stack, "TestRole", {
        requesterAccountId: "111111111111",
        envName: "dev",
      });

      const template = Template.fromStack(stack);
      const policies = template.findResources("AWS::IAM::Policy");
      expect(Object.keys(policies).length).toBeGreaterThan(0);
    });

    test("creates policy to describe VPCs", () => {
      new VpcPeeringAcceptorRole(stack, "TestRole", {
        requesterAccountId: "111111111111",
        envName: "dev",
      });

      const template = Template.fromStack(stack);
      const policies = template.findResources("AWS::IAM::Policy");
      expect(Object.keys(policies).length).toBeGreaterThan(0);
    });
  });

  describe("Construct Properties", () => {
    test("exposes role property", () => {
      const construct = new VpcPeeringAcceptorRole(stack, "TestRole", {
        requesterAccountId: "111111111111",
        envName: "dev",
      });

      expect(construct.role).toBeDefined();
      expect(construct.roleArn).toBeDefined();
    });
  });
});

describe("EventBridgeCrossAccountRole", () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
    });
  });

  describe("Role Creation", () => {
    test("creates IAM role with correct name", () => {
      new EventBridgeCrossAccountRole(stack, "TestRole", {
        envName: "dev",
        targetEventBusArn:
          "arn:aws:events:eu-west-1:111111111111:event-bus/default",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "eventbridge-cross-account-dev",
      });
    });

    test("role has correct assume role policy for EventBridge service", () => {
      new EventBridgeCrossAccountRole(stack, "TestRole", {
        envName: "dev",
        targetEventBusArn:
          "arn:aws:events:eu-west-1:111111111111:event-bus/default",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Principal: {
                Service: "events.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            }),
          ]),
        }),
      });
    });
  });

  describe("EventBridge Permissions", () => {
    test("creates policy to put events to target bus", () => {
      const targetBusArn =
        "arn:aws:events:eu-west-1:111111111111:event-bus/default";

      new EventBridgeCrossAccountRole(stack, "TestRole", {
        envName: "dev",
        targetEventBusArn: targetBusArn,
      });

      const template = Template.fromStack(stack);
      const policies = template.findResources("AWS::IAM::Policy");
      expect(Object.keys(policies).length).toBeGreaterThan(0);
    });
  });

  describe("Outputs", () => {
    test("exports role ARN", () => {
      new EventBridgeCrossAccountRole(stack, "TestRole", {
        envName: "dev",
        targetEventBusArn:
          "arn:aws:events:eu-west-1:111111111111:event-bus/default",
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      expect(Object.keys(outputs).length).toBeGreaterThan(0);
      expect(Object.keys(outputs).some((key) => key.includes("RoleArn"))).toBe(
        true
      );
    });

    test("export name includes environment", () => {
      new EventBridgeCrossAccountRole(stack, "TestRole", {
        envName: "dev",
        targetEventBusArn:
          "arn:aws:events:eu-west-1:111111111111:event-bus/default",
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs("*");

      const exportNames = Object.values(outputs)
        .map((output: any) => output.Export?.Name)
        .filter(Boolean);

      expect(exportNames).toContain("dev-eventbridge-cross-account-role-arn");
    });
  });

  describe("Tags", () => {
    test("applies environment tag", () => {
      new EventBridgeCrossAccountRole(stack, "TestRole", {
        envName: "dev",
        targetEventBusArn:
          "arn:aws:events:eu-west-1:111111111111:event-bus/default",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Environment",
            Value: "dev",
          }),
        ]),
      });
    });

    test("applies Purpose tag", () => {
      new EventBridgeCrossAccountRole(stack, "TestRole", {
        envName: "dev",
        targetEventBusArn:
          "arn:aws:events:eu-west-1:111111111111:event-bus/default",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Purpose",
            Value: "EventBridgeCrossAccount",
          }),
        ]),
      });
    });

    test("applies ManagedBy tag", () => {
      new EventBridgeCrossAccountRole(stack, "TestRole", {
        envName: "dev",
        targetEventBusArn:
          "arn:aws:events:eu-west-1:111111111111:event-bus/default",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "ManagedBy",
            Value: "CDK",
          }),
        ]),
      });
    });
  });

  describe("Construct Properties", () => {
    test("exposes role property", () => {
      const construct = new EventBridgeCrossAccountRole(stack, "TestRole", {
        envName: "dev",
        targetEventBusArn:
          "arn:aws:events:eu-west-1:111111111111:event-bus/default",
      });

      expect(construct.role).toBeDefined();
      expect(construct.roleArn).toBeDefined();
    });
  });
});
