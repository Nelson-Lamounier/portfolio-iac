/** @format */

// lib/constructs/certificate-construct.ts

/** @format */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";

export interface CertificateConstructProps {
  domainName: string;
  hostedZoneId?: string;
  subjectAlternativeNames?: string[];
  includeWildcard?: boolean;
  certificateName?: string;
  tags?: { [key: string]: string };
  hostedZone?: route53.IHostedZone; // Allow passing existing hosted zone
}

export class CertificateConstruct extends Construct {
  public readonly certificate: acm.ICertificate;
  public readonly hostedZone: route53.IHostedZone;
  public readonly subjectAlternativeNames: string[];
  public readonly domainName: string; // Add this line

  constructor(scope: Construct, id: string, props: CertificateConstructProps) {
    super(scope, id);

    this.domainName = props.domainName; // Store the domain name

    // Get or create the hosted zone
    if (props.hostedZone) {
      // Use provided hosted zone
      this.hostedZone = props.hostedZone;
    } else if (props.hostedZoneId) {
      // Use existing hosted zone by ID
      this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(
        this,
        "ImportedHostedZone",
        {
          zoneName: props.domainName,
          hostedZoneId: props.hostedZoneId,
        }
      );
    } else {
      // Look up hosted zone by domain name
      try {
        this.hostedZone = route53.HostedZone.fromLookup(
          this,
          "LookedUpHostedZone",
          {
            domainName: props.domainName,
          }
        );
      } catch (error) {
        throw new Error(
          `Could not find hosted zone for ${props.domainName}. Please provide hostedZoneId, hostedZone, or ensure the hosted zone exists.`
        );
      }
    }

    // Build subject alternative names
    this.subjectAlternativeNames = [];

    // Add wildcard if requested
    if (props.includeWildcard !== false) {
      this.subjectAlternativeNames.push(`*.${props.domainName}`);
    }

    // Add custom subject alternative names
    if (props.subjectAlternativeNames) {
      this.subjectAlternativeNames.push(...props.subjectAlternativeNames);
    }

    // Create the certificate
    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
      subjectAlternativeNames:
        this.subjectAlternativeNames.length > 0
          ? this.subjectAlternativeNames
          : undefined,
    });

    // Apply tags if provided
    if (props.tags) {
      Object.entries(props.tags).forEach(([key, value]) => {
        cdk.Tags.of(this.certificate).add(key, value);
      });
    }

    // Output certificate details
    new cdk.CfnOutput(this, "CertificateArn", {
      value: this.certificate.certificateArn,
      description: `Certificate ARN for ${props.domainName}`,
    });

    new cdk.CfnOutput(this, "CertificateDomain", {
      value: props.domainName,
      description: `Certificate domain name for ${props.domainName}`,
    });

    // Output subject alternative names if any
    if (this.subjectAlternativeNames.length > 0) {
      new cdk.CfnOutput(this, "CertificateSANs", {
        value: this.subjectAlternativeNames.join(", "),
        description: `Subject Alternative Names for ${props.domainName}`,
      });
    }

    // Output hosted zone information
    new cdk.CfnOutput(this, "HostedZoneId", {
      value: this.hostedZone.hostedZoneId,
      description: `Hosted Zone ID for ${props.domainName}`,
    });

    // Output name servers if available
    if (this.hostedZone.hostedZoneNameServers) {
      new cdk.CfnOutput(this, "NameServers", {
        value: this.hostedZone.hostedZoneNameServers.join(", "),
        description: `Name servers for ${props.domainName}`,
      });
    }
  }

  /**
   * Get the certificate ARN
   */
  public get certificateArn(): string {
    return this.certificate.certificateArn;
  }

  /**
   * Get the hosted zone ID
   */
  public get hostedZoneId(): string {
    return this.hostedZone.hostedZoneId;
  }

  /**
   * Check if the certificate includes a wildcard
   */
  public get hasWildcard(): boolean {
    return this.subjectAlternativeNames.some((san) => san.startsWith("*."));
  }

  /**
   * Get all subject alternative names as a formatted string
   */
  public get sanList(): string {
    return this.subjectAlternativeNames.join(", ");
  }
}
