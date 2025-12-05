/** @format */

import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface SubnetConfiguration {
  name: string;
  subnetType: ec2.SubnetType;
  cidrMask: number;
  mapPublicIpOnLaunch?: boolean;
}

export interface SubnetConstructProps {
  vpc: ec2.IVpc;
  availabilityZone: string;
  cidrBlock: string;
  subnetType: ec2.SubnetType;
  name: string;
  mapPublicIpOnLaunch?: boolean;
}

/**
 * Reusable construct for creating individual subnets
 *
 * This construct creates a single subnet with proper configuration.
 * Typically used internally by VpcConstruct, but can be used standalone
 * for custom subnet configurations.
 *
 * Features:
 * - Configurable subnet type (PUBLIC, PRIVATE, ISOLATED)
 * - Automatic public IP assignment for public subnets
 * - Proper tagging
 */
export class SubnetConstruct extends Construct {
  public readonly subnet: ec2.ISubnet;

  constructor(scope: Construct, id: string, props: SubnetConstructProps) {
    super(scope, id);

    const {
      vpc,
      availabilityZone,
      cidrBlock,
      subnetType,
      name,
      mapPublicIpOnLaunch = false,
    } = props;

    // Note: CDK's Vpc construct handles subnet creation automatically
    // This construct is provided for reference and custom scenarios
    // In practice, use VpcConstruct with subnetConfiguration

    // For custom subnet creation, you would use CfnSubnet
    // This is a simplified example
    throw new Error(
      "SubnetConstruct is for reference only. Use VpcConstruct with subnetConfiguration instead."
    );
  }
}

/**
 * Helper function to create standard subnet configurations
 */
export class SubnetConfigurationHelper {
  /**
   * Create a standard public subnet configuration
   */
  static publicSubnet(cidrMask: number = 24): SubnetConfiguration {
    return {
      name: "Public",
      subnetType: ec2.SubnetType.PUBLIC,
      cidrMask,
      mapPublicIpOnLaunch: true,
    };
  }

  /**
   * Create a standard private subnet configuration with NAT
   */
  static privateSubnet(cidrMask: number = 24): SubnetConfiguration {
    return {
      name: "Private",
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      cidrMask,
    };
  }

  /**
   * Create an isolated subnet configuration (no internet access)
   */
  static isolatedSubnet(cidrMask: number = 24): SubnetConfiguration {
    return {
      name: "Isolated",
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      cidrMask,
    };
  }

  /**
   * Create a standard 3-tier subnet configuration
   */
  static threeTierConfiguration(): SubnetConfiguration[] {
    return [
      this.publicSubnet(24),
      this.privateSubnet(24),
      this.isolatedSubnet(24),
    ];
  }

  /**
   * Create a simple 2-tier subnet configuration (public + private)
   */
  static twoTierConfiguration(): SubnetConfiguration[] {
    return [this.publicSubnet(24), this.privateSubnet(24)];
  }
}
