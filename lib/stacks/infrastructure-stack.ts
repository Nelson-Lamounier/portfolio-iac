/** @format */

import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

import { VpcConstruct } from "../constructs/networking/vpc-construct";

export interface InfrastructureStackProps extends cdk.StackProps {
  envName: string;
  pipelineAccount?: string;
}

export class InfrastructureStack extends cdk.Stack {
  public readonly repository: cdk.aws_ecr.Repository;
  public readonly vpc: cdk.aws_ec2.IVpc;

  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);

    // Crate VPC(netwaorking foundation)
    const vpcConstruct = new VpcConstruct(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
    });
    this.vpc = vpcConstruct.vpc;
  }
}
