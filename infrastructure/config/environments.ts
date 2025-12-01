/** @format */

// Single source of truth for environment configuration
// Environment variables keep account IDs out of source control

export interface EnvironmentConfig {
  account: string; // AWS Account ID for deployment target
  region: string; // AWS Region for resources
  envName: string; // Used for resource naming and tagging
  pipelineAccount?: string; // CI/CD account for cross-account access
  enableMonitoring?: boolean; // Enable CloudWatch monitoring and alarms
  enableEventBridge?: boolean; // Enable cross-account EventBridge monitoring
  alertEmail?: string; // Email address for CloudWatch alarms
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
    enableMonitoring: true, // Disabled for cost optimisation
    enableEventBridge: true,
  },

  // Pre-production testing, mirrors production config
  staging: {
    account: process.env.AWS_ACCOUNT_ID_STAGING || "",
    region: process.env.AWS_REGION || "eu-west-1",
    envName: "staging",
    pipelineAccount: process.env.AWS_PIPELINE_ACCOUNT_ID || "",
    enableMonitoring: true, // Enabled for testing
    enableEventBridge: false,
    alertEmail: process.env.ALERT_EMAIL,
  },

  // Live environment, requires approval, highest security
  production: {
    account: process.env.AWS_ACCOUNT_ID_PROD || "",
    region: process.env.AWS_REGION || "eu-west-1",
    envName: "production",
    pipelineAccount: process.env.AWS_PIPELINE_ACCOUNT_ID || "",
    enableMonitoring: true, // Always enabled for production
    enableEventBridge: true, // Cross-account monitoring
    alertEmail: process.env.ALERT_EMAIL,
  },
};
