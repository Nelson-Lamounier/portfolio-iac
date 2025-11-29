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
    // Use public registry if:
    // - imageTag is nginx:alpine (default)
    // - imageTag contains ":" (indicates registry/image:tag format like nginx:alpine)
    const isPublicRegistryImage =
      this.imageTag === defaultImage ||
      (this.imageTag.includes(":") && !this.imageTag.includes("/"));

    this.isEcrImage = !isPublicRegistryImage;

    // Create container image based on source
    if (this.isEcrImage) {
      // Use ECR image with specific tag
      console.log(
        `Using ECR image: ${props.repository.repositoryUri}:${this.imageTag}`
      );
      this.containerImage = ecs.ContainerImage.fromEcrRepository(
        props.repository,
        this.imageTag
      );
    } else {
      // Use public registry image (for initial deployment)
      console.log(`Using public registry image: ${this.imageTag}`);
      this.containerImage = ecs.ContainerImage.fromRegistry(this.imageTag);
    }
  }
}
