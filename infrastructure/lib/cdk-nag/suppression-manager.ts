/** @format */

import { NagPackSuppression } from "cdk-nag";

/**
 * Centralized CDK Nag Suppression Manager
 *
 * This file contains all CDK Nag suppressions organized by category.
 * Benefits:
 * - Single source of truth for all suppressions
 * - Easier to audit and review security exceptions
 * - Consistent justifications across stacks
 * - Simplified maintenance and updates
 *
 * Usage:
 * ```typescript
 * import { SuppressionManager } from '../cdk-nag/suppression-manager';
 *
 * // Apply to stack
 * SuppressionManager.applyToStack(this, 'ComputeStack');
 *
 * // Or get specific suppressions
 * const cdkManagedSuppressions = SuppressionManager.getCdkManagedResourceSuppressions();
 * NagSuppressions.addStackSuppressions(this, cdkManagedSuppressions);
 * ```
 */
export class SuppressionManager {
  /**
   * CDK-Managed Resources
   * These are resources created automatically by CDK that we don't directly control
   */
  static getCdkManagedResourceSuppressions(): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-IAM4",
        reason:
          "AWS managed policies are used for Lambda functions created by CDK for custom resources (Auto Scaling lifecycle hooks, VPC default security group restriction, EventBridge targets). These are standard CloudFormation custom resource Lambda functions managed by CDK.",
        appliesTo: [
          "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        ],
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Wildcard permissions are used by CDK-managed custom resource Lambdas for EventBridge to CloudWatch Logs integration and other CDK framework operations. This is required by the CDK framework to manage resource policies and cannot be scoped further. This is standard CDK behavior.",
        appliesTo: ["Resource::*"],
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "ECS Container Instance IAM role requires wildcard action permissions (ecs:Submit*) to communicate with ECS control plane. This is a standard permission for ECS EC2 instances as documented in AWS ECS best practices and is created by CDK's Auto Scaling Group construct.",
        appliesTo: ["Action::ecs:Submit*"],
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Auto Scaling Group lifecycle hook Lambda (DrainECSHook) requires permissions to manage Auto Scaling lifecycle actions. The wildcard is scoped to the specific Auto Scaling Group name pattern and is necessary for proper instance lifecycle management during ECS task draining. This is a CDK-managed resource.",
        appliesTo: [
          {
            regex:
              "/^Resource::arn:aws:autoscaling:.*:autoScalingGroup:\\*:autoScalingGroupName\\/<.*>$/",
          },
        ],
      },
      {
        id: "AwsSolutions-L1",
        reason:
          "Lambda runtime versions are managed by CDK for custom resources. CDK automatically updates these with new releases. Upgrading CDK version will update these runtimes.",
      },
    ];
  }

  /**
   * ECS Task Definition - Non-Sensitive Environment Variables
   * For basic configuration values that are not secrets
   */
  static getEcsEnvironmentVariableSuppressions(): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-ECS2",
        reason:
          "Environment variables like NODE_ENV, PORT, and service configuration are non-sensitive values. Sensitive values (API keys, passwords, tokens) must use AWS Secrets Manager or SSM Parameter Store with SecureString. These basic config values are safe as environment variables.",
      },
    ];
  }

  /**
   * Public-Facing Resources
   * For resources that need to be accessible from the internet
   */
  static getPublicAccessSuppressions(): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-EC23",
        reason:
          "Application Load Balancer must accept traffic from the internet (0.0.0.0/0) to serve public-facing application. Security is enforced through: 1) ALB security group only allows HTTP/HTTPS, 2) Target security groups restrict access to ALB only, 3) WAF rules (if enabled), 4) Application-level authentication.",
      },
    ];
  }

  /**
   * ECR Permissions
   * For ECS tasks that need to pull container images
   */
  static getEcrPermissionSuppressions(): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "ECR GetAuthorizationToken action does not support resource-level permissions and requires wildcard (*). This is an AWS service limitation documented in AWS IAM documentation.",
        appliesTo: ["Resource::*"],
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "ECR repository permissions use wildcard to allow pulling from any repository in the account. This is scoped to the account and region, providing reasonable security while allowing flexibility for multiple repositories.",
        appliesTo: [
          {
            regex: "/^Resource::arn:aws:ecr:.*:.*:repository/\\*$/",
          },
        ],
      },
    ];
  }

  /**
   * CloudWatch Logs Permissions
   * For services that need to write logs
   */
  static getCloudWatchLogsSuppressions(envName: string): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "CloudWatch Logs permissions use wildcard for log streams within the environment-specific log group. This allows services to create log streams dynamically while restricting access to the specific environment. The wildcard is scoped to /ecs/{envName}* pattern.",
        appliesTo: [
          {
            regex: `/^Resource::arn:aws:logs:.*:.*:log-group:/ecs/${envName}\\*:\\*$/`,
          },
        ],
      },
    ];
  }

  /**
   * ECS Service Permissions
   * For ECS services and task roles
   */
  static getEcsServiceSuppressions(): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "ECS service requires permissions to describe and manage tasks within its cluster. The wildcard is scoped to the specific cluster ARN and is necessary for ECS service operations like task placement, health checks, and service discovery.",
        appliesTo: ["Resource::*"],
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "ECS Container Instance IAM role requires wildcard action permissions (ecs:Submit*) to communicate with ECS control plane. This is a standard permission for ECS EC2 instances as documented in AWS ECS best practices.",
        appliesTo: ["Action::ecs:Submit*"],
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Auto Scaling Group lifecycle hook Lambda requires permissions to manage Auto Scaling lifecycle actions. The wildcard is scoped to the specific Auto Scaling Group name pattern and is necessary for proper instance lifecycle management during ECS task draining.",
        appliesTo: [
          {
            regex:
              "/^Resource::arn:aws:autoscaling:.*:autoScalingGroup:\\*:autoScalingGroupName\\/<.*>$/",
          },
        ],
      },
    ];
  }

  /**
   * Auto Scaling Permissions
   * For Auto Scaling Groups and lifecycle hooks
   */
  static getAutoScalingSuppressions(): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Auto Scaling lifecycle hooks require permissions to describe instances and complete lifecycle actions. These permissions are scoped to the specific Auto Scaling Group and are necessary for proper instance lifecycle management.",
        appliesTo: ["Resource::*"],
      },
      {
        id: "AwsSolutions-AS3",
        reason:
          "Auto Scaling Group notifications are optional for development environments. For production, consider enabling SNS notifications for scaling events to improve operational visibility.",
      },
      {
        id: "AwsSolutions-EC26",
        reason:
          "EBS encryption can be managed at the account level via AWS Config or enabled per-environment. For development environments, unencrypted volumes reduce costs. Production environments should enable EBS encryption.",
      },
    ];
  }

  /**
   * Monitoring and Observability
   * For Prometheus, Grafana, and CloudWatch
   */
  static getMonitoringSuppressions(): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Monitoring services (Prometheus, Grafana) require read access to CloudWatch metrics and logs across the account for comprehensive observability. This is standard practice for monitoring solutions and is read-only access.",
        appliesTo: ["Resource::*"],
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "Grafana CloudWatch datasource requires permissions to query logs across all log groups in the account. The wildcard is scoped to the account and region, and permissions are read-only.",
        appliesTo: [
          {
            regex: "/^Resource::arn:aws:logs:.*:.*:log-group:\\*$/",
          },
        ],
      },
      {
        id: "AwsSolutions-SNS3",
        reason:
          "SNS topic is used for internal ECS lifecycle hooks managed by CDK for the monitoring cluster. SSL enforcement is handled by AWS internal services. The lifecycle hook topic is used for draining ECS tasks during instance termination.",
      },
    ];
  }

  /**
   * Load Balancer Configuration
   * For ALB access logging and configuration
   */
  static getLoadBalancerSuppressions(): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-ELB2",
        reason:
          "ALB access logging is disabled to reduce costs in development environments. For production, enable access logging to S3 bucket for audit and troubleshooting purposes. Logs should be retained according to compliance requirements.",
      },
      {
        id: "AwsSolutions-S1",
        reason:
          "S3 access log bucket has server access logging enabled via serverAccessLogsPrefix property. This bucket stores ALB access logs and its own access logs are stored in a separate prefix within the same bucket.",
      },
    ];
  }

  /**
   * VPC and Networking
   * For VPC Flow Logs and network configuration
   */
  static getNetworkingSuppressions(): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-VPC7",
        reason:
          "VPC Flow Logs are disabled to reduce costs in development environments. For production, enable VPC Flow Logs to CloudWatch Logs or S3 for network troubleshooting and security analysis.",
      },
    ];
  }

  /**
   * SNS Topic Security
   * For SNS topics that need SSL/TLS enforcement
   */
  static getSnsSecuritySuppressions(): NagPackSuppression[] {
    return [
      {
        id: "AwsSolutions-SNS3",
        reason:
          "SNS topic SSL/TLS enforcement is not configured for CDK-managed topics used by Auto Scaling lifecycle hooks. These topics are internal to AWS services and use AWS's internal secure communication. For custom SNS topics, SSL/TLS should be enforced.",
      },
    ];
  }

  /**
   * Apply all relevant suppressions to a stack
   * This is the recommended way to apply suppressions
   */
  static applyToStack(
    stack: any,
    stackType:
      | "ComputeStack"
      | "MonitoringStack"
      | "NetworkingStack"
      | "LoadBalancerStack"
      | "CertificateStack",
    envName?: string
  ): void {
    const { NagSuppressions } = require("cdk-nag");

    const suppressions: NagPackSuppression[] = [];

    // All stacks get CDK-managed resource suppressions
    suppressions.push(...this.getCdkManagedResourceSuppressions());

    // Stack-specific suppressions
    switch (stackType) {
      case "ComputeStack":
        suppressions.push(...this.getEcsEnvironmentVariableSuppressions());
        suppressions.push(...this.getEcsServiceSuppressions());
        suppressions.push(...this.getAutoScalingSuppressions());
        if (envName) {
          suppressions.push(...this.getCloudWatchLogsSuppressions(envName));
        }
        break;

      case "MonitoringStack":
        suppressions.push(...this.getMonitoringSuppressions());
        suppressions.push(...this.getEcsEnvironmentVariableSuppressions());
        suppressions.push(...this.getAutoScalingSuppressions());
        suppressions.push(...this.getPublicAccessSuppressions());
        suppressions.push(...this.getLoadBalancerSuppressions());
        if (envName) {
          suppressions.push(...this.getCloudWatchLogsSuppressions(envName));
        }
        break;

      case "NetworkingStack":
        suppressions.push(...this.getNetworkingSuppressions());
        break;

      case "LoadBalancerStack":
        suppressions.push(...this.getPublicAccessSuppressions());
        suppressions.push(...this.getLoadBalancerSuppressions());
        break;

      case "CertificateStack":
        // Certificate stack typically doesn't need suppressions
        break;
    }

    NagSuppressions.addStackSuppressions(stack, suppressions);
  }

  /**
   * Get suppressions for ECS Task Execution Role
   * Use this in constructs that create execution roles
   */
  static getExecutionRoleSuppressions(envName: string): NagPackSuppression[] {
    return [
      ...this.getEcrPermissionSuppressions(),
      ...this.getCloudWatchLogsSuppressions(envName),
    ];
  }
}
