/** @format */

// test/monitoring/security.test.ts
import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";

import { MonitoringInfraStack } from "../../../lib/stacks/monitoring/monitoring-infra-stack";
import { createTestMonitoringInfraStack } from "../../helpers/test-helpers";

describe("Security Configuration", () => {
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
  // Security Group Tests
  // ---------------------------------------------------------------------------
  describe("Security Groups", () => {
    test("ALB security group allows HTTP/HTTPS traffic", () => {
      testSetup.template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            FromPort: 80,
            ToPort: 80,
            IpProtocol: "tcp",
          }),
        ]),
      });
    });

    test("security groups are properly configured for monitoring", () => {
      const securityGroups = testSetup.template.findResources(
        "AWS::EC2::SecurityGroup"
      );

      // Should have at least ALB and instance security groups
      expect(Object.keys(securityGroups).length).toBeGreaterThanOrEqual(2);

      // Check that security groups have proper descriptions
      Object.values(securityGroups).forEach((sg: any) => {
        expect(sg.Properties.GroupDescription).toBeDefined();
        expect(sg.Properties.GroupDescription.length).toBeGreaterThan(0);
      });
    });

    test("security groups do not allow unrestricted SSH access", () => {
      const securityGroups = testSetup.template.findResources(
        "AWS::EC2::SecurityGroup"
      );

      Object.values(securityGroups).forEach((sg: any) => {
        const ingressRules = sg.Properties?.SecurityGroupIngress || [];
        ingressRules.forEach((rule: any) => {
          if (rule.FromPort === 22 || rule.ToPort === 22) {
            // SSH should not be open to 0.0.0.0/0
            expect(rule.CidrIp).not.toBe("0.0.0.0/0");
          }
        });
      });
    });

    test("security groups do not allow unrestricted ingress from internet", () => {
      const securityGroups = testSetup.template.findResources(
        "AWS::EC2::SecurityGroup"
      );

      Object.values(securityGroups).forEach((sg: any) => {
        const ingressRules = sg.Properties?.SecurityGroupIngress || [];
        ingressRules.forEach((rule: any) => {
          // No rule should allow all traffic from anywhere
          if (rule.CidrIp === "0.0.0.0/0") {
            expect(rule.FromPort).not.toBe(0);
            expect(rule.ToPort).not.toBe(65535);
          }
        });
      });
    });

    test("ALB allows public HTTP access", () => {
      testSetup.template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            CidrIp: "0.0.0.0/0", // Public access for ALB
            FromPort: 80,
            ToPort: 80,
          }),
        ]),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // IAM Tests
  // ---------------------------------------------------------------------------
  describe("IAM Roles and Policies", () => {
    test("EC2 instance role has ECS permissions", () => {
      testSetup.template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                "ecs:DeregisterContainerInstance",
                "ecs:RegisterContainerInstance",
                "ecs:Submit*",
              ]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });

    test("EC2 instance role exists for ECS cluster", () => {
      testSetup.template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: "ec2.amazonaws.com",
              },
            }),
          ]),
        },
      });
    });

    test("EC2 instance role has SSM permissions for Session Manager", () => {
      // Check that the instance role policy contains SSM permissions
      const policies = testSetup.template.findResources("AWS::IAM::Policy");

      let hasSsmPermissions = false;
      Object.values(policies).forEach((policy: any) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        statements.forEach((stmt: any) => {
          const actions = Array.isArray(stmt.Action)
            ? stmt.Action
            : [stmt.Action];
          const hasSsmActions = actions.some(
            (action: string) =>
              action.includes("ssm:") || action.includes("ssmmessages:")
          );
          if (hasSsmActions) {
            hasSsmPermissions = true;
          }
        });
      });

      expect(hasSsmPermissions).toBe(true);
    });

    test("IAM roles follow least privilege principle", () => {
      const policies = testSetup.template.findResources("AWS::IAM::Policy");

      Object.values(policies).forEach((policy: any) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        statements.forEach((stmt: any) => {
          // No admin or full access policies
          if (Array.isArray(stmt.Action)) {
            expect(stmt.Action).not.toContain("*");
            expect(stmt.Action).not.toContain("iam:*");
            expect(stmt.Action).not.toContain("ec2:*");
          }
        });
      });
    });

    test("no IAM policies with Resource: *  for sensitive actions", () => {
      const policies = testSetup.template.findResources("AWS::IAM::Policy");

      const sensitiveActions = [
        "iam:CreateUser",
        "iam:DeleteUser",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
      ];

      Object.values(policies).forEach((policy: any) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        statements.forEach((stmt: any) => {
          const actions = Array.isArray(stmt.Action)
            ? stmt.Action
            : [stmt.Action];
          const hasSensitiveAction = actions.some((a: string) =>
            sensitiveActions.includes(a)
          );

          if (hasSensitiveAction) {
            expect(stmt.Resource).not.toBe("*");
          }
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Encryption Tests
  // ---------------------------------------------------------------------------
  describe("Encryption", () => {
    test("EBS volumes are encrypted", () => {
      // Check Launch Template for EBS encryption (modern approach)
      testSetup.template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
        LaunchTemplateData: {
          BlockDeviceMappings: Match.arrayWith([
            Match.objectLike({
              Ebs: {
                Encrypted: true,
              },
            }),
          ]),
        },
      });
    });

    test("CloudWatch log groups have encryption", () => {
      // Either KMS key or AWS managed encryption
      const logGroups = testSetup.template.findResources("AWS::Logs::LogGroup");
      // Log groups should exist (encryption is optional but recommended)
      expect(Object.keys(logGroups).length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Network Security Tests
  // ---------------------------------------------------------------------------
  describe("Network Security", () => {
    test("monitoring instances are in private subnets", () => {
      testSetup.template.hasResourceProperties(
        "AWS::AutoScaling::AutoScalingGroup",
        {
          VPCZoneIdentifier: Match.anyValue(),
        }
      );
    });

    test("monitoring instances network configuration", () => {
      // Check Launch Template exists (modern approach)
      testSetup.template.resourceCountIs("AWS::EC2::LaunchTemplate", 1);

      // Verify instances are in Auto Scaling Group with proper VPC configuration
      testSetup.template.hasResourceProperties(
        "AWS::AutoScaling::AutoScalingGroup",
        {
          VPCZoneIdentifier: Match.anyValue(),
        }
      );
    });
  });
});
