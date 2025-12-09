/** @format */

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface SecurityGroupRule {
  peer: ec2.IPeer;
  port: ec2.Port;
  description?: string;
}

export interface SecurityGroupConstructProps {
  vpc: ec2.IVpc;
  groupName: string;
  description: string;
  allowAllOutbound?: boolean;
  ingressRules?: SecurityGroupRule[];
  egressRules?: SecurityGroupRule[];
}

/**
 * Reusable construct for creating Security Groups
 *
 * This construct simplifies security group creation with
 * a declarative approach to ingress and egress rules.
 *
 * Features:
 * - Declarative rule definition
 * - Automatic tagging
 * - Support for both ingress and egress rules
 * - Configurable outbound traffic
 */
export class SecurityGroupConstruct extends Construct {
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: SecurityGroupConstructProps
  ) {
    super(scope, id);

    const {
      vpc,
      groupName,
      description,
      allowAllOutbound = true,
      ingressRules = [],
      egressRules = [],
    } = props;

    // Create security group
    this.securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      securityGroupName: groupName,
      description,
      allowAllOutbound,
    });

    // Add ingress rules
    ingressRules.forEach((rule, index) => {
      this.securityGroup.addIngressRule(
        rule.peer,
        rule.port,
        rule.description || `Ingress rule ${index + 1}`
      );
    });

    // Add egress rules (if not allowing all outbound)
    if (!allowAllOutbound) {
      egressRules.forEach((rule, index) => {
        this.securityGroup.addEgressRule(
          rule.peer,
          rule.port,
          rule.description || `Egress rule ${index + 1}`
        );
      });
    }

    // Add tags
    cdk.Tags.of(this.securityGroup).add("Name", groupName);
  }

  /**
   * Add an ingress rule to the security group
   */
  public addIngressRule(
    peer: ec2.IPeer,
    port: ec2.Port,
    description?: string
  ): void {
    this.securityGroup.addIngressRule(peer, port, description);
  }

  /**
   * Add an egress rule to the security group
   */
  public addEgressRule(
    peer: ec2.IPeer,
    port: ec2.Port,
    description?: string
  ): void {
    this.securityGroup.addEgressRule(peer, port, description);
  }

  /**
   * Allow connections from another security group
   */
  public allowFrom(
    other: ec2.ISecurityGroup,
    port: ec2.Port,
    description?: string
  ): void {
    this.securityGroup.connections.allowFrom(other, port, description);
  }

  /**
   * Allow connections to another security group
   */
  public allowTo(
    other: ec2.ISecurityGroup,
    port: ec2.Port,
    description?: string
  ): void {
    this.securityGroup.connections.allowTo(other, port, description);
  }

  /**
   * Get the security group ID
   */
  public get securityGroupId(): string {
    return this.securityGroup.securityGroupId;
  }
}
