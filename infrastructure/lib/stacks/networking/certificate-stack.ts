/** @format */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import { CertificateConstruct } from "../../constructs/networking/certificate-construct";

export interface CertificateConfig {
  domainName: string;
  hostedZoneId?: string;
  subjectAlternativeNames?: string[];
  includeWildcard?: boolean;
  certificateName?: string;
  tags?: { [key: string]: string };
}

export interface CertificateStackProps extends cdk.StackProps {
  certificates: CertificateConfig[];
  hostedZoneId?: string; // Default hosted zone ID for all certificates
}

export class CertificateStack extends cdk.Stack {
  public readonly certificates: Map<string, acm.ICertificate> = new Map();
  public readonly hostedZones: Map<string, route53.IHostedZone> = new Map();
  public readonly certificateConstructs: Map<string, CertificateConstruct> =
    new Map();

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    // Create certificates for each domain configuration
    for (const certConfig of props.certificates) {
      this.createCertificate(certConfig, props.hostedZoneId);
    }

    // Output summary of created certificates
    new cdk.CfnOutput(this, "CertificateSummary", {
      value: `Created ${this.certificates.size} certificates`,
      description: "Summary of created certificates",
    });
  }

  private createCertificate(
    certConfig: CertificateConfig,
    defaultHostedZoneId?: string
  ): void {
    const domainName = certConfig.domainName;
    const hostedZoneId = certConfig.hostedZoneId || defaultHostedZoneId;

    // Create the certificate construct
    const certificateConstruct = new CertificateConstruct(
      this,
      `CertificateConstruct-${certConfig.certificateName || domainName}`,
      {
        domainName: domainName,
        hostedZoneId: hostedZoneId,
        subjectAlternativeNames: certConfig.subjectAlternativeNames,
        includeWildcard: certConfig.includeWildcard,
        tags: certConfig.tags,
      }
    );

    // Store references for later use
    this.certificateConstructs.set(domainName, certificateConstruct);
    this.certificates.set(domainName, certificateConstruct.certificate);
    this.hostedZones.set(domainName, certificateConstruct.hostedZone);

    // Create stack-level outputs with export names
    // Replace periods with hyphens in export names to comply with CloudFormation requirements
    const safeDomainName = domainName.replace(/\./g, "-");

    new cdk.CfnOutput(this, `CertificateArn-${domainName}`, {
      value: certificateConstruct.certificateArn,
      description: `Certificate ARN for ${domainName}`,
      exportName: `${this.stackName}-CertificateArn-${safeDomainName}`,
    });

    new cdk.CfnOutput(this, `CertificateDomain-${domainName}`, {
      value: domainName,
      description: `Certificate domain name for ${domainName}`,
      exportName: `${this.stackName}-CertificateDomain-${safeDomainName}`,
    });

    if (certificateConstruct.subjectAlternativeNames.length > 0) {
      new cdk.CfnOutput(this, `CertificateSANs-${domainName}`, {
        value: certificateConstruct.sanList,
        description: `Subject Alternative Names for ${domainName}`,
        exportName: `${this.stackName}-CertificateSANs-${safeDomainName}`,
      });
    }

    new cdk.CfnOutput(this, `HostedZoneId-${domainName}`, {
      value: certificateConstruct.hostedZoneId,
      description: `Hosted Zone ID for ${domainName}`,
      exportName: `${this.stackName}-HostedZoneId-${safeDomainName}`,
    });
  }

  /**
   * Get a certificate for a domain
   */
  public getCertificate(domainName: string): acm.ICertificate | undefined {
    return this.certificates.get(domainName);
  }

  /**
   * Get a hosted zone for a domain
   */
  public getHostedZone(domainName: string): route53.IHostedZone | undefined {
    return this.hostedZones.get(domainName);
  }

  /**
   * Get a certificate construct for a domain
   */
  public getCertificateConstruct(
    domainName: string
  ): CertificateConstruct | undefined {
    return this.certificateConstructs.get(domainName);
  }

  /**
   * Get all certificates
   */
  public getAllCertificates(): Map<string, acm.ICertificate> {
    return this.certificates;
  }

  /**
   * Get all hosted zones
   */
  public getAllHostedZones(): Map<string, route53.IHostedZone> {
    return this.hostedZones;
  }

  /**
   * Get all certificate constructs
   */
  public getAllCertificateConstructs(): Map<string, CertificateConstruct> {
    return this.certificateConstructs;
  }
}
