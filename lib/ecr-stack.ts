/** @format */

import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface EcrStackProps extends cdk.StackProps {
  envName: string;
  pipelineAccount?: string;
}

export class EcrStack extends cdk.Stack {
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, "AppRepository", {
      repositoryName: `app-repo-${props.envName}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      lifecycleRules: [
        {
          description: "Keep last 10 images",
          maxImageCount: 10,
          rulePriority: 1,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Grant pipeline account access if specified
    if (props.pipelineAccount) {
      this.repository.grantPullPush(
        new iam.AccountPrincipal(props.pipelineAccount)
      );
    }

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
  }
}
