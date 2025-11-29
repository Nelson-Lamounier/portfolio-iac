/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { EcsConstruct } from "../../constructs/compute/ecs-construct";
import { ContainerImageConstruct } from "../../constructs/compute/container-image-construct";

export interface ComputeStackProps extends cdk.StackProps {
  envName: string;
  vpc: ec2.IVpc;
  repository: ecr.Repository;
  instanceType?: ec2.InstanceType;
  minCapacity?: number;
  maxCapacity?: number;
  desiredCapacity?: number;
  memoryReservationMiB?: number; // Soft memory limit
  memoryLimitMiB?: number; // Hard memory limit (optional)
  cpu?: number; // CPU units
}

/**
 * Compute Stack
 *
 * Creates compute resources including:
 * - ECS cluster with EC2 capacity
 * - ECS service and task definition
 * - Container image resolution
 * - Auto-scaling configuration
 * - SSM parameters for resource discovery
 *
 * This stack depends on:
 * - NetworkingStack (for VPC)
 * - StorageStack (for ECR repository)
 */
export class ComputeStack extends cdk.Stack {
  public readonly cluster: ecs.ICluster;
  public readonly service: ecs.IService;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // Resolve container image (ECR or public registry)
    const containerImageConstruct = new ContainerImageConstruct(
      this,
      "ContainerImage",
      {
        repository: props.repository,
      }
    );

    // Create ECS Cluster with EC2 capacity
    const ecsConstruct = new EcsConstruct(this, "Ecs", {
      vpc: props.vpc,
      envName: props.envName,
      instanceType: props.instanceType || new ec2.InstanceType("t3.nano"),
      minCapacity: props.minCapacity ?? 1,
      maxCapacity: props.maxCapacity ?? 1,
      desiredCapacity: props.desiredCapacity ?? 1,
      containerImage: containerImageConstruct.containerImage,
      containerPort: 3000, // Next.js runs on port 3000
      // Memory configuration
      memoryReservationMiB: props.memoryReservationMiB ?? 512, // Soft limit
      memoryLimitMiB: props.memoryLimitMiB, // Hard limit (optional)
      cpu: props.cpu,
    });

    this.cluster = ecsConstruct.cluster;
    this.service = ecsConstruct.service;

    // Store ECS information in SSM Parameter Store
    new ssm.StringParameter(this, "EcsClusterNameParameter", {
      parameterName: `/ecs/${props.envName}/cluster-name`,
      stringValue: this.cluster.clusterName,
      description: `ECS Cluster Name for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "EcsClusterArnParameter", {
      parameterName: `/ecs/${props.envName}/cluster-arn`,
      stringValue: this.cluster.clusterArn,
      description: `ECS Cluster ARN for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "EcsServiceNameParameter", {
      parameterName: `/ecs/${props.envName}/service-name`,
      stringValue: this.service.serviceName,
      description: `ECS Service Name for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // Outputs
    new cdk.CfnOutput(this, "EcsClusterName", {
      value: this.cluster.clusterName,
      description: "ECS Cluster Name",
      exportName: `${props.envName}-ecs-cluster-name`,
    });

    new cdk.CfnOutput(this, "EcsClusterArn", {
      value: this.cluster.clusterArn,
      description: "ECS Cluster ARN",
      exportName: `${props.envName}-ecs-cluster-arn`,
    });

    new cdk.CfnOutput(this, "EcsServiceName", {
      value: this.service.serviceName,
      description: "ECS Service Name",
      exportName: `${props.envName}-ecs-service-name`,
    });

    new cdk.CfnOutput(this, "ContainerImageSource", {
      value: containerImageConstruct.isEcrImage ? "ECR" : "Public Registry",
      description: "Container Image Source",
    });

    new cdk.CfnOutput(this, "ImageTag", {
      value: containerImageConstruct.imageTag,
      description: "Container Image Tag",
    });

    // Tags
    cdk.Tags.of(this).add("Stack", "Compute");
    cdk.Tags.of(this).add("Environment", props.envName);
  }
}
