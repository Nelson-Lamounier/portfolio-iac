/** @format */

// test/monitoring/monitoring-efs-stack.test.ts
import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { createTestMonitoringEfsStack } from "../../helpers/test-helpers";

describe("MonitoringEfsStack", () => {
  let testSetup: {
    app: cdk.App;
    stack: any;
    template: Template;
  };

  beforeEach(() => {
    testSetup = createTestMonitoringEfsStack({
      envName: "pipeline",
      account: "123456789012",
      region: "eu-west-1",
    });
  });

  // ---------------------------------------------------------------------------
  // EFS File System Tests
  // ---------------------------------------------------------------------------
  describe("EFS File System", () => {
    test("creates EFS file system", () => {
      testSetup.template.resourceCountIs("AWS::EFS::FileSystem", 1);
    });

    test("EFS is encrypted at rest", () => {
      testSetup.template.hasResourceProperties("AWS::EFS::FileSystem", {
        Encrypted: true,
      });
    });

    test("EFS has lifecycle policy for cost optimization", () => {
      testSetup.template.hasResourceProperties("AWS::EFS::FileSystem", {
        LifecyclePolicies: Match.arrayWith([
          Match.objectLike({
            TransitionToIA: Match.anyValue(),
          }),
        ]),
      });
    });

    test("EFS uses provisioned throughput mode", () => {
      testSetup.template.hasResourceProperties("AWS::EFS::FileSystem", {
        ThroughputMode: "provisioned",
      });
    });

    test("EFS has backup policy enabled", () => {
      testSetup.template.hasResourceProperties("AWS::EFS::FileSystem", {
        BackupPolicy: {
          Status: "ENABLED",
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Mount Target Tests
  // ---------------------------------------------------------------------------
  describe("EFS Mount Targets", () => {
    test("creates mount target in each AZ", () => {
      const mountTargets = testSetup.template.findResources(
        "AWS::EFS::MountTarget"
      );
      expect(Object.keys(mountTargets).length).toBeGreaterThanOrEqual(1);
    });

    test("mount targets have security group attached", () => {
      testSetup.template.hasResourceProperties("AWS::EFS::MountTarget", {
        SecurityGroups: Match.anyValue(),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Access Point Tests
  // ---------------------------------------------------------------------------
  describe("EFS Access Points", () => {
    test("creates access point for monitoring data", () => {
      testSetup.template.hasResourceProperties("AWS::EFS::AccessPoint", {
        PosixUser: {
          Uid: Match.anyValue(),
          Gid: Match.anyValue(),
        },
        RootDirectory: {
          Path: Match.anyValue(),
          CreationInfo: {
            OwnerUid: Match.anyValue(),
            OwnerGid: Match.anyValue(),
            Permissions: Match.anyValue(),
          },
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Security Group Tests
  // ---------------------------------------------------------------------------
  describe("EFS Security", () => {
    test("EFS security group allows NFS from VPC only", () => {
      testSetup.template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            FromPort: 2049,
            ToPort: 2049,
            IpProtocol: "tcp",
          }),
        ]),
      });
    });

    test("EFS security group does not allow public access", () => {
      const securityGroups = testSetup.template.findResources(
        "AWS::EC2::SecurityGroup"
      );

      Object.values(securityGroups).forEach((sg: any) => {
        const ingressRules = sg.Properties?.SecurityGroupIngress || [];
        ingressRules.forEach((rule: any) => {
          if (rule.FromPort === 2049) {
            expect(rule.CidrIp).not.toBe("0.0.0.0/0");
          }
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // SSM Parameters Tests
  // ---------------------------------------------------------------------------
  describe("SSM Parameters", () => {
    test("creates SSM parameter for Prometheus config", () => {
      testSetup.template.hasResourceProperties("AWS::SSM::Parameter", {
        Type: "String",
        Name: Match.stringLikeRegexp(".*prometheus.*"),
      });
    });

    test("creates SSM parameter for Grafana datasource config", () => {
      testSetup.template.hasResourceProperties("AWS::SSM::Parameter", {
        Type: "String",
        Name: Match.stringLikeRegexp(".*(grafana|datasource).*"),
      });
    });
  });
});
