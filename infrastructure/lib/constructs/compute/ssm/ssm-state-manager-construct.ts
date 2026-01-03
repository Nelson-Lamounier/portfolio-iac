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
    // Note: amazon-ecs-init is pre-installed on ECS-optimized AMIs, so we don't
    // need to install it via SSM Distributor. We only need to configure and start it.
    // Create association using AWS-RunShellScript (AWS managed document)
    // This runs the ECS agent configuration script directly
    // Note: amazon-ecs-init is pre-installed on ECS-optimized AMIs
    const ecsConfigScript = [
      "#!/bin/bash",
      "set -e",
      "",
      "# Configure ECS cluster",
      `echo ECS_CLUSTER=${clusterName} >> /etc/ecs/ecs.config`,
      "echo ECS_ENABLE_CONTAINER_METADATA=true >> /etc/ecs/ecs.config",
      "echo ECS_ENABLE_TASK_IAM_ROLE=true >> /etc/ecs/ecs.config",
      "echo ECS_AWSVPC_BLOCK_IMDS=true >> /etc/ecs/ecs.config",
      'echo ECS_AVAILABLE_LOGGING_DRIVERS=["json-file"] >> /etc/ecs/ecs.config',
      "",
      "# Ensure Docker is running (required for ECS agent on AL2023)",
      "systemctl enable docker || true",
      "systemctl start docker || true",
      "",
      "# Wait for Docker to be ready",
      "DOCKER_RETRY=0",
      "while [ $DOCKER_RETRY -lt 12 ]; do",
      "  if systemctl is-active docker >/dev/null 2>&1; then",
      "    break",
      "  fi",
      "  DOCKER_RETRY=$((DOCKER_RETRY + 1))",
      "  sleep 5",
      "done",
      "",
      "# Pre-pull ECS agent Docker image (required for AL2023)",
      "# On AL2023, ECS agent runs as a Docker container managed by ecs-init",
      'ECS_AGENT_IMAGE="public.ecr.aws/ecs/amazon-ecs-agent:latest"',
      'ECS_AGENT_LEGACY_TAG="amazon/amazon-ecs-agent:latest"',
      "if command -v docker >/dev/null 2>&1 && systemctl is-active docker >/dev/null 2>&1; then",
      "  docker pull $ECS_AGENT_IMAGE || true",
      "  docker tag $ECS_AGENT_IMAGE $ECS_AGENT_LEGACY_TAG || true",
      "fi",
      "",
      "# Configure ECS agent service with retry logic",
      "mkdir -p /etc/systemd/system/ecs.service.d",
      "cat > /etc/systemd/system/ecs.service.d/override.conf << 'EOF'",
      "[Service]",
      "Restart=on-failure",
      "RestartSec=30",
      "StartLimitInterval=600",
      "StartLimitBurst=20",
      "EOF",
      "systemctl daemon-reload",
      "",
      "# Start ECS agent (ecs-init is pre-installed on ECS-optimized AMIs)",
      "systemctl enable ecs || true",
      "systemctl start ecs || true",
      "",
      "# Verify ECS agent is running",
      "RETRY_COUNT=0",
      "MAX_RETRIES=18",
      "while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do",
      "  if pgrep -f 'ecs-agent' >/dev/null 2>&1; then",
      "    echo 'ECS agent is running'",
      "    exit 0",
      "  fi",
      "  RETRY_COUNT=$((RETRY_COUNT + 1))",
      "  sleep 10",
      "done",
      "",
      "echo 'WARNING: ECS agent not running after $MAX_RETRIES attempts'",
      "exit 1",
    ].join("\n");

    // Use AWS-RunShellScript (AWS managed document) instead of custom document
    this.ecsAgentConfigAssociation = new ssm.CfnAssociation(
      this,
      "EcsConfigAssociation",
      {
        name: "AWS-RunShellScript", // AWS managed document
        associationName: `${envName}-ecs-agent-config`,
        targets: associationTargets,
        parameters: {
          commands: [ecsConfigScript],
        } as Record<string, string[]>,
        scheduleExpression: "rate(30 days)", // Run monthly for maintenance
        applyOnlyAtCronInterval: false, // Also run immediately on new instances
        complianceSeverity: "CRITICAL",
        maxConcurrency: "10",
        maxErrors: "5",
      }
    );

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
          // AWS managed documents
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/AWS-RunShellScript`,
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/AWS-ConfigureAWSPackage`,
          // Custom CloudWatch Agent config document
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:document/${envName}-cloudwatch-agent-config`,
        ],
      })
    );

    // Tags
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("Component", "SSMStateManager");
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}
