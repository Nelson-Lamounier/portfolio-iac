/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Template } from "aws-cdk-lib/assertions";

import { NetworkingStack } from "../../lib/stacks/networking/networking-stack";
import { LoadBalancerStack } from "../../lib/stacks/load-balancer/load-balancer-stack";
import { ComputeStack } from "../../lib/stacks/compute/compute-stack";
// MonitoringEcsStack removed - use layered approach (MonitoringEfsStack + MonitoringInfraStack + MonitoringServiceStack)
import { VpcConstruct } from "../../lib/constructs/networking/vpc-construct";
import { CertificateStack } from "../../lib/stacks/networking/security/acm-stack";
import { AcmCertificateConstruct } from "../../lib/constructs/networking/security/acm-certificate-construct";

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
 * MonitoringEcsStack has been removed in favor of the layered approach.
 * Use MonitoringEfsStack + MonitoringInfraStack + MonitoringServiceStack instead.
 *
 * For testing, create individual layer stacks as needed.
 */

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

/**
 * Creates a test CertificateStack with default test configuration
 */
export function createTestCertificateStack(
  props?: Partial<{
    envName: string;
    account: string;
    region: string;
    DomainName: string;
    hostedZoneId: string;
    subjectAlternativeNames: string[];
    storeCertificateArnInSsm: boolean;
    ssmParameterName: string;
  }>
) {
  const app = new cdk.App();
  const stack = new CertificateStack(app, "TestCertificateStack", {
    env: {
      account: props?.account || TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || TEST_CONSTANTS.DEFAULT_REGION,
    },
    envName: props?.envName || TEST_CONSTANTS.DEFAULT_ENV_NAME,
    DomainName: props?.DomainName || "example.com",
    hostedZoneId: props?.hostedZoneId,
    subjectAlternativeNames: props?.subjectAlternativeNames,
    storeCertificateArnInSsm: props?.storeCertificateArnInSsm ?? true,
    ssmParameterName: props?.ssmParameterName,
  });
  return {
    app,
    stack,
    template: Template.fromStack(stack),
  };
}

/**
 * Creates a test AcmCertificateConstruct with default test configuration
 */
export function createTestAcmCertificateConstruct(
  stack: cdk.Stack,
  props?: Partial<{
    domainName: string;
    hostedZoneId: string;
    hostedZoneName: string;
    subjectAlternativeNames: string[];
    envName: string;
    enableDnsValidation: boolean;
  }>
) {
  let hostedZone: route53.IHostedZone | undefined;

  if (props?.hostedZoneId) {
    hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      stack,
      "TestHostedZone",
      {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.domainName || "example.com",
      }
    );
  }

  const construct = new AcmCertificateConstruct(stack, "TestCertificate", {
    domainName: props?.domainName || "example.com",
    hostedZone,
    subjectAlternativeNames: props?.subjectAlternativeNames,
    envName: props?.envName || TEST_CONSTANTS.DEFAULT_ENV_NAME,
    enableDnsValidation: props?.enableDnsValidation ?? !!hostedZone,
  });

  return {
    construct,
    template: Template.fromStack(stack),
  };
}

/**
 * Creates a test hosted zone for certificate validation testing
 */
export function createTestHostedZone(
  stack: cdk.Stack,
  domainName: string = "example.com"
): route53.IHostedZone {
  return route53.HostedZone.fromHostedZoneAttributes(stack, "TestHostedZone", {
    hostedZoneId: "Z1234567890ABC",
    zoneName: domainName,
  });
}
