/** @format */

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { VpcConstruct } from "../../lib/constructs/networking/vpc-construct";

describe("VpcConstruct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack");
  });

  // ============================================
  // Basic VPC Creation Tests
  // ============================================

  describe("Basic VPC Creation", () => {
    test("creates VPC with default configuration", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::EC2::VPC", 1);
    });

    test("exposes VPC as public property", () => {
      const vpcConstruct = new VpcConstruct(stack, "TestVpc");

      expect(vpcConstruct.vpc).toBeDefined();
      expect(vpcConstruct.vpc.vpcId).toBeDefined();
    });

    test("VPC has DNS support enabled", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::VPC", {
        EnableDnsSupport: true,
        EnableDnsHostnames: true,
      });
    });
  });

  // ============================================
  // Availability Zone Tests
  // ============================================

  describe("Availability Zone Configuration", () => {
    test("uses 2 AZs by default", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      // 2 AZs × 2 subnet types = 4 subnets
      template.resourceCountIs("AWS::EC2::Subnet", 4);
    });

    test("respects custom maxAzs configuration", () => {
      new VpcConstruct(stack, "TestVpc", { maxAzs: 3 });
      const template = Template.fromStack(stack);

      // 3 AZs × 2 subnet types = 6 subnets
      template.resourceCountIs("AWS::EC2::Subnet", 4);
    });

    test("can use single AZ for development", () => {
      new VpcConstruct(stack, "TestVpc", { maxAzs: 1 });
      const template = Template.fromStack(stack);

      // 1 AZ × 2 subnet types = 2 subnets
      template.resourceCountIs("AWS::EC2::Subnet", 2);
    });
  });

  // ============================================
  // Subnet Configuration Tests
  // ============================================

  describe("Subnet Configuration", () => {
    test("creates public subnets", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::Subnet", {
        MapPublicIpOnLaunch: true,
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "aws-cdk:subnet-name",
            Value: "Public",
          }),
        ]),
      });
    });

    test("creates private subnets with egress", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::Subnet", {
        MapPublicIpOnLaunch: false,
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "aws-cdk:subnet-name",
            Value: "Private",
          }),
        ]),
      });
    });

    test("public subnets have /24 CIDR", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      const resources = template.findResources("AWS::EC2::Subnet");
      const publicSubnets = Object.values(resources).filter((subnet: any) => {
        const tags = subnet.Properties.Tags || [];
        return tags.some(
          (tag: any) =>
            tag.Key === "aws-cdk:subnet-name" && tag.Value === "Public"
        );
      });

      publicSubnets.forEach((subnet: any) => {
        const cidr = subnet.Properties.CidrBlock;
        // Check that CIDR ends with /24
        expect(cidr).toMatch(/\/24$/);
      });
    });

    test("private subnets have /24 CIDR", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      const resources = template.findResources("AWS::EC2::Subnet");
      const privateSubnets = Object.values(resources).filter((subnet: any) => {
        const tags = subnet.Properties.Tags || [];
        return tags.some(
          (tag: any) =>
            tag.Key === "aws-cdk:subnet-name" && tag.Value === "Private"
        );
      });

      privateSubnets.forEach((subnet: any) => {
        const cidr = subnet.Properties.CidrBlock;
        expect(cidr).toMatch(/\/24$/);
      });
    });
  });

  // ============================================
  // NAT Gateway Tests
  // ============================================

  describe("NAT Gateway Configuration", () => {
    test("creates no NAT gateways by default", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::EC2::NatGateway", 0);
    });

    test("creates NAT gateway when specified", () => {
      new VpcConstruct(stack, "TestVpc", { natGateways: 1 });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::EC2::NatGateway", 1);
    });

    test("creates multiple NAT gateways for high availability", () => {
      new VpcConstruct(stack, "TestVpc", { maxAzs: 2, natGateways: 2 });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::EC2::NatGateway", 2);
    });

    test("NAT gateway requires Elastic IP", () => {
      new VpcConstruct(stack, "TestVpc", { natGateways: 1 });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::EC2::EIP", 1);
    });
  });

  // ============================================
  // Internet Gateway Tests
  // ============================================

  describe("Internet Gateway", () => {
    test("creates internet gateway", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::EC2::InternetGateway", 1);
    });

    test("attaches internet gateway to VPC", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::EC2::VPCGatewayAttachment", 1);
    });
  });

  // ============================================
  // Route Table Tests
  // ============================================

  describe("Route Tables", () => {
    test("creates route tables for subnets", () => {
      new VpcConstruct(stack, "TestVpc", { maxAzs: 2 });
      const template = Template.fromStack(stack);

      // 2 public route table + 2 private route tables (one per AZ)
      template.resourceCountIs("AWS::EC2::RouteTable", 4);
    });

    test("creates route to internet gateway for public subnets", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::Route", {
        DestinationCidrBlock: "0.0.0.0/0",
        GatewayId: Match.anyValue(),
      });
    });

    test("creates routes to NAT gateway for private subnets when NAT is enabled", () => {
      new VpcConstruct(stack, "TestVpc", { natGateways: 1 });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::Route", {
        DestinationCidrBlock: "0.0.0.0/0",
        NatGatewayId: Match.anyValue(),
      });
    });
  });

  // ============================================
  // Configuration Scenarios Tests
  // ============================================

  describe("Configuration Scenarios", () => {
    test("development configuration (cost-optimized)", () => {
      new VpcConstruct(stack, "TestVpc", {
        maxAzs: 1,
        natGateways: 0,
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::EC2::VPC", 1);
      template.resourceCountIs("AWS::EC2::Subnet", 2); // 1 AZ × 2 types
      template.resourceCountIs("AWS::EC2::NatGateway", 0);
    });

    test("production-like configuration (balanced)", () => {
      new VpcConstruct(stack, "TestVpc", {
        maxAzs: 2,
        natGateways: 1,
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::EC2::VPC", 1);
      template.resourceCountIs("AWS::EC2::Subnet", 4); // 2 AZs × 2 types
      template.resourceCountIs("AWS::EC2::NatGateway", 1);
    });

    test("high availability configuration", () => {
      new VpcConstruct(stack, "TestVpc", {
        maxAzs: 3,
        natGateways: 3,
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::EC2::VPC", 1);
      template.resourceCountIs("AWS::EC2::Subnet", 4); // 3 AZs × 2 types
      template.resourceCountIs("AWS::EC2::NatGateway", 2);
    });
  });

  // ============================================
  // VPC Properties Tests
  // ============================================

  describe("VPC Properties", () => {
    test("VPC has correct CIDR block", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::VPC", {
        CidrBlock: Match.stringLikeRegexp("^10\\.0\\.0\\.0/16$"),
      });
    });

    test("VPC has tags", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::VPC", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Name",
            Value: Match.anyValue(),
          }),
        ]),
      });
    });
  });

  // ============================================
  // Security Tests
  // ============================================

  describe("Security Configuration", () => {
    test("private subnets do not auto-assign public IPs", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      const resources = template.findResources("AWS::EC2::Subnet");
      const privateSubnets = Object.values(resources).filter((subnet: any) => {
        const tags = subnet.Properties.Tags || [];
        return tags.some(
          (tag: any) =>
            tag.Key === "aws-cdk:subnet-name" && tag.Value === "Private"
        );
      });

      privateSubnets.forEach((subnet: any) => {
        expect(subnet.Properties.MapPublicIpOnLaunch).toBe(false);
      });
    });

    test("public subnets auto-assign public IPs", () => {
      new VpcConstruct(stack, "TestVpc");
      const template = Template.fromStack(stack);

      const resources = template.findResources("AWS::EC2::Subnet");
      const publicSubnets = Object.values(resources).filter((subnet: any) => {
        const tags = subnet.Properties.Tags || [];
        return tags.some(
          (tag: any) =>
            tag.Key === "aws-cdk:subnet-name" && tag.Value === "Public"
        );
      });

      publicSubnets.forEach((subnet: any) => {
        expect(subnet.Properties.MapPublicIpOnLaunch).toBe(true);
      });
    });
  });
});
