/** @format */

import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { EcrConstruct } from "../../constructs/storage/ecr-construct";

export interface StorageStackProps extends cdk.StackProps {
  envName: string;
  pipelineAccount?: string;
}

/**
 * Storage Stack
 *
 * Creates storage resources including:
 * - ECR repository for container images
 * - Lifecycle policies
 * - Cross-account access for CI/CD
 * - SSM parameters for resource discovery
 *
 * This stack is independent and can be deployed in parallel with networking.
 */
export class StorageStack extends cdk.Stack {
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // Create ECR repository
    const ecrConstruct = new EcrConstruct(this, "Ecr", {
      repositoryName: `app-repo-${props.envName}`,
      pipelineAccount: props.pipelineAccount,
    });

    this.repository = ecrConstruct.repository;

    // Store ECR information in SSM Parameter Store
    new ssm.StringParameter(this, "RepositoryUriParameter", {
      parameterName: `/ecr/${props.envName}/repository-uri`,
      stringValue: this.repository.repositoryUri,
      description: `ECR Repository URI for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "RepositoryArnParameter", {
      parameterName: `/ecr/${props.envName}/repository-arn`,
      stringValue: this.repository.repositoryArn,
      description: `ECR Repository ARN for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "RepositoryNameParameter", {
      parameterName: `/ecr/${props.envName}/repository-name`,
      stringValue: this.repository.repositoryName,
      description: `ECR Repository Name for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // Outputs
    new cdk.CfnOutput(this, "RepositoryUri", {
      value: this.repository.repositoryUri,
      description: "ECR Repository URI",
      exportName: `${props.envName}-ecr-repository-uri`,
    });

    new cdk.CfnOutput(this, "RepositoryArn", {
      value: this.repository.repositoryArn,
      description: "ECR Repository ARN",
      exportName: `${props.envName}-ecr-repository-arn`,
    });

    new cdk.CfnOutput(this, "RepositoryName", {
      value: this.repository.repositoryName,
      description: "ECR Repository Name",
      exportName: `${props.envName}-ecr-repository-name`,
    });

    // Tags
    cdk.Tags.of(this).add("Stack", "Storage");
    cdk.Tags.of(this).add("Environment", props.envName);
  }
}
