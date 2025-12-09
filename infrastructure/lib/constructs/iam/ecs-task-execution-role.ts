/** @format */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";

export interface EcsTaskExecutionRoleProps {
  /**
   * Environment name for tagging
   */
  envName: string;

  /**
   * Enable ECR permissions
   * @default true
   */
  enableEcrAccess?: boolean;

  /**
   * Enable public ECR permissions (for Docker Hub, public registries)
   * @default false
   */
  enablePublicEcr?: boolean;

  /**
   * Enable CloudWatch Logs permissions
   * @default true
   */
  enableCloudWatchLogs?: boolean;

  /**
   * Specific log group ARN to grant permissions to
   * If not provided, grants permissions to all /ecs/* log groups
   */
  logGroupArn?: string;

  /**
   * Enable Secrets Manager permissions
   * @default false
   */
  enableSecretsManager?: boolean;

  /**
   * Enable SSM Parameter Store permissions
   * @default false
   */
  enableSsmParameters?: boolean;
}

/**
 * ECS Task Execution IAM Role
 *
 * Creates an IAM role for ECS task execution with least privilege permissions.
 * This role is used by the ECS agent to pull container images, write logs, and
 * access secrets.
 *
 * This is a CDK Nag compliant alternative to using the AWS managed policy
 * AmazonECSTaskExecutionRolePolicy.
 *
 * Permissions granted (based on options):
 * - CloudWatch Logs: Create log streams and put log events
 * - ECR: Pull container images
 * - Secrets Manager: Get secret values (optional)
 * - SSM Parameter Store: Get parameters (optional)
 *
 * Usage:
 * ```typescript
 * const role = new EcsTaskExecutionRole(this, 'ExecutionRole', {
 *   envName: 'development',
 *   enableEcrAccess: true,
 *   enableCloudWatchLogs: true,
 * });
 * ```
 */
export class EcsTaskExecutionRole extends Construct {
  public readonly role: iam.Role;
  public readonly roleArn: string;

  constructor(scope: Construct, id: string, props: EcsTaskExecutionRoleProps) {
    super(scope, id);

    const {
      envName,
      enableEcrAccess = true,
      enablePublicEcr = false,
      enableCloudWatchLogs = true,
      logGroupArn,
      enableSecretsManager = false,
      enableSsmParameters = false,
    } = props;

    // Create execution role with custom inline policy
    // This addresses CDK Nag AwsSolutions-IAM4
    this.role = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: `ECS task execution role for ${envName} with least privilege permissions`,
    });

    // CloudWatch Logs permissions
    if (enableCloudWatchLogs) {
      const logResource = logGroupArn
        ? `${logGroupArn}:*`
        : `arn:aws:logs:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:log-group:/ecs/${envName}*:*`;

      this.role.addToPolicy(
        new iam.PolicyStatement({
          sid: "CloudWatchLogsAccess",
          effect: iam.Effect.ALLOW,
          actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
          resources: [logResource],
        })
      );
    }

    // ECR permissions
    if (enableEcrAccess) {
      // GetAuthorizationToken doesn't support resource-level permissions
      this.role.addToPolicy(
        new iam.PolicyStatement({
          sid: "EcrAuthorizationToken",
          effect: iam.Effect.ALLOW,
          actions: ["ecr:GetAuthorizationToken"],
          resources: ["*"],
        })
      );

      this.role.addToPolicy(
        new iam.PolicyStatement({
          sid: "EcrImageAccess",
          effect: iam.Effect.ALLOW,
          actions: [
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage",
          ],
          resources: [
            `arn:aws:ecr:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:repository/*`,
          ],
        })
      );
    }

    // Public ECR permissions (for Docker Hub, public registries)
    if (enablePublicEcr) {
      this.role.addToPolicy(
        new iam.PolicyStatement({
          sid: "PublicEcrAccess",
          effect: iam.Effect.ALLOW,
          actions: [
            "ecr-public:GetAuthorizationToken",
            "sts:GetServiceBearerToken",
          ],
          resources: ["*"], // Required for public registry access
        })
      );
    }

    // Secrets Manager permissions
    if (enableSecretsManager) {
      this.role.addToPolicy(
        new iam.PolicyStatement({
          sid: "SecretsManagerAccess",
          effect: iam.Effect.ALLOW,
          actions: ["secretsmanager:GetSecretValue"],
          resources: [
            `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:secret:${envName}/*`,
          ],
        })
      );
    }

    // SSM Parameter Store permissions
    if (enableSsmParameters) {
      this.role.addToPolicy(
        new iam.PolicyStatement({
          sid: "SsmParameterAccess",
          effect: iam.Effect.ALLOW,
          actions: ["ssm:GetParameters", "ssm:GetParameter"],
          resources: [
            `arn:aws:ssm:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:parameter/${envName}/*`,
          ],
        })
      );
    }

    this.roleArn = this.role.roleArn;

    // ========================================================================
    // CDK NAG SUPPRESSIONS
    // ========================================================================
    // Apply suppressions for necessary wildcards
    const suppressions = [];

    // ECR GetAuthorizationToken requires wildcard
    if (enableEcrAccess) {
      suppressions.push({
        id: "AwsSolutions-IAM5",
        reason:
          "ECR GetAuthorizationToken does not support resource-level permissions. This is an AWS service limitation.",
        appliesTo: ["Resource::*"],
      });

      suppressions.push({
        id: "AwsSolutions-IAM5",
        reason:
          "ECR repository wildcard allows ECS to pull images from any repository in the account. This is standard practice for ECS task execution roles.",
        appliesTo: [
          `Resource::arn:aws:ecr:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:repository/*`,
        ],
      });
    }

    // Public ECR requires wildcard
    if (enablePublicEcr) {
      suppressions.push({
        id: "AwsSolutions-IAM5",
        reason:
          "Public ECR and STS GetServiceBearerToken do not support resource-level permissions. Required for pulling public container images.",
        appliesTo: ["Resource::*"],
      });
    }

    // CloudWatch Logs wildcard for log streams
    if (enableCloudWatchLogs) {
      if (logGroupArn) {
        // For specific log group, suppress both the ARN pattern and wildcard
        suppressions.push({
          id: "AwsSolutions-IAM5",
          reason:
            "CloudWatch Logs permissions use wildcard for log streams within the specific log group. This allows ECS to create log streams dynamically.",
          appliesTo: [
            {
              regex: "/^Resource::<.*LogGroup.*\\.Arn>:\\*$/g",
            },
          ],
        });
      } else {
        suppressions.push({
          id: "AwsSolutions-IAM5",
          reason:
            "CloudWatch Logs permissions use wildcard for log streams within /ecs/* log groups. This allows ECS to create log streams dynamically for all ECS services.",
          appliesTo: [
            `Resource::arn:aws:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:/ecs/${envName}*:*`,
          ],
        });
      }
    }

    if (suppressions.length > 0) {
      NagSuppressions.addResourceSuppressions(this.role, suppressions, true);
    }

    // ========================================================================
    // TAGS
    // ========================================================================
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("Purpose", "EcsTaskExecution");
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}
