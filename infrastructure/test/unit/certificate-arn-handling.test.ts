/** @format */

import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { LoadBalancerStack } from "../../lib/stacks/networking/load-balancer-stack";
import { NetworkingStack } from "../../lib/stacks/networking/networking-stack";

describe("Certificate ARN Handling", () => {
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

  describe("Load Balancer with Certificate ARN", () => {
    it("should create HTTPS listener when certificate ARN is provided", () => {
      // Arrange
      const certificateArn =
        "arn:aws:acm:eu-west-1:123456789012:certificate/12345678-1234-1234-1234-123456789012";

      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "test",
        vpc: networkingStack.vpc,
        enableHttps: true,
        certificateArn: certificateArn,
      });

      // Assert
      const template = Template.fromStack(stack);

      // Should have HTTPS listener
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Protocol: "HTTPS",
        Port: 443,
        Certificates: [
          {
            CertificateArn: certificateArn,
          },
        ],
      });

      // Should have HTTP listener (for redirect)
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Protocol: "HTTP",
        Port: 80,
      });
    });

    it("should create HTTP-only listener when certificate ARN is not provided", () => {
      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "test",
        vpc: networkingStack.vpc,
        enableHttps: false,
        certificateArn: undefined,
      });

      // Assert
      const template = Template.fromStack(stack);

      // Should have HTTP listener
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Protocol: "HTTP",
        Port: 80,
      });

      // Should NOT have HTTPS listener
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 1);
    });

    it("should not create HTTPS listener when enableHttps is false even with certificate ARN", () => {
      // Arrange
      const certificateArn =
        "arn:aws:acm:eu-west-1:123456789012:certificate/12345678-1234-1234-1234-123456789012";

      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "test",
        vpc: networkingStack.vpc,
        enableHttps: false,
        certificateArn: certificateArn,
      });

      // Assert
      const template = Template.fromStack(stack);

      // Should only have HTTP listener
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 1);
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Protocol: "HTTP",
        Port: 80,
      });
    });

    it("should create load balancer with correct security group rules for HTTPS", () => {
      // Arrange
      const certificateArn =
        "arn:aws:acm:eu-west-1:123456789012:certificate/12345678-1234-1234-1234-123456789012";

      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "test",
        vpc: networkingStack.vpc,
        enableHttps: true,
        certificateArn: certificateArn,
      });

      // Assert
      const template = Template.fromStack(stack);

      // Should have security group with ingress rules for HTTP, HTTPS, and service port
      const resources = template.toJSON().Resources;
      const securityGroup = Object.values(resources).find(
        (resource: any) => resource.Type === "AWS::EC2::SecurityGroup"
      ) as any;

      expect(securityGroup).toBeDefined();
      expect(securityGroup.Properties.SecurityGroupIngress).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            FromPort: 80,
            ToPort: 80,
            IpProtocol: "tcp",
          }),
          expect.objectContaining({
            FromPort: 3000,
            ToPort: 3000,
            IpProtocol: "tcp",
          }),
          expect.objectContaining({
            FromPort: 443,
            ToPort: 443,
            IpProtocol: "tcp",
          }),
        ])
      );
    });

    it("should create load balancer with HTTP and service port rules when HTTPS disabled", () => {
      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "test",
        vpc: networkingStack.vpc,
        enableHttps: false,
      });

      // Assert
      const template = Template.fromStack(stack);

      // Should have security group with HTTP and service port ingress rules (no HTTPS)
      const resources = template.toJSON().Resources;
      const securityGroup = Object.values(resources).find(
        (resource: any) => resource.Type === "AWS::EC2::SecurityGroup"
      ) as any;

      expect(securityGroup).toBeDefined();
      expect(securityGroup.Properties.SecurityGroupIngress).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            FromPort: 80,
            ToPort: 80,
            IpProtocol: "tcp",
          }),
          expect.objectContaining({
            FromPort: 3000,
            ToPort: 3000,
            IpProtocol: "tcp",
          }),
        ])
      );

      // Should NOT have HTTPS rule
      const hasHttpsRule = securityGroup.Properties.SecurityGroupIngress.some(
        (rule: any) => rule.FromPort === 443
      );
      expect(hasHttpsRule).toBe(false);
    });
  });

  describe("Certificate ARN Validation", () => {
    it("should accept valid certificate ARN format", () => {
      // Arrange
      const validArns = [
        "arn:aws:acm:eu-west-1:123456789012:certificate/12345678-1234-1234-1234-123456789012",
        "arn:aws:acm:us-east-1:987654321098:certificate/abcdef12-3456-7890-abcd-ef1234567890",
        "arn:aws:acm:ap-southeast-1:111111111111:certificate/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      ];

      // Act & Assert
      validArns.forEach((arn) => {
        expect(() => {
          new LoadBalancerStack(app, `TestStack-${arn.split(":")[3]}`, {
            envName: "test",
            vpc: networkingStack.vpc,
            enableHttps: true,
            certificateArn: arn,
          });
        }).not.toThrow();
      });
    });

    it("should handle undefined certificate ARN gracefully", () => {
      // Act & Assert
      expect(() => {
        new LoadBalancerStack(app, "TestLoadBalancerStack", {
          envName: "test",
          vpc: networkingStack.vpc,
          enableHttps: false,
          certificateArn: undefined,
        });
      }).not.toThrow();
    });
  });

  describe("Stack Outputs", () => {
    it("should export HTTPS listener ARN when HTTPS is enabled", () => {
      // Arrange
      const certificateArn =
        "arn:aws:acm:eu-west-1:123456789012:certificate/12345678-1234-1234-1234-123456789012";

      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "test",
        vpc: networkingStack.vpc,
        enableHttps: true,
        certificateArn: certificateArn,
      });

      // Assert
      const template = Template.fromStack(stack);

      // Should have HTTPS listener ARN output
      template.hasOutput("HttpsListenerArn", {});
    });

    it("should not export HTTPS listener ARN when HTTPS is disabled", () => {
      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "test",
        vpc: networkingStack.vpc,
        enableHttps: false,
      });

      // Assert
      const template = Template.fromStack(stack);

      // Should not have HTTPS listener ARN output
      const outputs = template.toJSON().Outputs || {};
      expect(outputs.HttpsListenerArn).toBeUndefined();
    });

    it("should always export HTTP listener ARN", () => {
      // Act - with HTTPS
      const stackWithHttps = new LoadBalancerStack(
        app,
        "TestLoadBalancerStackWithHttps",
        {
          envName: "test",
          vpc: networkingStack.vpc,
          enableHttps: true,
          certificateArn:
            "arn:aws:acm:eu-west-1:123456789012:certificate/12345678-1234-1234-1234-123456789012",
        }
      );

      // Act - without HTTPS
      const stackWithoutHttps = new LoadBalancerStack(
        app,
        "TestLoadBalancerStackWithoutHttps",
        {
          envName: "test",
          vpc: networkingStack.vpc,
          enableHttps: false,
        }
      );

      // Assert
      const templateWithHttps = Template.fromStack(stackWithHttps);
      const templateWithoutHttps = Template.fromStack(stackWithoutHttps);

      templateWithHttps.hasOutput("HttpListenerArn", {});
      templateWithoutHttps.hasOutput("HttpListenerArn", {});
    });

    it("should export load balancer DNS name", () => {
      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "test",
        vpc: networkingStack.vpc,
        enableHttps: false,
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasOutput("LoadBalancerDnsName", {});
    });
  });

  describe("Load Balancer Configuration", () => {
    it("should create internet-facing load balancer", () => {
      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "test",
        vpc: networkingStack.vpc,
        enableHttps: false,
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Scheme: "internet-facing",
          Type: "application",
        }
      );
    });

    it("should create load balancer in production environment", () => {
      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "production",
        vpc: networkingStack.vpc,
        enableHttps: false,
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Scheme: "internet-facing",
          Type: "application",
        }
      );

      // Should have environment tag
      const resources = template.toJSON().Resources;
      const loadBalancer = Object.values(resources).find(
        (resource: any) =>
          resource.Type === "AWS::ElasticLoadBalancingV2::LoadBalancer"
      ) as any;

      expect(loadBalancer).toBeDefined();
      expect(loadBalancer.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: "Environment",
            Value: "production",
          }),
        ])
      );
    });

    it("should create load balancer in development environment", () => {
      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "development",
        vpc: networkingStack.vpc,
        enableHttps: false,
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Scheme: "internet-facing",
          Type: "application",
        }
      );

      // Should have environment tag
      const resources = template.toJSON().Resources;
      const loadBalancer = Object.values(resources).find(
        (resource: any) =>
          resource.Type === "AWS::ElasticLoadBalancingV2::LoadBalancer"
      ) as any;

      expect(loadBalancer).toBeDefined();
      expect(loadBalancer.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: "Environment",
            Value: "development",
          }),
        ])
      );
    });
  });

  describe("Tags", () => {
    it("should apply custom tags to load balancer", () => {
      // Arrange
      const customTags = {
        Project: "portfolio",
        ManagedBy: "cdk",
        CostCenter: "engineering",
      };

      // Act
      const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
        envName: "test",
        vpc: networkingStack.vpc,
        enableHttps: false,
        tags: customTags,
      });

      // Assert
      const template = Template.fromStack(stack);
      const resources = template.toJSON().Resources;

      // Find the load balancer resource
      const lbResource = Object.values(resources).find(
        (resource: any) =>
          resource.Type === "AWS::ElasticLoadBalancingV2::LoadBalancer"
      ) as any;

      expect(lbResource).toBeDefined();
      expect(lbResource.Properties.Tags).toEqual(
        expect.arrayContaining([
          { Key: "Project", Value: "portfolio" },
          { Key: "ManagedBy", Value: "cdk" },
          { Key: "CostCenter", Value: "engineering" },
        ])
      );
    });
  });
});
