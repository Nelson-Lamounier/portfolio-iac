/** @format */

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { SubnetConfiguration } from "./subnet-construct";

export interface VpcConstructProps {
  envName: string;
  vpcName?: string;
  cidr?: string;
  maxAzs?: number;
  natGateways?: number;
  subnetConfiguration?: SubnetConfiguration[];
  enableDnsHostnames?: boolean;
  enableDnsSupport?: boolean;
  enableVpcFlowLogs?: boolean;
}

/**
 * Enhanced VPC Construct with additional features
 *
 * This construct extends the basic VPC with:
 * - Custom CIDR configuration
 * - Flexible subnet configuration
 * - DNS settings
 * - VPC Flow Logs support
 * - Better tagging
 *
 * Features:
 * - Configurable CIDR block
 * - Multiple availability zones
 * - Optional NAT gateways
 * - Custom subnet configurations
 * - DNS hostname and support
 * - Automatic tagging
 */
export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly publicSubnets: ec2.ISubnet[];
  public readonly privateSubnets: ec2.ISubnet[];
  public readonly isolatedSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    const {
      envName,
      vpcName = `${envName}-vpc`,
      cidr = "10.0.0.0/16",
      maxAzs = 2,
      natGateways = 0,
      subnetConfiguration = [
        {
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
          mapPublicIpOnLaunch: true,
        },
        {
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      enableDnsHostnames = true,
      enableDnsSupport = true,
    } = props;

    // Create VPC
    this.vpc = new ec2.Vpc(this, "Vpc", {
      vpcName,
      ipAddresses: ec2.IpAddresses.cidr(cidr),
      maxAzs,
      natGateways,
      subnetConfiguration,
      enableDnsHostnames,
      enableDnsSupport,
      // Restrict default security group
      restrictDefaultSecurityGroup: true,
    });

    // Store subnet references
    this.publicSubnets = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;
    this.isolatedSubnets = this.vpc.isolatedSubnets;

    // Add tags
    cdk.Tags.of(this.vpc).add("Name", vpcName);
    cdk.Tags.of(this.vpc).add("Environment", envName);
    cdk.Tags.of(this.vpc).add("ManagedBy", "CDK");
  }

  /**
   * Get VPC ID
   */
  public get vpcId(): string {
    return this.vpc.vpcId;
  }

  /**
   * Get VPC CIDR
   */
  public get vpcCidrBlock(): string {
    return this.vpc.vpcCidrBlock;
  }

  /**
   * Get availability zones
   */
  public get availabilityZones(): string[] {
    return this.vpc.availabilityZones;
  }

  /**
   * Add interface endpoint
   */
  public addInterfaceEndpoint(
    id: string,
    service: ec2.IInterfaceVpcEndpointService,
    subnets?: ec2.SubnetSelection
  ): ec2.InterfaceVpcEndpoint {
    return this.vpc.addInterfaceEndpoint(id, {
      service,
      subnets,
    });
  }

  /**
   * Add gateway endpoint
   */
  public addGatewayEndpoint(
    id: string,
    service: ec2.IGatewayVpcEndpointService,
    subnets?: ec2.SubnetSelection[]
  ): ec2.GatewayVpcEndpoint {
    return this.vpc.addGatewayEndpoint(id, {
      service,
      subnets,
    });
  }
}
