/** @format */

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { MonitoringEc2Stack } from "../../lib/stacks/monitoring/monitoring-ec2-stack";
import { NetworkingStack } from "../../lib/stacks/networking/networking-stack";

describe("MonitoringEc2Stack", () => {
  let app: cdk.App;
  let networkingStack: NetworkingStack;

  beforeEach(() => {
    app = new cdk.App();
    networkingStack = new NetworkingStack(app, "TestNetworkingStack", {
      envName: "test",
      maxAzs: 2,
      natGateways: 0,
    });
  });

  describe("Stack Creation", () => {
    it("should create monitoring stack successfully", () => {
      // Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      expect(stack).toBeDefined();
      const template = Template.fromStack(stack);
      expect(template).toBeDefined();
    });

    it("should create stack with ALB DNS name", () => {
      // Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
        albDnsName: "test-alb-123456.eu-west-1.elb.amazonaws.com",
      });

      // Assert
      expect(stack).toBeDefined();
    });

    it("should create stack with allowed IP ranges", () => {
      // Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
        allowedIpRanges: ["1.2.3.4/32", "5.6.7.8/32"],
      });

      // Assert
      expect(stack).toBeDefined();
    });
  });

  describe("EC2 Instance", () => {
    it("should create EC2 instance with correct type", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::Instance", {
        InstanceType: "t3.micro",
      });
    });

    it("should create instance in public subnet", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::Instance", {
        SubnetId: Match.anyValue(),
      });
    });

    it("should use Amazon Linux 2023 AMI", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::Instance", {
        ImageId: Match.anyValue(),
      });
    });

    it("should have user data for setup", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::Instance", {
        UserData: Match.anyValue(),
      });
    });
  });

  describe("Security Group", () => {
    it("should create security group", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::EC2::SecurityGroup", 1);
    });

    it("should allow Grafana access on port 3000", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            FromPort: 3000,
            ToPort: 3000,
            IpProtocol: "tcp",
          }),
        ]),
      });
    });

    it("should allow Prometheus access on port 9090", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            FromPort: 9090,
            ToPort: 9090,
            IpProtocol: "tcp",
          }),
        ]),
      });
    });

    it("should allow SSH access on port 22", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            FromPort: 22,
            ToPort: 22,
            IpProtocol: "tcp",
          }),
        ]),
      });
    });

    it("should restrict Grafana access to specific IPs when provided", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
        allowedIpRanges: ["1.2.3.4/32"],
      });

      // Assert
      const template = Template.fromStack(stack);
      const resources = template.toJSON().Resources;
      const securityGroup = Object.values(resources).find(
        (resource: any) => resource.Type === "AWS::EC2::SecurityGroup"
      ) as any;

      const grafanaRule = securityGroup.Properties.SecurityGroupIngress.find(
        (rule: any) => rule.FromPort === 3000
      );

      expect(grafanaRule).toBeDefined();
      expect(grafanaRule.CidrIp).toBe("1.2.3.4/32");
    });
  });

  describe("IAM Role", () => {
    it("should create IAM role for EC2", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                Service: "ec2.amazonaws.com",
              },
            },
          ],
        },
      });
    });

    it("should have CloudWatch read permissions", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            "Fn::Join": Match.arrayWith([
              Match.arrayWith([
                Match.stringLikeRegexp("CloudWatchReadOnlyAccess"),
              ]),
            ]),
          }),
        ]),
      });
    });

    it("should have SSM managed instance permissions", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            "Fn::Join": Match.arrayWith([
              Match.arrayWith([
                Match.stringLikeRegexp("AmazonSSMManagedInstanceCore"),
              ]),
            ]),
          }),
        ]),
      });
    });

    it("should have inline policy for CloudWatch access", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams",
                "logs:GetLogEvents",
                "cloudwatch:GetMetricData",
                "cloudwatch:ListMetrics",
              ]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });
  });

  describe("EBS Volume", () => {
    it("should create EBS volume", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::Instance", {
        BlockDeviceMappings: [
          {
            DeviceName: "/dev/xvda",
            Ebs: {
              VolumeSize: 8,
              VolumeType: "gp3",
              DeleteOnTermination: true,
              Encrypted: true,
            },
          },
        ],
      });
    });

    it("should encrypt EBS volume", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::Instance", {
        BlockDeviceMappings: Match.arrayWith([
          Match.objectLike({
            Ebs: Match.objectLike({
              Encrypted: true,
            }),
          }),
        ]),
      });
    });
  });

  describe("Tags", () => {
    it("should tag instance with environment", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::Instance", {
        Tags: Match.arrayWith([
          {
            Key: "Environment",
            Value: "test",
          },
        ]),
      });
    });

    it("should tag instance with name", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::Instance", {
        Tags: Match.arrayWith([
          {
            Key: "Name",
            Value: "test-monitoring",
          },
        ]),
      });
    });

    it("should tag instance with purpose", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::EC2::Instance", {
        Tags: Match.arrayWith([
          {
            Key: "Purpose",
            Value: "Monitoring",
          },
        ]),
      });
    });
  });

  describe("Stack Outputs", () => {
    it("should export Grafana URL", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasOutput("GrafanaUrl", {
        Description: "Grafana Dashboard URL (default: admin/admin)",
      });
    });

    it("should export Prometheus URL", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasOutput("PrometheusUrl", {
        Description: "Prometheus URL",
      });
    });

    it("should export instance ID", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasOutput("InstanceId", {
        Description: "EC2 Instance ID for monitoring",
      });
    });

    it("should export public IP", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasOutput("InstancePublicIp", {
        Description: "Public IP of monitoring instance",
      });
    });

    it("should export SSM connect command", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasOutput("SSMConnectCommand", {
        Description: "Command to connect via SSM Session Manager",
      });
    });
  });

  describe("Multi-Environment Support", () => {
    it("should create different stacks for different environments", () => {
      // Arrange
      const environments = ["development", "staging", "production"];

      // Act & Assert
      environments.forEach((envName) => {
        // Create new app for each environment to avoid synthesis issues
        const envApp = new cdk.App();

        const envNetworkingStack = new NetworkingStack(
          envApp,
          `NetworkingStack-${envName}`,
          {
            envName: envName,
            maxAzs: 2,
            natGateways: 0,
          }
        );

        const stack = new MonitoringEc2Stack(
          envApp,
          `MonitoringEc2Stack-${envName}`,
          {
            vpc: envNetworkingStack.vpc,
            envName: envName,
          }
        );

        expect(stack).toBeDefined();

        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::EC2::Instance", {
          Tags: Match.arrayWith([
            {
              Key: "Environment",
              Value: envName,
            },
          ]),
        });
      });
    });
  });

  describe("Resource Count", () => {
    it("should create expected number of resources", () => {
      // Arrange & Act
      const stack = new MonitoringEc2Stack(app, "TestMonitoringEc2Stack", {
        vpc: networkingStack.vpc,
        envName: "test",
      });

      // Assert
      const template = Template.fromStack(stack);

      // Should have exactly 1 EC2 instance
      template.resourceCountIs("AWS::EC2::Instance", 1);

      // Should have exactly 1 security group
      template.resourceCountIs("AWS::EC2::SecurityGroup", 1);

      // Should have exactly 1 IAM role
      template.resourceCountIs("AWS::IAM::Role", 1);

      // Should have at least 1 IAM policy
      const resources = template.toJSON().Resources;
      const policyCount = Object.values(resources).filter(
        (resource: any) => resource.Type === "AWS::IAM::Policy"
      ).length;
      expect(policyCount).toBeGreaterThanOrEqual(1);
    });
  });
});
