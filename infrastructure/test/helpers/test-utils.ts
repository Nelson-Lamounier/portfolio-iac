/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Template } from "aws-cdk-lib/assertions";
import { NetworkingStack } from "../../lib/stacks/networking/networking-stack";
import { LoadBalancerStack } from "../../lib/stacks/load-balancer/load-balancer-stack";
import { ComputeStack } from "../../lib/stacks/compute/compute-stack";
import { MonitoringEcsStack } from "../../lib/stacks/monitoring/monitoring-ecs-stack";
import { VpcConstruct } from "../../lib/constructs/networking/vpc-construct";

/**
 * Common test constants
 */
export const TEST_CONSTANTS = {
  DEFAULT_ACCOUNT: "123456789012",
  DEFAULT_REGION: "eu-west-1",
  PIPELINE_ACCOUNT: "987654321098",
  DEFAULT_ENV_NAME: "test",
};

/**
 * Creates a test NetworkingStack with default test configuration
 */
export function createTestNetworkingStack(
  props?: Partial<{
    envName: string;
    account: string;
    region: string;
    maxAzs: number;
    natGateways: number;
  }>
) {
  const app = new cdk.App();
  const stack = new NetworkingStack(app, "TestNetworkingStack", {
    env: {
      account: props?.account || TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || TEST_CONSTANTS.DEFAULT_REGION,
    },
    envName: props?.envName || TEST_CONSTANTS.DEFAULT_ENV_NAME,
    maxAzs: props?.maxAzs ?? 2,
    natGateways: props?.natGateways ?? 0,
  });
  return {
    app,
    stack,
    template: Template.fromStack(stack),
  };
}

/**
 * Creates a test LoadBalancerStack with default test configuration
 */
export function createTestLoadBalancerStack(
  vpc: ec2.IVpc,
  props?: Partial<{
    envName: string;
    account: string;
    region: string;
    enableHttps: boolean;
    certificateArn: string;
  }>
) {
  const app = new cdk.App();
  const stack = new LoadBalancerStack(app, "TestLoadBalancerStack", {
    env: {
      account: props?.account || TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || TEST_CONSTANTS.DEFAULT_REGION,
    },
    envName: props?.envName || TEST_CONSTANTS.DEFAULT_ENV_NAME,
    vpc,
    enableHttps: props?.enableHttps,
    certificateArn: props?.certificateArn,
  });
  return {
    app,
    stack,
    template: Template.fromStack(stack),
  };
}

/**
 * Creates a test ComputeStack with default test configuration
 */
export function createTestComputeStack(
  vpc: ec2.IVpc,
  props?: Partial<{
    envName: string;
    account: string;
    region: string;
  }>
) {
  const app = new cdk.App();
  const stack = new ComputeStack(app, "TestComputeStack", {
    env: {
      account: props?.account || TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || TEST_CONSTANTS.DEFAULT_REGION,
    },
    envName: props?.envName || TEST_CONSTANTS.DEFAULT_ENV_NAME,
    vpc,
  });
  return {
    app,
    stack,
    template: Template.fromStack(stack),
  };
}

/**
 * Creates a test MonitoringEcsStack with default test configuration
 */
export function createTestMonitoringEcsStack(
  vpc: ec2.IVpc,
  props?: Partial<{
    envName: string;
    account: string;
    region: string;
    albDnsName: string;
  }>
) {
  const app = new cdk.App();
  const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
    env: {
      account: props?.account || TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || TEST_CONSTANTS.DEFAULT_REGION,
    },
    envName: props?.envName || TEST_CONSTANTS.DEFAULT_ENV_NAME,
    vpc,
    albDnsName: props?.albDnsName,
  });
  return {
    app,
    stack,
    template: Template.fromStack(stack),
  };
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
 * Creates a simple test VPC for use in other tests
 */
export function createTestVpc(stack: cdk.Stack, maxAzs: number = 2): ec2.IVpc {
  return new ec2.Vpc(stack, "TestVpc", {
    maxAzs,
    natGateways: 0,
  });
}

/**
 * Disables CDK Nag for testing
 */
export function disableCdkNag() {
  process.env.ENABLE_CDK_NAG = "false";
}

/**
 * Enables CDK Nag for testing
 */
export function enableCdkNag() {
  process.env.ENABLE_CDK_NAG = "true";
}
