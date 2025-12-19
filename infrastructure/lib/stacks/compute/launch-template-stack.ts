/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { LaunchTemplateConstruct } from "../../constructs/compute/index";

export interface LaunchTemplateStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  envName: string;
  keyPairName?: string;
}

export class LaunchTemplateStack extends cdk.Stack {
  public readonly launchTemplate: ec2.LaunchTemplate;

  constructor(scope: Construct, id: string, props: LaunchTemplateStackProps) {
    super(scope, id, props);

    const { vpc, envName, keyPairName } = props;

    // Create ECS-compatible user data
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      // ECS configuration - CRITICAL for ECS cluster integration
      `echo ECS_CLUSTER=${envName}-cluster >> /etc/ecs/ecs.config`,
      "echo ECS_ENABLE_CONTAINER_METADATA=true >> /etc/ecs/ecs.config",
      "echo ECS_ENABLE_TASK_IAM_ROLE=true >> /etc/ecs/ecs.config",

      // System updates and ECS agent
      "yum update -y",
      "yum install -y amazon-cloudwatch-agent",
      "systemctl enable ecs",
      "systemctl start ecs",

      // Install Node Exporter for Prometheus monitoring
      "useradd --no-create-home --shell /bin/false node_exporter",
      "cd /tmp",
      "curl -LO https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz",
      "tar -xvf node_exporter-1.7.0.linux-amd64.tar.gz",
      "cp node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/",
      "chown node_exporter:node_exporter /usr/local/bin/node_exporter",

      // Create systemd service for Node Exporter
      "cat <<EOF > /etc/systemd/system/node_exporter.service",
      "[Unit]",
      "Description=Node Exporter",
      "After=network.target",
      "",
      "[Service]",
      "User=node_exporter",
      "Group=node_exporter",
      "Type=simple",
      "ExecStart=/usr/local/bin/node_exporter",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "EOF",

      "systemctl daemon-reload",
      "systemctl start node_exporter",
      "systemctl enable node_exporter",

      // Custom application setup (optional)
      'echo "ECS-compatible launch template initialized"'
    );

    // Create ECS-compatible IAM role
    const ecsInstanceRole = new cdk.aws_iam.Role(this, "EcsInstanceRole", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy"
        ),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonEC2ContainerServiceforEC2Role"
        ),
      ],
    });

    // Create the launch template construct with ECS-optimized settings
    const launchTemplateConstruct = new LaunchTemplateConstruct(
      this,
      "EcsLaunchTemplate",
      {
        vpc,
        envName,
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.MICRO
        ),
        // Using Amazon Linux 2023 ECS-optimized AMI (Amazon Linux 2 reaches EOL June 30, 2026)
        machineImage: cdk.aws_ecs.EcsOptimizedImage.amazonLinux2023(),
        ...(keyPairName
          ? {
              keyPair: ec2.KeyPair.fromKeyPairName(
                this,
                "KeyPair",
                keyPairName
              ),
            }
          : {}),
        userData,
        role: ecsInstanceRole, // Use ECS-compatible role
        enableMonitoring: true,
        associatePublicIpAddress: false, // Use private subnets
        blockDevices: [
          {
            deviceName: "/dev/xvda",
            volume: ec2.BlockDeviceVolume.ebs(30, {
              volumeType: ec2.EbsDeviceVolumeType.GP3,
              encrypted: true,
              deleteOnTermination: true,
            }),
          },
        ],
      }
    );
    this.launchTemplate = launchTemplateConstruct.launchTemplate;

    // Create stack-level outputs
    new cdk.CfnOutput(this, "LaunchTemplateId", {
      value: this.launchTemplate.launchTemplateId!,
      description: "Launch Template ID",
      exportName: `${this.stackName}-LaunchTemplateId`,
    });

    new cdk.CfnOutput(this, "LaunchTemplateName", {
      value:
        this.launchTemplate.launchTemplateName || `${this.stackName}-template`,
      description: "Launch Template Name",
    });
  }
}
