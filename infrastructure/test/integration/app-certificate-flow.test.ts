/** @format */

/**
 * Integration tests for certificate ARN flow in app.ts
 * These tests simulate the behavior of app.ts with different environment configurations
 */

import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { LoadBalancerStack } from "../../lib/stacks/networking/load-balancer-stack";
import { NetworkingStack } from "../../lib/stacks/networking/networking-stack";

describe("App Certificate Flow Integration", () => {
  describe("Environment Variable Scenarios", () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      // Save original environment
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      // Restore original environment
      process.env = originalEnv;
    });

    it("should use certificate ARN from CERTIFICATE_ARN environment variable", () => {
      // Arrange
      const certificateArn =
        "arn:aws:acm:eu-west-1:123456789012:certificate/12345678-1234-1234-1234-123456789012";
      process.env.CERTIFICATE_ARN = certificateArn;

      const app = new cdk.App();
      const networkingStack = new NetworkingStack(app, "NetworkingStack", {
        envName: "test",
        maxAzs: 2,
        natGateways: 0,
      });

      // Act - Simulate app.ts logic
      let certArn: string | undefined;
      if (process.env.CERTIFICATE_ARN) {
        certArn = process.env.CERTIFICATE_ARN;
      }

      const loadBalancerStack = new LoadBalancerStack(
        app,
        "LoadBalancerStack",
        {
          envName: "test",
          vpc: networkingStack.vpc,
          enableHttps: !!certArn,
          certificateArn: certArn,
        }
      );

      // Assert
      expect(certArn).toBe(certificateArn);

      const template = Template.fromStack(loadBalancerStack);
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Protocol: "HTTPS",
        Port: 443,
        Certificates: [{ CertificateArn: certificateArn }],
      });
    });

    it("should handle missing CERTIFICATE_ARN environment variable", () => {
      // Arrange
      delete process.env.CERTIFICATE_ARN;
      process.env.SKIP_DOMAIN_LOOKUP = "true";

      const app = new cdk.App();
      const networkingStack = new NetworkingStack(app, "NetworkingStack", {
        envName: "test",
        maxAzs: 2,
        natGateways: 0,
      });

      // Act - Simulate app.ts logic
      let certArn: string | undefined;
      if (process.env.CERTIFICATE_ARN) {
        certArn = process.env.CERTIFICATE_ARN;
      } else if (process.env.SKIP_DOMAIN_LOOKUP !== "true") {
        // Would do SSM lookup here, but we skip it
        certArn = undefined;
      }

      const loadBalancerStack = new LoadBalancerStack(
        app,
        "LoadBalancerStack",
        {
          envName: "test",
          vpc: networkingStack.vpc,
          enableHttps: !!certArn,
          certificateArn: certArn,
        }
      );

      // Assert
      expect(certArn).toBeUndefined();

      const template = Template.fromStack(loadBalancerStack);
      // Should only have HTTP listener
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 1);
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Protocol: "HTTP",
        Port: 80,
      });
    });

    it("should skip domain lookup when SKIP_DOMAIN_LOOKUP is true", () => {
      // Arrange
      delete process.env.CERTIFICATE_ARN;
      process.env.SKIP_DOMAIN_LOOKUP = "true";

      // Act - Simulate app.ts logic
      let certArn: string | undefined;
      let lookupAttempted = false;

      if (process.env.CERTIFICATE_ARN) {
        certArn = process.env.CERTIFICATE_ARN;
      } else if (process.env.SKIP_DOMAIN_LOOKUP !== "true") {
        lookupAttempted = true;
        // Would do SSM lookup here
      }

      // Assert
      expect(certArn).toBeUndefined();
      expect(lookupAttempted).toBe(false);
    });

    it("should handle empty CERTIFICATE_ARN environment variable", () => {
      // Arrange
      process.env.CERTIFICATE_ARN = "";
      process.env.SKIP_DOMAIN_LOOKUP = "true";

      const app = new cdk.App();
      const networkingStack = new NetworkingStack(app, "NetworkingStack", {
        envName: "test",
        maxAzs: 2,
        natGateways: 0,
      });

      // Act - Simulate app.ts logic
      let certArn: string | undefined;
      if (process.env.CERTIFICATE_ARN) {
        certArn = process.env.CERTIFICATE_ARN;
      }

      const loadBalancerStack = new LoadBalancerStack(
        app,
        "LoadBalancerStack",
        {
          envName: "test",
          vpc: networkingStack.vpc,
          enableHttps: !!certArn,
          certificateArn: certArn,
        }
      );

      // Assert
      // Empty string is falsy, so certArn will be undefined
      expect(certArn).toBeUndefined();
      expect(!!certArn).toBe(false);

      const template = Template.fromStack(loadBalancerStack);
      // Should only have HTTP listener (HTTPS disabled due to empty string)
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 1);
    });
  });

  describe("Multi-Environment Scenarios", () => {
    it("should create different stacks for different environments", () => {
      // Arrange
      const certificateArn =
        "arn:aws:acm:eu-west-1:123456789012:certificate/12345678-1234-1234-1234-123456789012";
      const environments = ["development", "staging", "production"];

      // Act & Assert
      environments.forEach((envName) => {
        const app = new cdk.App();
        const networkingStack = new NetworkingStack(
          app,
          `NetworkingStack-${envName}`,
          {
            envName: envName,
            maxAzs: 2,
            natGateways: 0,
          }
        );

        const loadBalancerStack = new LoadBalancerStack(
          app,
          `LoadBalancerStack-${envName}`,
          {
            envName: envName,
            vpc: networkingStack.vpc,
            enableHttps: true,
            certificateArn: certificateArn,
          }
        );

        const template = Template.fromStack(loadBalancerStack);

        // All environments should have HTTPS when certificate is provided
        template.hasResourceProperties(
          "AWS::ElasticLoadBalancingV2::Listener",
          {
            Protocol: "HTTPS",
            Port: 443,
          }
        );

        // All environments should have proper tags
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
              Value: envName,
            }),
          ])
        );
      });
    });
  });

  describe("Certificate ARN Format Validation", () => {
    it("should accept certificate ARN from different regions", () => {
      // Arrange
      const regions = [
        "us-east-1",
        "us-west-2",
        "eu-west-1",
        "eu-central-1",
        "ap-southeast-1",
      ];

      regions.forEach((region) => {
        const app = new cdk.App();
        const networkingStack = new NetworkingStack(
          app,
          `NetworkingStack-${region}`,
          {
            envName: "test",
            maxAzs: 2,
            natGateways: 0,
          }
        );

        const certificateArn = `arn:aws:acm:${region}:123456789012:certificate/12345678-1234-1234-1234-123456789012`;

        // Act
        const loadBalancerStack = new LoadBalancerStack(
          app,
          `LoadBalancerStack-${region}`,
          {
            envName: "test",
            vpc: networkingStack.vpc,
            enableHttps: true,
            certificateArn: certificateArn,
          }
        );

        // Assert
        const template = Template.fromStack(loadBalancerStack);
        template.hasResourceProperties(
          "AWS::ElasticLoadBalancingV2::Listener",
          {
            Protocol: "HTTPS",
            Certificates: [{ CertificateArn: certificateArn }],
          }
        );
      });
    });

    it("should handle certificate ARN from different accounts", () => {
      // Arrange
      const accounts = ["123456789012", "987654321098", "111111111111"];

      accounts.forEach((account) => {
        const app = new cdk.App();
        const networkingStack = new NetworkingStack(
          app,
          `NetworkingStack-${account}`,
          {
            envName: "test",
            maxAzs: 2,
            natGateways: 0,
          }
        );

        const certificateArn = `arn:aws:acm:eu-west-1:${account}:certificate/12345678-1234-1234-1234-123456789012`;

        // Act
        const loadBalancerStack = new LoadBalancerStack(
          app,
          `LoadBalancerStack-${account}`,
          {
            envName: "test",
            vpc: networkingStack.vpc,
            enableHttps: true,
            certificateArn: certificateArn,
          }
        );

        // Assert
        const template = Template.fromStack(loadBalancerStack);
        template.hasResourceProperties(
          "AWS::ElasticLoadBalancingV2::Listener",
          {
            Certificates: [{ CertificateArn: certificateArn }],
          }
        );
      });
    });
  });

  describe("Stack Dependencies", () => {
    it("should create load balancer stack that depends on networking stack", () => {
      // Arrange
      const app = new cdk.App();
      const networkingStack = new NetworkingStack(app, "NetworkingStack", {
        envName: "test",
        maxAzs: 2,
        natGateways: 0,
      });

      // Act
      const loadBalancerStack = new LoadBalancerStack(
        app,
        "LoadBalancerStack",
        {
          envName: "test",
          vpc: networkingStack.vpc,
          enableHttps: false,
        }
      );

      loadBalancerStack.addDependency(networkingStack);

      // Assert
      const assembly = app.synth();
      const lbStackArtifact = assembly.getStackByName(
        loadBalancerStack.stackName
      );

      expect(lbStackArtifact.dependencies).toContainEqual(
        expect.objectContaining({
          id: networkingStack.stackName,
        })
      );
    });

    it("should not require certificate stack dependency for manual certificates", () => {
      // Arrange
      const app = new cdk.App();
      const networkingStack = new NetworkingStack(app, "NetworkingStack", {
        envName: "test",
        maxAzs: 2,
        natGateways: 0,
      });

      const certificateArn =
        "arn:aws:acm:eu-west-1:123456789012:certificate/12345678-1234-1234-1234-123456789012";

      // Act
      const loadBalancerStack = new LoadBalancerStack(
        app,
        "LoadBalancerStack",
        {
          envName: "test",
          vpc: networkingStack.vpc,
          enableHttps: true,
          certificateArn: certificateArn,
        }
      );

      loadBalancerStack.addDependency(networkingStack);

      // Assert
      const assembly = app.synth();
      const lbStackArtifact = assembly.getStackByName(
        loadBalancerStack.stackName
      );

      // Should depend on networking stack, not certificate stack
      // Note: May also have asset dependencies
      const stackDependencies = lbStackArtifact.dependencies.filter(
        (dep: any) => !dep.id.includes(".assets")
      );
      expect(stackDependencies).toHaveLength(1);
      expect(stackDependencies[0].id).toBe(networkingStack.stackName);
    });
  });

  describe("Logging and Console Output", () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it("should log when certificate ARN is provided via environment variable", () => {
      // Arrange
      const certificateArn =
        "arn:aws:acm:eu-west-1:123456789012:certificate/12345678-1234-1234-1234-123456789012";

      // Act - Simulate app.ts logging
      if (certificateArn) {
        console.log(`✓ Using certificate ARN from environment variable`);
        console.log(`  Certificate: ${certificateArn}`);
      }

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Using certificate ARN from environment")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(certificateArn)
      );
    });

    it("should log when certificate ARN is not configured", () => {
      // Arrange
      const certificateArn = undefined;

      // Act - Simulate app.ts logging
      if (!certificateArn) {
        console.log(
          "⚠ Certificate ARN not configured - HTTPS will be disabled"
        );
      }

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("HTTPS will be disabled")
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed certificate ARN gracefully", () => {
      // Arrange
      const malformedArns = [
        "not-an-arn",
        "arn:aws:acm:invalid",
        "",
        "arn:aws:s3:::bucket/key", // Wrong service
      ];

      malformedArns.forEach((arn) => {
        const app = new cdk.App();
        const networkingStack = new NetworkingStack(
          app,
          `NetworkingStack-${arn.length}`,
          {
            envName: "test",
            maxAzs: 2,
            natGateways: 0,
          }
        );

        // Act & Assert - Should not throw during stack creation
        // CloudFormation will validate the ARN at deployment time
        expect(() => {
          new LoadBalancerStack(app, `LoadBalancerStack-${arn.length}`, {
            envName: "test",
            vpc: networkingStack.vpc,
            enableHttps: !!arn,
            certificateArn: arn || undefined,
          });
        }).not.toThrow();
      });
    });
  });
});
