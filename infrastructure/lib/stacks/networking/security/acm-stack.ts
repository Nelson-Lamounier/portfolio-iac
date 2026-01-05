/** @format */

import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

import { AcmCertificateConstruct } from "../../../constructs/networking/security/acm-certificate-construct";
import { SuppressionManager } from "../../../cdk-nag";

export interface AcmStackProps extends cdk.StackProps {
  envName: string; // Environment name (e.g., 'development', 'staging', 'production')
  DomainName: string; // Domain name for the certificate
  subjectAlternativeNames?: string[]; // Additional domain names (Subject Alternative Names)

  /**
   * Route 53 Hosted Zone ID for automatic DNS validation
   * If not provided, manual DNS validation will be required
   */
  hostedZoneId?: string;
  hostedZoneName?: string; // Route 53 Hosted Zone Name for automatic DNS validation

  /**
   * Existing certificate ARN to import instead of creating new
   * If provided, no new certificate will be created
   */
  existingCertificateArn?: string; //
  storeCertificateArnInSsm?: boolean; // Whether to store the certificate ARN in SSM Parameter Store

  /**
   * SSM parameter name for storing certificate ARN
   * @default "/portfolio/domain/acm-arn"
   */
  ssmParameterName?: string; // SSM parameter name for storing certificate ARN
  enableDeletionProtection?: boolean; // Whether to enable deletion protection
}

/**
 * Stack for managing ACM certificates
 *
 * This stack creates and manages SSL/TLS certificates using AWS Certificate Manager.
 * It supports automatic DNS validation via Route 53 or manual validation.
 *
 * Features:
 * - Creates ACM certificates with DNS validation
 * - Automatic validation via Route 53 (optional)
 * - Stores certificate ARN in SSM Parameter Store
 * - Support for wildcard certificates
 * - Import existing certificates
 * - Proper tagging and outputs
 *
 * Usage Examples:
 *
 * @example
 * // Create new certificate with automatic DNS validation
 * new AcmStack(app, 'AcmStack-production', {
 *   envName: 'production',
 *   domainName: 'example.com',
 *   subjectAlternativeNames: ['*.example.com'],
 *   hostedZoneId: 'Z1234567890ABC',
 *   storeCertificateArnInSsm: true,
 * });
 *
 * @example
 * // Import existing certificate
 * new AcmStack(app, 'AcmStack-production', {
 *   envName: 'production',
 *   domainName: 'example.com',
 *   existingCertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc123',
 *   storeCertificateArnInSsm: true,
 * });
 *
 * @example
 * // Create certificate with manual DNS validation
 * new AcmStack(app, 'AcmStack-production', {
 *   envName: 'production',
 *   domainName: 'example.com',
 *   subjectAlternativeNames: ['*.example.com'],
 *   // No hostedZoneId - manual validation required
 * });
 */
export class CertificateStack extends cdk.Stack {
  public readonly certificate: AcmCertificateConstruct;
  public readonly certificateArn: string;
  public readonly ssmParameter?: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: AcmStackProps) {
    super(scope, id, props);

    const {
      envName,
      DomainName,
      subjectAlternativeNames,
      hostedZoneId,
      hostedZoneName,
      existingCertificateArn,
      storeCertificateArnInSsm = true,
      ssmParameterName = "/portfolio/domain/acm-arn",
      enableDeletionProtection = envName === "production",
    } = props;

    // Validate inputs
    if (!DomainName && !existingCertificateArn) {
      throw new Error(
        "Either DomainName or existingCertificateArn is required"
      );
    }

    // Lookup hosted zone if name is provided
    let hostedZone: route53.IHostedZone | undefined;
    if (hostedZoneId) {
      hostedZone = route53.HostedZone.fromHostedZoneAttributes(
        this,
        "HostedZone",
        {
          hostedZoneId,
          zoneName: DomainName,
        }
      );
    } else if (hostedZoneName) {
      hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
        domainName: hostedZoneName,
      });
    }

    // Create or import certificate
    this.certificate = new AcmCertificateConstruct(this, "Certificate", {
      domainName: DomainName || "placeholder.com", // Placeholder for imported certs
      subjectAlternativeNames,
      hostedZone,
      envName,
      existingCertificateArn,
      enableDnsValidation: !!hostedZone,
    });

    this.certificateArn = this.certificate.certificateArn;

    // Store certificate ARN in SSM Parameter Store
    if (storeCertificateArnInSsm) {
      this.ssmParameter = new ssm.StringParameter(this, "CertificateArnParam", {
        parameterName: ssmParameterName,
        stringValue: this.certificateArn,
        description: `ACM Certificate ARN for ${DomainName} (${envName})`,
        tier: ssm.ParameterTier.STANDARD,
      });

      // Output SSM parameter name
      new cdk.CfnOutput(this, "SsmParameterName", {
        value: this.ssmParameter.parameterName,
        description: "SSM Parameter name containing certificate ARN",
        exportName: `${envName}-certificate-ssm-param`,
      });
    }

    // Apply deletion protection for production
    if (enableDeletionProtection) {
      // Note: ACM certificates don't have direct deletion protection
      // but we can apply termination protection to the stack
      this.terminationProtection = true;
    }

    // Additional outputs
    new cdk.CfnOutput(this, "DomainName", {
      value: DomainName || "imported-certificate",
      description: "Primary domain name",
      exportName: `${envName}-certificate-domain-name`,
    });

    if (hostedZone) {
      new cdk.CfnOutput(this, "HostedZoneId", {
        value: hostedZone.hostedZoneId,
        description: "Route 53 Hosted Zone ID",
        exportName: `${envName}-hosted-zone-id`,
      });
    }

    // Apply CDK Nag suppressions
    SuppressionManager.applyToStack(this, "CertificateStack", envName);

    // Resource tagging
    cdk.Tags.of(this).add("Stack", "ACM");
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
    cdk.Tags.of(this).add("Domain", DomainName || "imported");
  }

  /**
   * Get the certificate ARN
   */
  public getCertificateArn(): string {
    return this.certificateArn;
  }

  /**
   * Get the SSM parameter containing the certificate ARN
   */
  public getSsmParameter(): ssm.IStringParameter | undefined {
    return this.ssmParameter;
  }
}
