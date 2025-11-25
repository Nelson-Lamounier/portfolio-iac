/** @format */

export interface EnvironmentConfig {
  account: string;
  region: string;
  envName: string;
  pipelineAccount?: string;
}

export const environments: Record<string, EnvironmentConfig> = {
  development: {
    account: process.env.AWS_ACCOUNT_ID_DEV || "",
    region: process.env.AWS_REGION || "eu-west-1",
    envName: "development",
    pipelineAccount: process.env.AWS_PIPELINE_ACCOUNT_ID || "",
  },
  staging: {
    account: process.env.AWS_ACCOUNT_ID_STAGING || "",
    region: process.env.AWS_REGION || "eu-west-1",
    envName: "staging",
    pipelineAccount: process.env.AWS_PIPELINE_ACCOUNT_ID || "",
  },
  production: {
    account: process.env.AWS_ACCOUNT_ID_PROD || "",
    region: process.env.AWS_REGION || "eu-west-1",
    envName: "production",
    pipelineAccount: process.env.AWS_PIPELINE_ACCOUNT_ID || "",
  },
};
