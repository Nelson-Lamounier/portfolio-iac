#!/usr/bin/env node
/** @format */

// Better TypeScript stack traces for debugging
import "source-map-support/register";
// Loads .env file for local development (not used in CI/CD)
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import { EcrStack } from "../lib/stacks/ecr-stack";
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

// Environment-specific stack names allow multiple environments in same account
// Explicit account/region required for cross-account deployments
// pipelineAccount enables CI/CD to push/pull images
new EcrStack(app, `EcrStack-${config.envName}`, {
  env: {
    account: config.account,
    region: config.region,
  },
  envName: config.envName,
  pipelineAccount: config.pipelineAccount,
});

// Converts CDK code to CloudFormation templates.
app.synth();
