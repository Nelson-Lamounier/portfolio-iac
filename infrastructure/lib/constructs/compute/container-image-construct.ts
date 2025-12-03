/** @format */

import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";

export interface ContainerImageConstructProps {
  repositoryUri: string; // ECR repository URI from SSM or manual input
  imageTag?: string;
  defaultImage?: string;
}

/**
 * Construct that handles container image resolution
 *
 * Image Resolution:
 * - If IMAGE_TAG is set: Uses ECR image with that tag
 * - If IMAGE_TAG is not set: Falls back to ealen/echo-server (responds to all health checks)
 *
 * For initial deployment:
 * 1. Deploy infrastructure (uses fallback image with health checks)
 * 2. Build and push your frontend to ECR
 * 3. Redeploy with IMAGE_TAG set to your frontend image tag
 *
 * The fallback image (ealen/echo-server) is a simple HTTP server that:
 * - Responds to all paths (including /api/health)
 * - Returns 200 OK for health checks
 * - Allows infrastructure to deploy successfully
 * - Should be replaced with your real application ASAP
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

    const imageTagFromEnv = process.env.IMAGE_TAG;

    if (imageTagFromEnv) {
      // Use ECR image with specified tag
      this.imageTag = imageTagFromEnv;
      this.isEcrImage = true;
      const imageUri = `${props.repositoryUri}:${this.imageTag}`;
      console.log(`✓ Using ECR image: ${imageUri}`);
      this.containerImage = ecs.ContainerImage.fromRegistry(imageUri);
    } else {
      // Fallback to a simple health check server for initial deployment
      // ealen/echo-server responds to all paths including /api/health
      const defaultImage = props.defaultImage || "ealen/echo-server:latest";
      this.imageTag = defaultImage;
      this.isEcrImage = false;
      console.log("");
      console.log(" WARNING: No IMAGE_TAG specified, using fallback image");
      console.log(`   Image: ${this.imageTag}`);
      console.log("   This is a placeholder that responds to health checks.");
      console.log("   Deploy your real application when ready:");
      console.log("");
      console.log(
        "   1. Build your frontend: cd frontend && docker build -t portfolio:<tag> ."
      );
      console.log(
        "   2. Push to ECR: docker tag portfolio:<tag> <ECR_URI>:<tag> && docker push <ECR_URI>:<tag>"
      );
      console.log("   3. Redeploy: export IMAGE_TAG=<tag> && yarn deploy:dev");
      console.log("");
      this.containerImage = ecs.ContainerImage.fromRegistry(this.imageTag);
    }
  }
}
