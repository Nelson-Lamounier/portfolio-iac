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

    // Suppress CDK Nag warnings for ECS Auto Scaling Group and related resources
    NagSuppressions.addResourceSuppressions(
      this.asg,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "ECS Container Instance IAM role requires wildcard permissions (ecs:Submit*, ecs:Poll, etc.) and resource wildcards to communicate with ECS control plane and access ECR images. These are standard permissions for ECS EC2 instances as documented in AWS ECS best practices.",
          appliesTo: [
            "Action::ecs:Submit*",
            "Action::ecs:Poll",
            "Action::ecs:StartTelemetrySession",
            "Resource::*",
            {
              regex: "/^Resource::arn:aws:autoscaling:.*/",
            },
          ],
        },
        {
          id: "AwsSolutions-EC26",
          reason:
            "EBS encryption is managed at the account level via AWS Config or can be enabled per-environment. For development environments, unencrypted volumes reduce costs while maintaining rapid iteration.",
        },
        {
          id: "AwsSolutions-AS3",
          reason:
            "Auto Scaling Group notifications are not required for development environments. Production environments should enable SNS notifications for scaling events via monitoring stack.",
        },
        {
          id: "AwsSolutions-SNS3",
          reason:
            "SNS topic is used for internal ECS lifecycle hooks. SSL enforcement can be enabled in production if needed. The lifecycle hook topic is managed by CDK and used for draining ECS tasks during instance termination.",
        },
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AWS managed policy AWSLambdaBasicExecutionRole is used for the ECS drain hook Lambda function. This is a standard AWS managed policy for Lambda execution with CloudWatch Logs permissions.",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          ],
        },
        {
          id: "AwsSolutions-L1",
          reason:
            "Lambda runtime version is managed by CDK for the ECS drain hook function. CDK updates the runtime version automatically with new releases.",
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
