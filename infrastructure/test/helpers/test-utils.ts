/** @format */

import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { InfrastructureStack } from "../../lib/infrastructure-stack";
import { VpcConstruct } from "../../lib/constructs/networking/vpc-construct";

/**
 * Creates a test InfrastructureStack with default test configuration
 */
export function createTestStack(
  props?: Partial<{
    envName: string;
    pipelineAccount: string | undefined;
    account: string;
    region: string;
  }>
) {
  const app = new cdk.App();

  // Determine pipelineAccount value
  // If props is provided and has pipelineAccount key, use its value (even if undefined)
  // Otherwise, use default "987654321098"
  const pipelineAccount =
    props && "pipelineAccount" in props
      ? props.pipelineAccount
      : "987654321098";

  const stack = new InfrastructureStack(app, "TestStack", {
    env: {
      account: props?.account || "123456789012",
      region: props?.region || "eu-west-1",
    },
    envName: props?.envName || "test",
    pipelineAccount,
  });
  return {
    app,
    stack,
    template: Template.fromStack(stack),
  };
}

/**
 * Creates a test InfrastructureStack without pipeline account
 */
export function createTestStackWithoutPipeline() {
  return createTestStack({ pipelineAccount: undefined });
}

/**
 * Creates a test InfrastructureStack for a specific environment
 */
export function createTestStackForEnvironment(envName: string) {
  return createTestStack({ envName });
}

/**
 * Creates a test VpcConstruct in an isolated stack
 */
export function createTestVpcConstruct(props?: {
  maxAzs?: number;
  natGateways?: number;
}) {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestVpcStack");
  const vpcConstruct = new VpcConstruct(stack, "TestVpc", props);
  return {
    app,
    stack,
    vpcConstruct,
    template: Template.fromStack(stack),
  };
}

/**
 * Common test constants
 */
export const TEST_CONSTANTS = {
  DEFAULT_ACCOUNT: "123456789012",
  DEFAULT_REGION: "eu-west-1",
  PIPELINE_ACCOUNT: "987654321098",
  DEFAULT_ENV_NAME: "test",
};
