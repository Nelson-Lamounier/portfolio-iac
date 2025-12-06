/** @format */

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import { Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { SuppressionManager } from "../../../cdk-nag";

export interface EcsClusterConstructProps {
  vpc: ec2.IVpc;
  envName: string;
  clusterName?: string;
  instanceType?: ec2.InstanceType;
  minCapacity?: number;
  maxCapacity?: number;
  desiredCapacity?: number;
  usePublicSubnets?: boolean;
}

/**
 * Reusable construct for creating an ECS Cluster with EC2 capacity
 * Handles cluster creation and Auto Scaling Group configuration
 */
export class EcsClusterConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly asg: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: EcsClusterConstructProps) {
    super(scope, id);

    // Create ECS Cluster
    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc: props.vpc,
      clusterName: props.clusterName || `ecs-cluster-${props.envName}`,
    });

    // Tag cluster
    Tags.of(this.cluster).add("Environment", props.envName);
    Tags.of(this.cluster).add("ManagedBy", "CDK");

    // Add EC2 Capacity
    this.asg = this.cluster.addCapacity("DefaultAutoScalingGroup", {
      instanceType: props.instanceType || new ec2.InstanceType("t3.micro"),
      minCapacity: props.minCapacity || 1,
      maxCapacity: props.maxCapacity || 2,
      desiredCapacity: props.desiredCapacity || 1,

      // Place in PUBLIC or PRIVATE subnets based on configuration
      vpcSubnets: {
        subnetType:
          props.usePublicSubnets !== false
            ? ec2.SubnetType.PUBLIC
            : ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },

      // Auto-assign public IP if using public subnets
      associatePublicIpAddress: props.usePublicSubnets !== false,
    });

    // Apply CDK Nag suppressions for Auto Scaling Group and all child resources
    // These suppressions are managed centrally via SuppressionManager
    NagSuppressions.addResourceSuppressions(
      this.asg,
      [
        ...SuppressionManager.getCdkManagedResourceSuppressions(),
        ...SuppressionManager.getAutoScalingSuppressions(),
        ...SuppressionManager.getEcsServiceSuppressions(),
        {
          id: "AwsSolutions-SNS3",
          reason:
            "SNS topic is used for internal ECS lifecycle hooks managed by CDK. SSL enforcement is handled by AWS internal services. The lifecycle hook topic is used for draining ECS tasks during instance termination.",
        },
      ],
      true // Apply to all children including the instance role, Lambda functions, and SNS topics
    );

    // Tag Auto Scaling Group
    Tags.of(this.asg).add("Environment", props.envName);
    Tags.of(this.asg).add("ManagedBy", "CDK");
  }

  /**
   * Allow inbound traffic on specific port within the cluster
   */
  public allowInternalPort(port: number, description: string): void {
    this.asg.connections.allowInternally(ec2.Port.tcp(port), description);
  }
}
