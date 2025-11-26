/** @format */

// Isolates ECR resources, enables independent deployment and testing

import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { EcrConstruct } from "../constructs/ecr-construct";

export interface EcrStackProps extends cdk.StackProps {
  envName: string; // Used for resource naming and identification
  pipelineAccount?: string; // CI/CD account for cross-account access
}

export class EcrStack extends cdk.Stack {
  // Allows other stacks to reference this repository
  public readonly repository: cdk.aws_ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    // Include envName to distinguish repos across environments
    const ecr = new EcrConstruct(this, "Ecr", {
      repositoryName: `app-repo-${props.envName}`,
      pipelineAccount: props.pipelineAccount,
    });

    this.repository = ecr.repository;

    // Store ECR repository information in SSM Parameter Store
    // Allows other pipelines (frontend, backend) to retrieve repository details
    new ssm.StringParameter(this, "RepositoryUriParameter", {
      parameterName: `/ecr/${props.envName}/repository-uri`,
      stringValue: ecr.repository.repositoryUri,
      description: `ECR Repository URI for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "RepositoryArnParameter", {
      parameterName: `/ecr/${props.envName}/repository-arn`,
      stringValue: ecr.repository.repositoryArn,
      description: `ECR Repository ARN for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "RepositoryNameParameter", {
      parameterName: `/ecr/${props.envName}/repository-name`,
      stringValue: ecr.repository.repositoryName,
      description: `ECR Repository Name for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // CloudFormation outputs for manual reference and cross-stack imports
    new cdk.CfnOutput(this, "RepositoryUri", {
      value: ecr.repository.repositoryUri,
      description: "ECR Repository URI",
      exportName: `${props.envName}-ecr-repository-uri`,
    });

    new cdk.CfnOutput(this, "RepositoryArn", {
      value: ecr.repository.repositoryArn,
      description: "ECR Repository ARN",
      exportName: `${props.envName}-ecr-repository-arn`,
    });

    new cdk.CfnOutput(this, "RepositoryName", {
      value: ecr.repository.repositoryName,
      description: "ECR Repository Name",
      exportName: `${props.envName}-ecr-repository-name`,
    });
  }
}
