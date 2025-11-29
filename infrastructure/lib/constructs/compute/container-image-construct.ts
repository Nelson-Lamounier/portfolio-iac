/** @format */

import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";

export interface ContainerImageConstructProps {
  repository: ecr.Repository;
  imageTag?: string;
  defaultImage?: string;
}

/**
 * Construct that handles container image resolution
 *
 * This construct determines whether to use an ECR image or a public registry image
 * based on the IMAGE_TAG environment variable.
 *
 * Usage:
 * - For initial deployment (no ECR image yet): Uses nginx:alpine
 * - For production deployments: Uses ECR image with specific tag (commit SHA, version, etc.)
 */
export class ContainerImageConstruct extends Construct {
  public readonly containerImage: ecs.ContainerImage;
  public readonly imageTag: string;
  public readonly isEcrImage: boolean;

  constructor(
    scope: Construct,
    id: string,
    props: ContainerImageConstructProps
  ) {
    super(scope, id);

    // Get image tag from environment variable or use default
    const defaultImage = props.defaultImage || "nginx:alpine";
    this.imageTag = props.imageTag || process.env.IMAGE_TAG || defaultImage;

    // Determine if we're using ECR or public registry
    this.isEcrImage = this.imageTag !== defaultImage;

    // Create container image based on source
    if (this.isEcrImage) {
      // Use ECR image with specific tag
      this.containerImage = ecs.ContainerImage.fromEcrRepository(
        props.repository,
        this.imageTag
      );
    } else {
      // Use public registry image (for initial deployment)
      this.containerImage = ecs.ContainerImage.fromRegistry(this.imageTag);
    }
  }
}
