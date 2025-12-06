/** @format */

import { App } from "aws-cdk-lib";
import { Template, Match, Capture } from "aws-cdk-lib/assertions";
import { NetworkingStack } from "../../lib/stacks/networking/networking-stack";

describe("NetworkingStack Test Suite", () => {
  let template: Template;
  let app: App;

  beforeAll(() => {
    app = new App();
    const stack = new NetworkingStack(app, "TestNetworkingStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
      envName: "test",
      maxAzs: 2,
      natGateways: 0,
      enableVpcFlowLogs: true,
    });
    template = Template.fromStack(stack);
  });

  describe("VPC Configuration", () => {
    test("creates VPC with correct properties", () => {
      template.hasResourceProperties("AWS::EC2::VPC", {
        CidrBlock: "10.0.0.0/16",
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    test("VPC has correct tags", () => {
      const tagsCapture = new Capture();
      template.hasResourceProperties("AWS::EC2::VPC", {
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

    test("creates exactly one VPC", () => {
      template.resourceCountIs("AWS::EC2::VPC", 1);
    });
  });

  describe("Subnet Configuration", () => {
    test("creates correct number of subnets", () => {
      // 2 AZs × 2 subnet types (public + private) = 4 subnets
      template.resourceCountIs("AWS::EC2::Subnet", 4);
    });

    test("creates public subnets with correct properties", () => {
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

    test("creates private subnets with correct properties", () => {
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

    test("subnets have correct CIDR blocks", () => {
      const subnets = template.findResources("AWS::EC2::Subnet");
      Object.values(subnets).forEach((subnet: any) => {
        expect(subnet.Properties.CidrBlock).toMatch(/^10\.0\.\d+\.0\/24$/);
      });
    });
  });

  describe("Internet Gateway", () => {
    test("creates internet gateway", () => {
      template.resourceCountIs("AWS::EC2::InternetGateway", 1);
    });

    test("attaches internet gateway to VPC", () => {
      template.resourceCountIs("AWS::EC2::VPCGatewayAttachment", 1);
      template.hasResourceProperties("AWS::EC2::VPCGatewayAttachment", {
        VpcId: Match.objectLike({
          Ref: Match.stringLikeRegexp("Vpc"),
        }),
      });
    });
  });

  describe("NAT Gateway Configuration", () => {
    test("does not create NAT gateways when natGateways is 0", () => {
      template.resourceCountIs("AWS::EC2::NatGateway", 0);
    });

    test("does not create Elastic IPs when no NAT gateways", () => {
      template.resourceCountIs("AWS::EC2::EIP", 0);
    });
  });

  describe("Route Tables", () => {
    test("creates route tables for subnets", () => {
      // 2 public + 2 private = 4 route tables
      template.resourceCountIs("AWS::EC2::RouteTable", 4);
    });

    test("creates routes to internet gateway", () => {
      template.hasResourceProperties("AWS::EC2::Route", {
        DestinationCidrBlock: "0.0.0.0/0",
        GatewayId: Match.objectLike({
          Ref: Match.stringLikeRegexp("IGW"),
        }),
      });
    });
  });

  describe("VPC Flow Logs", () => {
    test("creates flow logs log group", () => {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/aws/vpc/flowlogs/test",
        RetentionInDays: 7,
      });
    });

    test("creates flow logs with correct configuration", () => {
      template.hasResourceProperties("AWS::EC2::FlowLog", {
        ResourceType: "VPC",
        TrafficType: "ALL",
        LogDestinationType: "cloud-watch-logs",
      });
    });

    test("flow logs have correct IAM role", () => {
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                Service: "vpc-flow-logs.amazonaws.com",
              },
            }),
          ]),
        }),
      });
    });
  });

  describe("Stack Outputs", () => {
    test("exports VPC ID", () => {
      template.hasOutput("VpcId", {
        Description: "VPC ID",
        Export: {
          Name: "test-vpc-id",
        },
      });
    });

    test("exports VPC CIDR", () => {
      template.hasOutput("VpcCidr", {
        Description: "VPC CIDR Block",
        Export: {
          Name: "test-vpc-cidr",
        },
      });
    });

    test("exports subnet IDs", () => {
      template.hasOutput("PublicSubnet1Id", {
        Description: "Public Subnet 1 ID",
      });

      template.hasOutput("PublicSubnet2Id", {
        Description: "Public Subnet 2 ID",
      });

      template.hasOutput("PrivateSubnet1Id", {
        Description: "Private Subnet 1 ID",
      });

      template.hasOutput("PrivateSubnet2Id", {
        Description: "Private Subnet 2 ID",
      });
    });

    test("exports availability zones", () => {
      template.hasOutput("AvailabilityZones", {
        Description: "Availability Zones",
      });
    });
  });

  describe("Resource Counts", () => {
    test("has correct total resource count", () => {
      const resources = template.findResources("*");
      const templateJson = template.toJSON();
      const resourceCount = Object.keys(templateJson.Resources || {}).length;

      // Should have VPC, subnets, route tables, IGW, flow logs, etc.
      expect(resourceCount).toBeGreaterThan(10);
    });
  });

  describe("Snapshots", () => {
    test("NetworkingStack matches snapshot", () => {
      expect(template.toJSON()).toMatchSnapshot();
    });

    test("VPC resource matches snapshot", () => {
      const vpc = template.findResources("AWS::EC2::VPC");
      expect(vpc).toMatchSnapshot();
    });

    test("Subnets match snapshot", () => {
      const subnets = template.findResources("AWS::EC2::Subnet");
      expect(subnets).toMatchSnapshot();
    });

    test("Flow Logs match snapshot", () => {
      const flowLogs = template.findResources("AWS::EC2::FlowLog");
      expect(flowLogs).toMatchSnapshot();
    });
  });
});
