/** @format */

import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

import { VpcConstruct } from "./constructs/networking/vpc-construct";
import { EcrConstruct } from "./constructs/storage/ecr-construct";

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

    // Create ECR repository
    const ecrConstruct = new EcrConstruct(this, "Ecr", {
      repositoryName: `app-repo-${props.envName}`,
      pipelineAccount: props.pipelineAccount,
    });
    this.repository = ecrConstruct.repository;

    // Store VPC information in SSM Parameter Store
    new ssm.StringParameter(this, "VpcIdParameter", {
      parameterName: `/vpc/${props.envName}/vpc-id`,
      stringValue: vpcConstruct.vpc.vpcId,
      description: `VPC ID for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // Store ECR information in SSM Parameter Store
    new ssm.StringParameter(this, "RepositoryUriParameter", {
      parameterName: `/ecr/${props.envName}/repository-uri`,
      stringValue: ecrConstruct.repository.repositoryUri,
      description: `ECR Repository URI for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "RepositoryArnParameter", {
      parameterName: `/ecr/${props.envName}/repository-arn`,
      stringValue: ecrConstruct.repository.repositoryArn,
      description: `ECR Repository ARN for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "RespositoryNAmePArameter", {
      parameterName: `/ecr/${props.envName}/respository-name`,
      stringValue: ecrConstruct.repository.repositoryName,
      description: `ECR Repository NAme for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // CloudFormation outputs
    new cdk.CfnOutput(this, "VpcId", {
      value: vpcConstruct.vpc.vpcId,
      description: "VPC ID",
      exportName: `${props.envName}-vpc-cidr`,
    });

    new cdk.CfnOutput(this, "VpcCidr", {
      value: vpcConstruct.vpc.vpcCidrBlock,
      description: "VPC CIDR Block",
      exportName: `${props.envName}-vpc-cidr`,
    });

    new cdk.CfnOutput(this, "RepositoryUri", {
      value: ecrConstruct.repository.repositoryUri,
      description: "ECR Repository URI",
      exportName: `${props.envName}-ecr-repository-uri`,
    });

    new cdk.CfnOutput(this, "RespositoryArn", {
      value: ecrConstruct.repository.repositoryArn,
      description: "ECR Repository Arn",
      exportName: `${props.envName}-ecr-repository-arn`,
    });

    new cdk.CfnOutput(this, "RepositoryName", {
      value: ecrConstruct.repository.repositoryName,
      description: "ECR Repository Name",
      exportName: `${props.envName}-ecr-repositort-name`,
    });
  }
}
