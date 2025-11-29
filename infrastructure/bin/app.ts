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

const app = new cdk.App();

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

// Converts CDK code to CloudFormation templates
app.synth();
