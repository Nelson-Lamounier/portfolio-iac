/** @format */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { EcrConstruct } from "../constructs/ecr-construct";

export interface EcrStackProps extends cdk.StackProps {
  envName: string;
  pipelineAccount?: string;
}

export class EcrStack extends cdk.Stack {
  public readonly repository: cdk.aws_ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    // ECR repository
    const ecr = new EcrConstruct(this, "Ecr", {
      repositoryName: `app-repo-${props.envName}`,
      pipelineAccount: props.pipelineAccount,
    });

    this.repository = ecr.repository;

    // Outputs
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
  }
}
