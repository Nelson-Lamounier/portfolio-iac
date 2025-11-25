/** @format */

import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface EcrConstructProps {
  repositoryName: string;
  imageTagMutability?: ecr.TagMutability;
  lifecycleRules?: number;
  pipelineAccount?: string;
}

export class EcrConstruct extends Construct {
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrConstructProps) {
    super(scope, id);

    this.repository = new ecr.Repository(this, "Repository", {
      repositoryName: props.repositoryName,
      imageTagMutability:
        props.imageTagMutability || ecr.TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.RETAIN,
      imageScanOnPush: true,
    });

    // Add lifecycle rule to keep only recent images
    this.repository.addLifecycleRule({
      maxImageCount: props.lifecycleRules || 10,
      description: "Keep only recent images",
      rulePriority: 1,
    });

    // Grant pipeline account access if specified
    if (props.pipelineAccount) {
      this.repository.grantPullPush(
        new iam.AccountPrincipal(props.pipelineAccount)
      );
    }
  }
}
