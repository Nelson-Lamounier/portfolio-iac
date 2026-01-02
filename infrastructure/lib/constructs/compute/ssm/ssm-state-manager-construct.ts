/** @format */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

export interface SsmStateManagerConstructProps {
  /**
   * Environment name for resource naming
   */
  envName: string;

  /**
   * ECS cluster name
   */
  clusterName: string;

  /**
   * Instance role that will be targeted by associations
   */
  instanceRole: iam.IRole;

  /**
   * Target instances (can be tags, instance IDs, or all instances)
   * Default: All instances with the instance role
   */
  targets?: ssm.CfnAssociation.TargetProperty[];
}

/**
 * SSM State Manager Construct
 *
 * Creates SSM State Manager associations to handle:
 * - ECS agent setup and configuration
 * - CloudWatch Agent installation and configuration
 *
 * Benefits over UserData:
 * - Can be updated without recreating instances
 * - Can run on a schedule for maintenance
 * - Better error handling and retry logic
 * - Centralized management via SSM console
 */
export class SsmStateManagerConstruct extends Construct {
  public readonly ecsAgentInstallAssociation: ssm.CfnAssociation;
  public readonly ecsAgentConfigAssociation: ssm.CfnAssociation;
  public readonly cloudWatchAgentInstallAssociation: ssm.CfnAssociation;
  public readonly cloudWatchAgentConfigAssociation: ssm.CfnAssociation;

  constructor(
    scope: Construct,
    id: string,
    props: SsmStateManagerConstructProps
  ) {
    super(scope, id);

    const { envName, clusterName, instanceRole, targets } = props;

    // Default targets: All instances with the instance role
    const defaultTargets: ssm.CfnAssociation.TargetProperty[] = [
      {
        key: "tag:Environment",
        values: [envName],
      },
      {
        key: "tag:Service",
        values: ["monitoring"],
      },
    ];

    const associationTargets = targets || defaultTargets;

    // ========================================================================
    // ECS AGENT SETUP ASSOCIATION
    // ========================================================================
    // Install amazon-ecs-init package (if not already installed)
    this.ecsAgentInstallAssociation = new ssm.CfnAssociation(
      this,
      "EcsAgentInstallAssociation",
      {
        name: "AWS-ConfigureAWSPackage", // AWS managed document
        associationName: `${envName}-ecs-agent-install`,
        targets: associationTargets,
        parameters: {
          action: ["Install"],
          name: ["amazon-ecs-init"],
        } as Record<string, string[]>,
        scheduleExpression: "rate(30 days)", // Run monthly for maintenance
        applyOnlyAtCronInterval: false, // Also run immediately on new instances
        complianceSeverity: "CRITICAL",
        maxConcurrency: "10",
        maxErrors: "5",
      }
    );

    // Create custom document for ECS agent configuration
    // CDK CfnDocument expects content as an object when using YAML format
    const ecsConfigDocumentContent = {
      schemaVersion: "2.2",
      description: `Configure ECS agent for ${envName} cluster`,
      mainSteps: [
        {
          action: "aws:runShellScript",
          name: "configureEcsAgent",
          inputs: {
            runCommand: [
              "#!/bin/bash",
              `echo ECS_CLUSTER=${clusterName} >> /etc/ecs/ecs.config`,
              "echo ECS_ENABLE_CONTAINER_METADATA=true >> /etc/ecs/ecs.config",
              "echo ECS_ENABLE_TASK_IAM_ROLE=true >> /etc/ecs/ecs.config",
              "echo ECS_AWSVPC_BLOCK_IMDS=true >> /etc/ecs/ecs.config",
              'echo ECS_AVAILABLE_LOGGING_DRIVERS=["json-file"] >> /etc/ecs/ecs.config',
              "",
              "# Ensure Docker is running",
              "systemctl enable docker || true",
              "systemctl start docker || true",
              "",
              "# Pre-pull ECS agent Docker image (required for AL2023)",
              'ECS_AGENT_IMAGE="public.ecr.aws/ecs/amazon-ecs-agent:latest"',
              'ECS_AGENT_LEGACY_TAG="amazon/amazon-ecs-agent:latest"',
              "if command -v docker >/dev/null 2>&1; then",
              "  docker pull $ECS_AGENT_IMAGE || true",
              "  docker tag $ECS_AGENT_IMAGE $ECS_AGENT_LEGACY_TAG || true",
              "fi",
              "",
              "# Start ECS agent",
              "systemctl enable ecs || true",
              "systemctl start ecs || true",
            ],
          },
        },
      ],
    };

    const ecsConfigDocument = new ssm.CfnDocument(this, "EcsConfigDocument", {
      documentType: "Command",
      documentFormat: "YAML",
      name: `${envName}-ecs-agent-config`,
      content: ecsConfigDocumentContent,
    });

    // Association to run ECS configuration document
    this.ecsAgentConfigAssociation = new ssm.CfnAssociation(
      this,
      "EcsConfigAssociation",
      {
        name: ecsConfigDocument.name!,
        associationName: `${envName}-ecs-agent-config`,
        targets: associationTargets,
        scheduleExpression: "rate(30 days)", // Run monthly for maintenance
        applyOnlyAtCronInterval: false, // Also run immediately on new instances
        complianceSeverity: "CRITICAL",
        maxConcurrency: "10",
        maxErrors: "5",
      }
    );
    this.ecsAgentConfigAssociation.addDependency(ecsConfigDocument);

    // ========================================================================
    // CLOUDWATCH AGENT SETUP ASSOCIATION
    // ========================================================================
    // First, install CloudWatch Agent
    this.cloudWatchAgentInstallAssociation = new ssm.CfnAssociation(
      this,
      "CloudWatchAgentInstallAssociation",
      {
        name: "AWS-ConfigureAWSPackage", // AWS managed document
        associationName: `${envName}-cloudwatch-agent-install`,
        targets: associationTargets,
        parameters: {
          action: ["Install"],
          name: ["AmazonCloudWatchAgent"],
        } as Record<string, string[]>,
        scheduleExpression: "rate(30 days)", // Run monthly for maintenance
        applyOnlyAtCronInterval: false, // Also run immediately on new instances
        complianceSeverity: "HIGH",
        maxConcurrency: "10",
        maxErrors: "5",
      }
    );

    // Create CloudWatch Agent configuration document
    // CDK CfnDocument expects content as an object when using YAML format
    const cloudWatchConfigDocumentContent = {
      schemaVersion: "2.2",
      description: `Configure CloudWatch Agent for ${envName} monitoring`,
      mainSteps: [
        {
          action: "aws:runShellScript",
          name: "configureCloudWatchAgent",
          inputs: {
            runCommand: [
              "#!/bin/bash",
              "INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id || echo 'unknown')",
              "",
              "# Create CloudWatch Agent configuration",
              "mkdir -p /opt/aws/amazon-cloudwatch-agent/etc",
              "cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CWAGENT_CONFIG_EOF'",
              "{",
              '  "logs": {',
              '    "logs_collected": {',
              '      "files": {',
              '        "collect_list": [',
              "          {",
              '            "file_path": "/var/lib/docker/containers/*/*-json.log",',
              `            "log_group_name": "/ecs/${envName}-containers",`,
              '            "log_stream_name": "{instance_id}-{source_host}",',
              '            "timezone": "UTC",',
              '            "multi_line_start_pattern": "^\\\\{\\"log\\\\":",',
              '            "encoding": "utf-8",',
              '            "auto_removal": false',
              "          },",
              "          {",
              '            "file_path": "/var/log/ecs/ecs-agent.log",',
              `            "log_group_name": "/ecs/${envName}-ecs-agent",`,
              '            "log_stream_name": "{instance_id}",',
              '            "timezone": "UTC",',
              '            "encoding": "utf-8"',
              "          },",
              "          {",
              '            "file_path": "/var/log/ecs/ecs-init.log",',
              `            "log_group_name": "/ecs/${envName}-ecs-init",`,
              '            "log_stream_name": "{instance_id}",',
              '            "timezone": "UTC",',
              '            "encoding": "utf-8"',
              "          }",
              "        ]",
              "      }",
              "    }",
              "  }",
              "}",
              "CWAGENT_CONFIG_EOF",
              "",
              "# Start CloudWatch Agent",
              "systemctl enable amazon-cloudwatch-agent || true",
              "systemctl start amazon-cloudwatch-agent || true",
            ],
          },
        },
      ],
    };

    const cloudWatchConfigDocument = new ssm.CfnDocument(
      this,
      "CloudWatchAgentConfigDocument",
      {
        documentType: "Command",
        documentFormat: "YAML",
        name: `${envName}-cloudwatch-agent-config`,
        content: cloudWatchConfigDocumentContent,
      }
    );

    // Association to run CloudWatch Agent configuration
    this.cloudWatchAgentConfigAssociation = new ssm.CfnAssociation(
      this,
      "CloudWatchAgentConfigAssociation",
      {
        name: cloudWatchConfigDocument.name!,
        associationName: `${envName}-cloudwatch-agent-config`,
        targets: associationTargets,
        scheduleExpression: "rate(30 days)", // Run monthly for maintenance
        applyOnlyAtCronInterval: false, // Also run immediately on new instances
        complianceSeverity: "HIGH",
        maxConcurrency: "10",
        maxErrors: "5",
      }
    );
    this.cloudWatchAgentConfigAssociation.addDependency(
      cloudWatchConfigDocument
    );
    this.cloudWatchAgentConfigAssociation.addDependency(
      this.cloudWatchAgentInstallAssociation
    );

    // Grant SSM permissions to instance role
    instanceRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ssm:DescribeInstanceInformation",
          "ssm:ListAssociations",
          "ssm:ListInstanceAssociations",
          "ssm:DescribeAssociation",
          "ssm:GetDocument",
          "ssm:SendCommand",
        ],
        resources: ["*"],
      })
    );

    // Grant SSM permissions to run documents
    instanceRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ssm:UpdateInstanceInformation",
          "ssm:SendCommand",
          "ssm:GetCommandInvocation",
        ],
        resources: [
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/${envName}-ecs-agent-config`,
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/${envName}-cloudwatch-agent-config`,
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/AWS-ConfigureAWSPackage`,
        ],
      })
    );

    // Tags
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("Component", "SSMStateManager");
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}
