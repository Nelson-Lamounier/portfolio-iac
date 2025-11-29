/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { VpcConstruct } from "../../constructs/networking/vpc-construct";

export interface NetworkingStackProps extends cdk.StackProps {
  envName: string;
  maxAzs?: number;
  natGateways?: number;
}

/**
 * Networking Stack
 *
 * Creates the foundational network infrastructure including:
 * - VPC with public/private subnets
 * - Internet Gateway
 * - Route tables
 * - NAT Gateways (optional)
 *
 * This stack should be deployed first as other stacks depend on it.
 */
export class NetworkingStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props: NetworkingStackProps) {
    super(scope, id, props);

    // Create VPC
    const vpcConstruct = new VpcConstruct(this, "Vpc", {
      maxAzs: props.maxAzs || 2,
      natGateways: props.natGateways ?? 0, // Default: 0 for cost optimization
    });

    this.vpc = vpcConstruct.vpc;

    // Outputs
    new cdk.CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId,
      description: "VPC ID",
      exportName: `${props.envName}-vpc-id`,
    });

    new cdk.CfnOutput(this, "VpcCidr", {
      value: this.vpc.vpcCidrBlock,
      description: "VPC CIDR Block",
      exportName: `${props.envName}-vpc-cidr`,
    });

    // Tags
    cdk.Tags.of(this).add("Stack", "Networking");
    cdk.Tags.of(this).add("Environment", props.envName);
  }
}
