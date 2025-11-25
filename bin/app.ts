#!/usr/bin/env node
/** @format */

import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EcrStack } from "../lib/ecr-stack";
import { environments } from "../config/environments";

const app = new cdk.App();

const envName = process.env.ENVIRONMENT || "development";
const config = environments[envName];

if (!config) {
  throw new Error(`Unknown environment: ${envName}`);
}

new EcrStack(app, `EcrStack-${config.envName}`, {
  env: {
    account: config.account,
    region: config.region,
  },
  envName: config.envName,
  pipelineAccount: config.pipelineAccount,
});

app.synth();
