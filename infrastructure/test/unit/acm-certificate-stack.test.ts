/** @format */

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";

import { CertificateStack } from "../../lib/stacks/networking/security/acm-stack";
import { TEST_CONSTANTS } from "../helpers/test-utils";

describe("ACM Certificate Stack Test Suite", () => {
  const testDomain = "example.com";
  const testWildcardDomain = "*.example.com";
  const testHostedZoneId = "Z1234567890ABC";

  describe("Certificate Creation", () => {
    test("creates ACM certificate with domain name", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
      });

      const template = Template.fromStack(stack);

      // Should create ACM certificate
      template.hasResourceProperties("AWS::CertificateManager::Certificate", {
        DomainName: testDomain,
        ValidationMethod: "DNS",
      });
    });

    test("creates certificate with subject alternative names", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        subjectAlternativeNames: [testWildcardDomain],
        hostedZoneId: testHostedZoneId,
      });

      const template = Template.fromStack(stack);

      // Should create certificate with SANs
      template.hasResourceProperties("AWS::CertificateManager::Certificate", {
        DomainName: testDomain,
        SubjectAlternativeNames: Match.arrayWith([testWildcardDomain]),
        ValidationMethod: "DNS",
      });
    });

    test("creates certificate with DNS validation when hosted zone provided", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
      });

      const template = Template.fromStack(stack);

      // Should have DNS validation
      template.hasResourceProperties("AWS::CertificateManager::Certificate", {
        ValidationMethod: "DNS",
      });

      // Certificate should be created
      template.resourceCountIs("AWS::CertificateManager::Certificate", 1);
    });

    test("throws error when neither domain nor existing certificate provided", () => {
      const app = new cdk.App();

      expect(() => {
        new CertificateStack(app, "TestAcmStack", {
          env: {
            account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
            region: TEST_CONSTANTS.DEFAULT_REGION,
          },
          envName: "test",
          DomainName: "",
          existingCertificateArn: undefined,
        });
      }).toThrow("Either DomainName or existingCertificateArn is required");
    });

    test("creates certificate with multiple subject alternative names", () => {
      const app = new cdk.App();
      const sans = ["*.example.com", "api.example.com", "www.example.com"];

      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        subjectAlternativeNames: sans,
        hostedZoneId: testHostedZoneId,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::CertificateManager::Certificate", {
        DomainName: testDomain,
        SubjectAlternativeNames: Match.arrayWith(sans),
      });
    });
  });

  describe("SSM Parameter Storage", () => {
    test("stores certificate ARN in SSM Parameter Store by default", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
      });

      const template = Template.fromStack(stack);

      // Should create SSM parameter
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Type: "String",
        Name: "/portfolio/domain/acm-arn",
      });
    });

    test("uses custom SSM parameter name when provided", () => {
      const app = new cdk.App();
      const customParamName = "/custom/certificate/arn";

      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
        ssmParameterName: customParamName,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SSM::Parameter", {
        Type: "String",
        Name: customParamName,
      });
    });

    test("does not store certificate ARN when storeCertificateArnInSsm is false", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: false,
      });

      const template = Template.fromStack(stack);

      // Should not create SSM parameter
      template.resourceCountIs("AWS::SSM::Parameter", 0);
    });

    test("SSM parameter has correct description with environment and domain", () => {
      const app = new cdk.App();
      const envName = "production";

      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: envName,
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SSM::Parameter", {
        Description: Match.stringLikeRegexp(
          `ACM Certificate ARN for ${testDomain} \\(${envName}\\)`
        ),
      });
    });

    test("SSM parameter uses STANDARD tier", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SSM::Parameter", {
        Tier: "Standard",
      });
    });
  });

  describe("Environment-Specific Configuration", () => {
    test("applies correct tags for development environment", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "development",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
      });

      const template = Template.fromStack(stack);

      // Check for environment tag
      const resources = template.toJSON().Resources;
      const certificate = Object.values(resources).find(
        (resource: any) =>
          resource.Type === "AWS::CertificateManager::Certificate"
      ) as any;

      expect(certificate).toBeDefined();
      expect(certificate.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: "Environment",
            Value: "development",
          }),
        ])
      );
    });

    test("applies correct tags for production environment", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "production",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
      });

      const template = Template.fromStack(stack);

      const resources = template.toJSON().Resources;
      const certificate = Object.values(resources).find(
        (resource: any) =>
          resource.Type === "AWS::CertificateManager::Certificate"
      ) as any;

      expect(certificate).toBeDefined();
      expect(certificate.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: "Environment",
            Value: "production",
          }),
        ])
      );
    });

    test("enables termination protection for production environment", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "production",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        enableDeletionProtection: true,
      });

      expect(stack.terminationProtection).toBe(true);
    });

    test("does not enable termination protection for development environment", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "development",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        enableDeletionProtection: false,
      });

      expect(stack.terminationProtection).toBe(false);
    });
  });

  describe("Certificate Retrieval and Accessibility", () => {
    test("certificate ARN is accessible via stack property", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
      });

      expect(stack.certificateArn).toBeDefined();
      // ARN is a token at synthesis time, so just check it's a string
      expect(typeof stack.certificateArn).toBe("string");
    });

    test("certificate construct is accessible via stack property", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
      });

      expect(stack.certificate).toBeDefined();
      expect(stack.certificate.certificateArn).toBeDefined();
    });

    test("SSM parameter is accessible via stack property when stored", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
      });

      expect(stack.ssmParameter).toBeDefined();
      // Parameter name is a token at synthesis time, so just check it's defined
      expect(stack.ssmParameter?.parameterName).toBeDefined();
    });

    test("SSM parameter is undefined when not stored", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: false,
      });

      expect(stack.ssmParameter).toBeUndefined();
    });

    test("getCertificateArn() method returns certificate ARN", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
      });

      const arn = stack.getCertificateArn();
      expect(arn).toBeDefined();
      // ARN is a token at synthesis time, so just check it's a string
      expect(typeof arn).toBe("string");
    });

    test("getSsmParameter() method returns SSM parameter when stored", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
      });

      const param = stack.getSsmParameter();
      expect(param).toBeDefined();
      // Parameter name is a token at synthesis time, so just check it's defined
      expect(param?.parameterName).toBeDefined();
    });

    test("getSsmParameter() method returns undefined when not stored", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: false,
      });

      const param = stack.getSsmParameter();
      expect(param).toBeUndefined();
    });
  });

  describe("Multi-Environment Scenarios", () => {
    test("creates separate certificates for different environments", () => {
      const app = new cdk.App();

      const devStack = new CertificateStack(app, "DevAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "development",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
        ssmParameterName: "/portfolio/dev/acm-arn",
      });

      const prodStack = new CertificateStack(app, "ProdAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "production",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
        ssmParameterName: "/portfolio/prod/acm-arn",
      });

      const devTemplate = Template.fromStack(devStack);
      const prodTemplate = Template.fromStack(prodStack);

      // Both should have certificates
      devTemplate.resourceCountIs("AWS::CertificateManager::Certificate", 1);
      prodTemplate.resourceCountIs("AWS::CertificateManager::Certificate", 1);

      // Both should have SSM parameters with different names
      devTemplate.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/portfolio/dev/acm-arn",
      });

      prodTemplate.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/portfolio/prod/acm-arn",
      });
    });

    test("creates certificates for different subdomains", () => {
      const app = new cdk.App();

      const appStack = new CertificateStack(app, "AppAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "production",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
        ssmParameterName: "/portfolio/app/acm-arn",
      });

      const monitoringStack = new CertificateStack(app, "MonitoringAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "production",
        DomainName: `monitoring.${testDomain}`,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
        ssmParameterName: "/portfolio/monitoring/acm-arn",
      });

      const appTemplate = Template.fromStack(appStack);
      const monitoringTemplate = Template.fromStack(monitoringStack);

      // App certificate
      appTemplate.hasResourceProperties(
        "AWS::CertificateManager::Certificate",
        {
          DomainName: testDomain,
        }
      );

      // Monitoring certificate
      monitoringTemplate.hasResourceProperties(
        "AWS::CertificateManager::Certificate",
        {
          DomainName: `monitoring.${testDomain}`,
        }
      );

      // Different SSM parameters
      appTemplate.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/portfolio/app/acm-arn",
      });

      monitoringTemplate.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/portfolio/monitoring/acm-arn",
      });
    });
  });

  describe("Resource Tagging", () => {
    test("applies all required tags to certificate", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
      });

      const template = Template.fromStack(stack);
      const resources = template.toJSON().Resources;
      const certificate = Object.values(resources).find(
        (resource: any) =>
          resource.Type === "AWS::CertificateManager::Certificate"
      ) as any;

      expect(certificate.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Key: "Stack", Value: "ACM" }),
          expect.objectContaining({ Key: "Environment", Value: "test" }),
          expect.objectContaining({ Key: "ManagedBy", Value: "CDK" }),
          expect.objectContaining({ Key: "Domain", Value: testDomain }),
        ])
      );
    });

    test("tags include correct domain name", () => {
      const app = new cdk.App();
      const customDomain = "custom.example.com";

      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: customDomain,
        hostedZoneId: testHostedZoneId,
      });

      const template = Template.fromStack(stack);
      const resources = template.toJSON().Resources;
      const certificate = Object.values(resources).find(
        (resource: any) =>
          resource.Type === "AWS::CertificateManager::Certificate"
      ) as any;

      expect(certificate.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Key: "Domain", Value: customDomain }),
        ])
      );
    });
  });

  describe("Snapshots", () => {
    test("certificate stack matches snapshot", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
      });

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });

    test("certificate resource matches snapshot", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
      });

      const template = Template.fromStack(stack);
      const certificate = template.findResources(
        "AWS::CertificateManager::Certificate"
      );
      expect(certificate).toMatchSnapshot();
    });

    test("SSM parameter resource matches snapshot", () => {
      const app = new cdk.App();
      const stack = new CertificateStack(app, "TestAcmStack", {
        env: {
          account: TEST_CONSTANTS.DEFAULT_ACCOUNT,
          region: TEST_CONSTANTS.DEFAULT_REGION,
        },
        envName: "test",
        DomainName: testDomain,
        hostedZoneId: testHostedZoneId,
        storeCertificateArnInSsm: true,
      });

      const template = Template.fromStack(stack);
      const ssmParam = template.findResources("AWS::SSM::Parameter");
      expect(ssmParam).toMatchSnapshot();
    });
  });
});
