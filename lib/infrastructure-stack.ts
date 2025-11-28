/** @format */

import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

import { VpcConstruct } from "./constructs/networking/vpc-construct";
import { EcrConstruct } from "./constructs/storage/ecr-construct";
import { EcsConstruct } from "./constructs/compute/ecs-construct";
import { MonitoringConstruct } from "./constructs/monitoring/monitoring-construct";
import { EventBridgeConstruct } from "./constructs/monitoring/eventbridge-construct";
import * as logs from "aws-cdk-lib/aws-logs";

export interface InfrastructureStackProps extends cdk.StackProps {
  envName: string;
  pipelineAccount?: string;
  enableMonitoring?: boolean;
  enableEventBridge?: boolean;
  alertEmail?: string;
}

export class InfrastructureStack extends cdk.Stack {
  public readonly repository: cdk.aws_ecr.Repository;
  public readonly vpc: cdk.aws_ec2.IVpc;
  public readonly ecsCluster: cdk.aws_ecs.ICluster;

  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);

    // Crate VPC(netwaorking foundation)
    const vpcConstruct = new VpcConstruct(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
    });
    this.vpc = vpcConstruct.vpc;

    // Create ECR repository
    const ecrConstruct = new EcrConstruct(this, "Ecr", {
      repositoryName: `app-repo-${props.envName}`,
      pipelineAccount: props.pipelineAccount,
    });
    this.repository = ecrConstruct.repository;

    // Create ECS Cluster with EC2 capacity
    const ecsConstruct = new EcsConstruct(this, "Ecs", {
      vpc: vpcConstruct.vpc,
      envName: props.envName,
      instanceType: new cdk.aws_ec2.InstanceType("t3.nano"),
      minCapacity: 1,
      maxCapacity: 2,
      desiredCapacity: 1,
      // Use ECR image
      containerImage: cdk.aws_ecs.ContainerImage.fromEcrRepository(
        ecrConstruct.repository,
        "latest"
      ),
    });
    this.ecsCluster = ecsConstruct.cluster;

    // Create Monitoring (optional)
    if (props.enableMonitoring) {
      const monitoring = new MonitoringConstruct(this, "Monitoring", {
        envName: props.envName,
        ecsClusterName: ecsConstruct.cluster.clusterName,
        ecsServiceName: ecsConstruct.service.serviceName,
        alertEmail: props.alertEmail,
        enableDashboard: props.envName === "production",
        logRetentionDays:
          props.envName === "production"
            ? logs.RetentionDays.ONE_MONTH
            : logs.RetentionDays.ONE_WEEK,
      });

      // Create EventBridge cross-account monitoring (optional)
      if (props.enableEventBridge) {
        new EventBridgeConstruct(this, "EventBridge", {
          envName: props.envName,
          isPipelineAccount: false,
          pipelineAccountId: props.pipelineAccount,
          alarmTopic: monitoring.alarmTopic,
        });
      }
    }

    // Store VPC information in SSM Parameter Store
    new ssm.StringParameter(this, "VpcIdParameter", {
      parameterName: `/vpc/${props.envName}/vpc-id`,
      stringValue: vpcConstruct.vpc.vpcId,
      description: `VPC ID for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // Store ECR information in SSM Parameter Store
    new ssm.StringParameter(this, "RepositoryUriParameter", {
      parameterName: `/ecr/${props.envName}/repository-uri`,
      stringValue: ecrConstruct.repository.repositoryUri,
      description: `ECR Repository URI for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "RepositoryArnParameter", {
      parameterName: `/ecr/${props.envName}/repository-arn`,
      stringValue: ecrConstruct.repository.repositoryArn,
      description: `ECR Repository ARN for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "RespositoryNAmePArameter", {
      parameterName: `/ecr/${props.envName}/respository-name`,
      stringValue: ecrConstruct.repository.repositoryName,
      description: `ECR Repository NAme for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // Store ECS information in SSM Parameter Store
    new ssm.StringParameter(this, "EcsClusterNameParameter", {
      parameterName: `/ecs/${props.envName}/cluster-name`,
      stringValue: ecsConstruct.cluster.clusterName,
      description: `ECS Cluster Name for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "EcsClusterArnParameter", {
      parameterName: `/ecs/${props.envName}/cluster-arn`,
      stringValue: ecsConstruct.cluster.clusterArn,
      description: `ECS Cluster ARN for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "EcsServiceNameParameter", {
      parameterName: `/ecs/${props.envName}/service-name`,
      stringValue: ecsConstruct.service.serviceName,
      description: `ECS Service Name for ${props.envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // CloudFormation outputs
    new cdk.CfnOutput(this, "VpcId", {
      value: vpcConstruct.vpc.vpcId,
      description: "VPC ID",
      exportName: `${props.envName}-vpc-cidr`,
    });

    new cdk.CfnOutput(this, "VpcCidr", {
      value: vpcConstruct.vpc.vpcCidrBlock,
      description: "VPC CIDR Block",
      exportName: `${props.envName}-vpc-cidr`,
    });

    new cdk.CfnOutput(this, "RepositoryUri", {
      value: ecrConstruct.repository.repositoryUri,
      description: "ECR Repository URI",
      exportName: `${props.envName}-ecr-repository-uri`,
    });

    new cdk.CfnOutput(this, "RespositoryArn", {
      value: ecrConstruct.repository.repositoryArn,
      description: "ECR Repository Arn",
      exportName: `${props.envName}-ecr-repository-arn`,
    });

    new cdk.CfnOutput(this, "RepositoryName", {
      value: ecrConstruct.repository.repositoryName,
      description: "ECR Repository Name",
      exportName: `${props.envName}-ecr-repositort-name`,
    });

    new cdk.CfnOutput(this, "EcsClusterName", {
      value: ecsConstruct.cluster.clusterName,
      description: "ECS Cluster Name",
      exportName: `${props.envName}-ecs-cluster-name`,
    });

    new cdk.CfnOutput(this, "EcsClusterArn", {
      value: ecsConstruct.cluster.clusterArn,
      description: "ECS Cluster ARN",
      exportName: `${props.envName}-ecs-cluster-arn`,
    });

    new cdk.CfnOutput(this, "EcsServiceName", {
      value: ecsConstruct.service.serviceName,
      description: "ECS Service Name",
      exportName: `${props.envName}-ecs-service-name`,
    });
  }
}
