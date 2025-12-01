#!/usr/bin/env node
/** @format */

// Better TypeScript stack traces for debugging
import "source-map-support/register";
// Loads .env file for local development (not used in CI/CD)
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import {
  NetworkingStack,
  StorageStack,
  ComputeStack,
  MonitoringStack,
} from "../lib/stacks";
import { environments } from "../config/environments";

import { LoadBalancerStack } from "../lib/stacks";
import { CertificateStack } from "../lib/stacks/networking/certificate-stack";

const app = new cdk.App();

// Domain configuration - fetched from SSM Parameter Store at synth time
// These values are stored in the pipeline account and resolved during CDK synth
// To set these parameters in your pipeline account:
// aws ssm put-parameter --name "/portfolio/domain/root-domain-name" --value "yourdomain.com" --type String
// aws ssm put-parameter --name "/portfolio/domain/hosted-zone-id" --value "Z1234567890ABC" --type String
const rootDomainName = cdk.aws_ssm.StringParameter.valueFromLookup(
  app,
  "/github-actions/domain/root-domain-name"
);
const hostedZoneId = cdk.aws_ssm.StringParameter.valueFromLookup(
  app,
  "/github-actions/domain/hosted-zone-id"
);

// Defaults to 'development' for safer local development
const envName = process.env.ENVIRONMENT || "development";
const config = environments[envName];

// Fail fast if invalid environment specified
if (!config) {
  throw new Error(
    `Unknown environment: ${envName}. Valid options: ${Object.keys(
      environments
    ).join(", ")}`
  );
}

// Common stack properties
const stackProps: cdk.StackProps = {
  env: {
    account: config.account,
    region: config.region,
  },
};

// ========================================
// 1. Networking Stack
// ========================================
// Creates VPC, subnets, and routing
// This stack is independent and can be deployed first
const networkingStack = new NetworkingStack(
  app,
  `NetworkingStack-${config.envName}`,
  {
    ...stackProps,
    envName: config.envName,
    maxAzs: 2,
    natGateways: 0, // Cost optimization: using public subnets only
  }
);

// ========================================
// 2. Storage Stack
// ========================================
// Creates ECR repository for container images
// This stack is independent and can be deployed in parallel with networking
const storageStack = new StorageStack(app, `StorageStack-${config.envName}`, {
  ...stackProps,
  envName: config.envName,
  pipelineAccount: config.pipelineAccount,
});

// ========================================
// 3. Compute Stack
// ========================================
// Creates ECS cluster and service
// Depends on: NetworkingStack (VPC), StorageStack (ECR)
const computeStack = new ComputeStack(app, `ComputeStack-${config.envName}`, {
  ...stackProps,
  envName: config.envName,
  vpc: networkingStack.vpc,
  repository: storageStack.repository,
});

// Explicit dependencies
computeStack.addDependency(networkingStack);
computeStack.addDependency(storageStack);

// ========================================
// 4. Monitoring Stack (Optional)
// ========================================
// Creates CloudWatch alarms and dashboards
// Depends on: ComputeStack (ECS cluster and service)
if (config.enableMonitoring) {
  const monitoringStack = new MonitoringStack(
    app,
    `MonitoringStack-${config.envName}`,
    {
      ...stackProps,
      envName: config.envName,
      ecsClusterName: computeStack.cluster.clusterName,
      ecsServiceName: computeStack.service.serviceName,
      alertEmail: config.alertEmail,
      enableDashboard: config.envName === "production",
      enableEventBridge: config.enableEventBridge,
      pipelineAccountId: config.pipelineAccount,
    }
  );

  // Explicit dependency
  monitoringStack.addDependency(computeStack);
}

// ========================================
// 5. Certificate Stack (Optional)
// ========================================
// Creates SSL/TLS certificates for HTTPS
// Only created if domain configuration is provided
let certificateStack: CertificateStack | undefined;

if (rootDomainName && hostedZoneId) {
  certificateStack = new CertificateStack(
    app,
    `CertificateStack-${config.envName}`,
    {
      ...stackProps,
      certificates: [
        {
          domainName: rootDomainName,
          hostedZoneId: hostedZoneId,
          includeWildcard: true, // Includes *.yourdomain.com
          certificateName: `${config.envName}-certificate`,
          tags: {
            Environment: config.envName,
            Project: "portfolio",
            ManagedBy: "cdk",
          },
        },
      ],
    }
  );
}

// ========================================
// 6. Load Balancer Stack
// ========================================
// Creates Application Load Balancer
// Depends on: NetworkingStack (VPC), CertificateStack (optional)
const loadBalancerStack = new LoadBalancerStack(
  app,
  `LoadBalancerStack-${config.envName}`,
  {
    ...stackProps,
    description: "Application Load Balancer infrastructure",
    envName: config.envName,
    vpc: networkingStack.vpc,
    loadBalancerName: `${config.envName}-alb`,
    enableHttps: !!certificateStack && !!rootDomainName,
    certificateArn: certificateStack?.getCertificate(rootDomainName!)
      ?.certificateArn,
    tags: {
      Environment: config.envName,
      Project: "portfolio",
      ManagedBy: "cdk",
    },
  }
);

// Add dependencies
loadBalancerStack.addDependency(networkingStack);
if (certificateStack) {
  loadBalancerStack.addDependency(certificateStack);
}

// ========================================
// 7. Connect ECS Service to Load Balancer
// ========================================
// TODO: Update ComputeStack to accept target group from LoadBalancerStack
// For now, the load balancer is created but not yet connected to ECS
// Next steps:
// 1. Add target group parameter to ComputeStack
// 2. Attach ECS service to the target group
// 3. Update security groups to allow ALB -> ECS traffic

// Converts CDK code to CloudFormation templates
app.synth();
