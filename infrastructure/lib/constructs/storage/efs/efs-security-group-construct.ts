/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface EfsSecurityGroupConstructProps {
  /**
   * VPC where the security group will be created
   */
  vpc: ec2.IVpc;

  /**
   * Environment name for resource naming and tagging
   */
  envName: string;

  /**
   * CIDR blocks allowed to access EFS
   * @default [vpc.vpcCidrBlock]
   */
  allowedCidrs?: string[];

  /**
   * Security groups allowed to access EFS
   */
  allowedSecurityGroups?: ec2.ISecurityGroup[];

  /**
   * Whether to allow all outbound traffic
   * @default false
   */
  allowAllOutbound?: boolean;
}

/**
 * Construct for creating a security group for EFS access
 */
export class EfsSecurityGroupConstruct extends Construct {
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: EfsSecurityGroupConstructProps
  ) {
    super(scope, id);

    const {
      vpc,
      envName,
      allowedCidrs = [vpc.vpcCidrBlock],
      allowedSecurityGroups = [],
      allowAllOutbound = false,
    } = props;

    // Create security group for EFS mount targets
    this.securityGroup = new ec2.SecurityGroup(this, "EfsMountTargetSg", {
      vpc,
      description: `EFS mount target security group for ${envName} monitoring`,
      allowAllOutbound,
    });

    // Add ingress rules for NFS traffic from allowed CIDRs
    allowedCidrs.forEach((cidr, index) => {
      this.securityGroup.addIngressRule(
        ec2.Peer.ipv4(cidr),
        ec2.Port.tcp(2049),
        `Allow NFS traffic from ${cidr}`
      );
    });

    // Add ingress rules for NFS traffic from allowed security groups
    allowedSecurityGroups.forEach((sg, index) => {
      this.securityGroup.addIngressRule(
        ec2.Peer.securityGroupId(sg.securityGroupId),
        ec2.Port.tcp(2049),
        `Allow NFS traffic from security group ${sg.securityGroupId}`
      );
    });

    // Add tags
    cdk.Tags.of(this.securityGroup).add(
      "Name",
      `${envName}-efs-mount-target-sg`
    );
    cdk.Tags.of(this.securityGroup).add("Environment", envName);
    cdk.Tags.of(this.securityGroup).add("Purpose", "EfsAccess");
    cdk.Tags.of(this.securityGroup).add("ManagedBy", "CDK");

    // Output security group ID
    new cdk.CfnOutput(this, "SecurityGroupId", {
      value: this.securityGroup.securityGroupId,
      description: `EFS Security Group ID for ${envName} monitoring`,
      exportName: `${cdk.Stack.of(this).stackName}-efs-sg-id`,
    });
  }
}
