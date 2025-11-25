/** @format */

// Single source of truth for environment configuration
// Environment variables keep account IDs out of source control

export interface EnvironmentConfig {
  account: string; // AWS Account ID for deployment target
  region: string; // AWS Region for resources
  envName: string; // Used for resource naming and tagging
  pipelineAccount?: string; // CI/CD account for cross-account access
}

// Record type provides type-safe access with autocomplete
// Empty string defaults allow validation at runtime with clear errors
export const environments: Record<string, EnvironmentConfig> = {
  // Frequent deployments, lower cost, can be destroyed/recreated
  development: {
    account: process.env.AWS_ACCOUNT_ID_DEV || "",
    region: process.env.AWS_REGION || "eu-west-1",
    envName: "development",
    pipelineAccount: process.env.AWS_PIPELINE_ACCOUNT_ID || "",
  },

  // Pre-production testing, mirrors production config
  staging: {
    account: process.env.AWS_ACCOUNT_ID_STAGING || "",
    region: process.env.AWS_REGION || "eu-west-1",
    envName: "staging",
    pipelineAccount: process.env.AWS_PIPELINE_ACCOUNT_ID || "",
  },

  // Live environment, requires approval, highest security
  production: {
    account: process.env.AWS_ACCOUNT_ID_PROD || "",
    region: process.env.AWS_REGION || "eu-west-1",
    envName: "production",
    pipelineAccount: process.env.AWS_PIPELINE_ACCOUNT_ID || "",
  },
};
