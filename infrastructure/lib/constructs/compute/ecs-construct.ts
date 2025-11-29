/** @format */

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import { Stack, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface EcsConstructProps {
  vpc: ec2.IVpc;
  envName: string; // Environment name for tagging
  containerImage: ecs.ContainerImage; // ECR image (required)
  instanceType?: ec2.InstanceType;
  minCapacity?: number;
  maxCapacity?: number;
  desiredCapacity?: number;
  containerPort?: number;
  cpu?: number;
  memoryLimitMiB?: number;
}

export class EcsConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly asg: autoscaling.AutoScalingGroup;
  public readonly service: ecs.Ec2Service;
  public readonly taskDefinition: ecs.Ec2TaskDefinition;

  constructor(scope: Construct, id: string, props: EcsConstructProps) {
    super(scope, id);

    // 1. Create ECS Cluster
    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc: props.vpc,
      clusterName: `ecs-cluster-${props.envName}`,
    });

    // Tag cluster
    Tags.of(this.cluster).add("Environment", props.envName);
    Tags.of(this.cluster).add("ManagedBy", "CDK");

    // 2. Add EC2 Capacity in PUBLIC subnets
    this.asg = this.cluster.addCapacity("DefaultAutoScalingGroup", {
      instanceType: props.instanceType || new ec2.InstanceType("t3.nano"),
      minCapacity: props.minCapacity || 1,
      maxCapacity: props.maxCapacity || 2,
      desiredCapacity: props.desiredCapacity || 1,

      // Place in PUBLIC subnets (no NAT gateway needed)
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },

      // Auto-assign public IP for internet access
      associatePublicIpAddress: true,
    });

    // Tag Auto Scaling Group
    Tags.of(this.asg).add("Environment", props.envName);
    Tags.of(this.asg).add("ManagedBy", "CDK");

    // 3. Create Task Definition (EC2 type)
    this.taskDefinition = new ecs.Ec2TaskDefinition(this, "TaskDef", {
      networkMode: ecs.NetworkMode.BRIDGE, // Default for EC2
    });

    // Tag task definition
    Tags.of(this.taskDefinition).add("Environment", props.envName);
    Tags.of(this.taskDefinition).add("ManagedBy", "CDK");

    // 4. Add Container to Task Definition
    const container = this.taskDefinition.addContainer("app", {
      image: props.containerImage, // Use ECR image
      cpu: props.cpu || 256,
      memoryLimitMiB: props.memoryLimitMiB || 512,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `ecs-${props.envName}`,
      }),
    });

    // Add port mapping with DYNAMIC host port
    // hostPort: 0 allows multiple containers on same EC2 instance
    container.addPortMappings({
      containerPort: props.containerPort || 80,
      hostPort: 0, // Dynamic port mapping
      protocol: ecs.Protocol.TCP,
    });

    // 5. Create ECS Service
    this.service = new ecs.Ec2Service(this, "Service", {
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: props.desiredCapacity || 1,
      serviceName: `ecs-service-${props.envName}`,

      // Placement strategy for better distribution
      placementStrategies: [
        ecs.PlacementStrategy.spreadAcrossInstances(),
        ecs.PlacementStrategy.packedByCpu(),
      ],
    });

    // Tag service
    Tags.of(this.service).add("Environment", props.envName);
    Tags.of(this.service).add("ManagedBy", "CDK");
    Tags.of(this.service).add("Service", "ECS");
  }
}
