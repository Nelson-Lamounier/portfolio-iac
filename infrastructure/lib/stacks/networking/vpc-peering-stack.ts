/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { VpcPeeringConstruct } from "../../constructs/networking/vpc-peering-construct";

export interface VpcPeeringStackProps extends cdk.StackProps {
  /**
   * The VPC in the current account (requester)
   */
  vpc: ec2.IVpc;

  /**
   * Configuration for peer accounts
   */
  peerAccounts: Array<{
    envName: string;
    accountId: string;
    vpcId: string;
    vpcCidr: string;
    roleArn: string;
  }>;

  /**
   * Environment name for the requester (e.g., 'pipeline')
   */
  envName: string;
}

/**
 * VPC Peering Stack
 *
 * Creates VPC peering connections from the pipeline account to multiple
 * target accounts (dev, staging, production).
 *
 * Prerequisites:
 * - VpcPeeringAcceptorRole must exist in each peer account
 * - VPC IDs and CIDRs must be known
 *
 * Usage:
 * ```typescript
 * new VpcPeeringStack(app, 'VpcPeeringStack-pipeline', {
 *   vpc: pipelineVpc,
 *   envName: 'pipeline',
 *   peerAccounts: [
 *     {
 *       envName: 'development',
 *       accountId: '123456789012',
 *       vpcId: 'vpc-xxxxx',
 *       vpcCidr: '10.1.0.0/16',
 *       roleArn: 'arn:aws:iam::123456789012:role/development-VpcPeeringAcceptorRole',
 *     },
 *   ],
 * });
 * ```
 */
export class VpcPeeringStack extends cdk.Stack {
  public readonly peeringConnections: Map<string, VpcPeeringConstruct>;

  constructor(scope: Construct, id: string, props: VpcPeeringStackProps) {
    super(scope, id, props);

    this.peeringConnections = new Map();

    // Create peering connection for each peer account
    props.peerAccounts.forEach((peer) => {
      const peering = new VpcPeeringConstruct(
        this,
        `PeeringTo${peer.envName}`,
        {
          vpc: props.vpc,
          peerVpcId: peer.vpcId,
          peerAccountId: peer.accountId,
          peerVpcCidr: peer.vpcCidr,
          envName: peer.envName,
          peeringName: `${props.envName}-to-${peer.envName}`,
          peerRoleArn: peer.roleArn,
        }
      );

      this.peeringConnections.set(peer.envName, peering);
    });

    // ========================================================================
    // TAGS
    // ========================================================================
    cdk.Tags.of(this).add("Stack", "VpcPeering");
    cdk.Tags.of(this).add("Environment", props.envName);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}
