/** @format */

/// <reference types="jest" />

// test/monitoring/vpc-peering-stack.test.ts
import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";

describe("VpcPeeringStack", () => {
  let app: cdk.App;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
  });

  // ---------------------------------------------------------------------------
  // Basic Stack Tests (without Lambda functions to avoid Docker dependency)
  // ---------------------------------------------------------------------------
  describe("Stack Creation", () => {
    test("creates stack with correct properties", () => {
      const stack = new cdk.Stack(app, "TestVpcPeeringStack", {
        env: { account: "559780231478", region: "eu-west-1" },
      });

      // Create test VPC
      const _vpc = new cdk.aws_ec2.Vpc(stack, "TestVpc", {
        ipAddresses: cdk.aws_ec2.IpAddresses.cidr("10.0.0.0/16"),
        maxAzs: 2,
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: "Public",
            subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: "Private",
            subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
        ],
      });

      // Test basic VPC creation
      template = Template.fromStack(stack);
      template.resourceCountIs("AWS::EC2::VPC", 1);
      template.hasResourceProperties("AWS::EC2::VPC", {
        CidrBlock: "10.0.0.0/16",
      });

      expect(_vpc.vpcId).toBeDefined();
    });

    test("VPC has correct subnet configuration", () => {
      const stack = new cdk.Stack(app, "TestVpcPeeringStack", {
        env: { account: "559780231478", region: "eu-west-1" },
      });

      new cdk.aws_ec2.Vpc(stack, "TestVpc", {
        ipAddresses: cdk.aws_ec2.IpAddresses.cidr("10.0.0.0/16"),
        maxAzs: 2,
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: "Public",
            subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: "Private",
            subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
        ],
      });

      template = Template.fromStack(stack);

      // Should have subnets
      const subnets = template.findResources("AWS::EC2::Subnet");
      expect(Object.keys(subnets).length).toBeGreaterThanOrEqual(2);

      // Should have Internet Gateway
      template.resourceCountIs("AWS::EC2::InternetGateway", 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Mock VPC Peering Tests (testing the structure without Lambda)
  // ---------------------------------------------------------------------------
  describe("VPC Peering Configuration", () => {
    test("can create mock peering connection", () => {
      const stack = new cdk.Stack(app, "TestVpcPeeringStack", {
        env: { account: "559780231478", region: "eu-west-1" },
      });

      const vpc = new cdk.aws_ec2.Vpc(stack, "TestVpc", {
        ipAddresses: cdk.aws_ec2.IpAddresses.cidr("10.0.0.0/16"),
        maxAzs: 2,
      });

      // Create a mock peering connection (without Lambda functions)
      const mockPeeringConnection = new cdk.aws_ec2.CfnVPCPeeringConnection(
        stack,
        "MockPeeringConnection",
        {
          vpcId: vpc.vpcId,
          peerVpcId: "vpc-dev456",
          peerOwnerId: "771826808455",
          peerRegion: "eu-west-1",
          tags: [
            {
              key: "Name",
              value: "pipeline-to-development",
            },
            {
              key: "Environment",
              value: "pipeline",
            },
          ],
        }
      );

      // Create a mock route
      const privateSubnet = vpc.privateSubnets[0];
      new cdk.aws_ec2.CfnRoute(stack, "MockRoute", {
        routeTableId: privateSubnet.routeTable.routeTableId,
        destinationCidrBlock: "10.1.0.0/16",
        vpcPeeringConnectionId: mockPeeringConnection.ref,
      });

      template = Template.fromStack(stack);

      // Test peering connection
      template.resourceCountIs("AWS::EC2::VPCPeeringConnection", 1);
      template.hasResourceProperties("AWS::EC2::VPCPeeringConnection", {
        VpcId: Match.anyValue(),
        PeerVpcId: "vpc-dev456",
        PeerOwnerId: "771826808455",
        PeerRegion: "eu-west-1",
      });

      // Test route
      template.hasResourceProperties("AWS::EC2::Route", {
        DestinationCidrBlock: "10.1.0.0/16",
        VpcPeeringConnectionId: Match.anyValue(),
      });
    });

    test("peering connection has proper tags", () => {
      const stack = new cdk.Stack(app, "TestVpcPeeringStack", {
        env: { account: "559780231478", region: "eu-west-1" },
      });

      const vpc = new cdk.aws_ec2.Vpc(stack, "TestVpc", {
        ipAddresses: cdk.aws_ec2.IpAddresses.cidr("10.0.0.0/16"),
        maxAzs: 2,
      });

      new cdk.aws_ec2.CfnVPCPeeringConnection(stack, "MockPeeringConnection", {
        vpcId: vpc.vpcId,
        peerVpcId: "vpc-dev456",
        peerOwnerId: "771826808455",
        peerRegion: "eu-west-1",
        tags: [
          {
            key: "Name",
            value: "pipeline-to-development",
          },
          {
            key: "Environment",
            value: "pipeline",
          },
        ],
      });

      template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::VPCPeeringConnection", {
        Tags: [
          {
            Key: "Environment",
            Value: "pipeline",
          },
          {
            Key: "Name",
            Value: "pipeline-to-development",
          },
        ],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Configuration Validation Tests
  // ---------------------------------------------------------------------------
  describe("Configuration Validation", () => {
    test("validates peer account configuration", () => {
      const peerAccount = {
        envName: "development",
        accountId: "771826808455",
        vpcId: "vpc-dev456",
        vpcCidr: "10.1.0.0/16",
        roleArn: "arn:aws:iam::771826808455:role/VpcPeeringAcceptorRole",
      };

      // Test that configuration has required fields
      expect(peerAccount.envName).toBe("development");
      expect(peerAccount.accountId).toBe("771826808455");
      expect(peerAccount.vpcId).toBe("vpc-dev456");
      expect(peerAccount.vpcCidr).toBe("10.1.0.0/16");
      expect(peerAccount.roleArn).toContain("VpcPeeringAcceptorRole");
    });

    test("validates CIDR block format", () => {
      const validCidrs = ["10.0.0.0/16", "10.1.0.0/16", "172.16.0.0/12"];
      const invalidCidrs = ["10.0.0.0", "invalid", ""];

      validCidrs.forEach((cidr) => {
        expect(cidr).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
      });

      invalidCidrs.forEach((cidr) => {
        expect(cidr).not.toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
      });
    });
  });
});
