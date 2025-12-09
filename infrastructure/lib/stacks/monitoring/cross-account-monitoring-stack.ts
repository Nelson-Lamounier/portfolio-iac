/** @format */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { CrossAccountMonitoringAccessConstruct } from "../../constructs";

export interface CrossAccountMonitoringStackProps extends cdk.StackProps {
  envName: string;
  pipelineAccountId: string;
  enableEventBridge?: boolean;
  enableCloudWatch?: boolean;
  enableEcsAccess?: boolean;
}

/**
 * Cross-Account Monitoring Stack
 *
 * Creates IAM roles and EventBridge rules to allow the pipeline account
 * to monitor resources in application accounts (dev, staging, production).
 *
 * This stack should be deployed in the APPLICATION accounts, not in the pipeline account.
 *
 * Features:
 * - IAM role for pipeline account to assume
 * - CloudWatch metrics and logs read access
 * - ECS service discovery access
 * - EventBridge event forwarding to pipeline account
 */
export class CrossAccountMonitoringStack extends cdk.Stack {
  public readonly monitoringAccessConstruct: CrossAccountMonitoringAccessConstruct;

  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountMonitoringStackProps
  ) {
    super(scope, id, props);

    // Create cross-account monitoring access
    this.monitoringAccessConstruct = new CrossAccountMonitoringAccessConstruct(
      this,
      "MonitoringAccess",
      {
        envName: props.envName,
        pipelineAccountId: props.pipelineAccountId,
        enableEventBridge: props.enableEventBridge ?? true,
        enableCloudWatch: props.enableCloudWatch ?? true,
        enableEcsAccess: props.enableEcsAccess ?? true,
      }
    );

    // Tags
    cdk.Tags.of(this).add("Stack", "CrossAccountMonitoring");
    cdk.Tags.of(this).add("Environment", props.envName);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}
