/** @format */

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import { Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";

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

    // Suppress CDK Nag warnings for ECS instance role wildcard permissions
    // The ECS agent requires these permissions to communicate with ECS control plane
    NagSuppressions.addResourceSuppressions(
      this.asg,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "ECS Container Instance IAM role requires wildcard permissions (ecs:Submit*, ecs:Poll, etc.) to communicate with ECS control plane. These are standard permissions for ECS EC2 instances.",
          appliesTo: [
            "Action::ecs:Submit*",
            "Action::ecs:Poll",
            "Action::ecs:StartTelemetrySession",
          ],
        },
      ],
      true // Apply to all children including the instance role
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
