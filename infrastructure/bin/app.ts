#!/usr/bin/env node
/** @format */

// Better TypeScript stack traces for debugging
import "source-map-support/register";
// Loads .env file for local development (not used in CI/CD)
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import {
  NetworkingStack,
  ComputeStack,
  MonitoringStack,
  MonitoringEcsStack,
  MonitoringInfraStack,
  MonitoringServiceStack,
  LoadBalancerStack,
  VpcPeeringStack,
} from "../lib/stacks";
import { VpcPeeringAcceptorRole } from "../lib/constructs/iam/vpc-peering-acceptor-role";
import { CertificateStack } from "../lib/stacks/networking/security/acm-stack";
import { environments } from "../config/environments";

const app = new cdk.App();

// Domain configuration - can come from environment variables or SSM Parameter Store
// Priority: Environment variables > SSM Parameter Store
// For HTTP-only mode, leave these unset
let rootDomainName: string | undefined;
let hostedZoneId: string | undefined;

// Check environment variables first (for local testing)
if (process.env.ROOT_DOMAIN_NAME && process.env.HOSTED_ZONE_ID) {
  rootDomainName = process.env.ROOT_DOMAIN_NAME;
  hostedZoneId = process.env.HOSTED_ZONE_ID;
} else {
  // Try to fetch from SSM Parameter Store (for CI/CD)
  // Only if not explicitly disabled
  if (process.env.SKIP_DOMAIN_LOOKUP !== "true") {
    try {
      rootDomainName = cdk.aws_ssm.StringParameter.valueFromLookup(
        app,
        "/portfolio/domain/root-domain-name"
      );
      hostedZoneId = cdk.aws_ssm.StringParameter.valueFromLookup(
        app,
        "/portfolio/domain/hosted-zone-id"
      );

      // Check if we got dummy values (parameter doesn't exist)
      if (
        rootDomainName?.includes("dummy-value") ||
        hostedZoneId?.includes("dummy-value")
      ) {
        rootDomainName = undefined;
        hostedZoneId = undefined;
      }
    } catch (error) {
      // Parameters don't exist, continue without HTTPS
      rootDomainName = undefined;
      hostedZoneId = undefined;
    }
  }
}

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

// Validate required configuration
console.log(`\n🔍 Environment Configuration Validation for: ${envName}`);
console.log(`  Account: ${config.account || "NOT_SET"}`);
console.log(`  Region: ${config.region}`);

if (!config.account) {
  console.error(
    `\n❌ CRITICAL ERROR: Account ID not set for environment: ${envName}`
  );
  console.error(`   Environment variable AWS_PIPELINE_ACCOUNT_ID is required`);
  console.error(
    `   This will cause CDK environment specification parsing error`
  );
  console.error(`   Expected: aws://123456789012/eu-west-1`);
  console.error(`   Actual: aws:///eu-west-1`);

  throw new Error(
    `Account ID not configured for environment: ${envName}. ` +
      `Set AWS_PIPELINE_ACCOUNT_ID environment variable.`
  );
}

if (!config.region) {
  throw new Error(
    `Region not configured for environment: ${envName}. ` +
      `Set AWS_REGION environment variable.`
  );
}

console.log(`✅ Configuration validated successfully\n`);

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
//
// VPC CIDR allocation for multi-account setup:
// - Pipeline:    10.0.0.0/16 (default)
// - Development: 10.1.0.0/16
// - Staging:     10.2.0.0/16
// - Production:  10.3.0.0/16
const vpcCidrMap: Record<string, string> = {
  pipeline: "10.0.0.0/16",
  development: "10.1.0.0/16",
  staging: "10.2.0.0/16",
  production: "10.3.0.0/16",
};

const networkingStack = new NetworkingStack(
  app,
  `NetworkingStack-${config.envName}`,
  {
    ...stackProps,
    envName: config.envName,
    vpcCidr: vpcCidrMap[config.envName] || "10.0.0.0/16",
    maxAzs: 2,
    natGateways: 0,
    enableVpcFlowLogs: true,
  }
);

// ========================================
// 2. Storage Stack - REMOVED
// ========================================
// ECR repository is now created manually outside of CDK
// Repository URI must be stored in SSM: /ecr/{envName}/repository-uri
//
// To create ECR manually:
// 1. aws ecr create-repository --repository-name portfolio-{envName}
// 2. aws ssm put-parameter --name "/ecr/{envName}/repository-uri" \
//      --value "{account}.dkr.ecr.{region}.amazonaws.com/portfolio-{envName}" \
//      --type String

// ========================================
// 3. Compute Stack (Created after Load Balancer)
// ========================================
// Creates ECS cluster and service
// Depends on: NetworkingStack (VPC), ECR repository (manual, URI in SSM)
// Note: Will be created after Load Balancer stack to connect target group

// ========================================
// 4. Monitoring Stack (Created after Compute Stack)
// ========================================
// Will be created after Compute Stack is defined

// ========================================
// 5. Certificate Stack (Optional - for HTTPS)
// ========================================
// Certificates are managed via:
// 1. CDK-created certificates (if domain is configured)
// 2. Environment variable CERTIFICATE_ARN (from CI/CD workflow)
// 3. SSM Parameter Store lookup (for local development)
//
// Priority: Environment variable > SSM Parameter Store > Create new

let certificateArn: string | undefined;
let certificateStack: CertificateStack | undefined;

// Check if certificate ARN is provided via environment variable (from workflow)
if (process.env.CERTIFICATE_ARN) {
  certificateArn = process.env.CERTIFICATE_ARN;
  console.log(`✓ Using certificate ARN from environment variable`);
  console.log(`  Certificate: ${certificateArn}`);
} else if (rootDomainName && hostedZoneId) {
  // Create new certificate with DNS validation
  certificateStack = new CertificateStack(app, `AcmStack-${config.envName}`, {
    ...stackProps,
    envName: config.envName,
    DomainName: rootDomainName,
    subjectAlternativeNames: [`*.${rootDomainName}`],
    hostedZoneId: hostedZoneId,
    storeCertificateArnInSsm: true,
  });
  certificateArn = certificateStack.certificateArn;
  console.log(`✓ Created ACM certificate for ${rootDomainName}`);
} else if (process.env.SKIP_DOMAIN_LOOKUP !== "true") {
  // Fallback: Try to fetch certificate ARN from SSM Parameter Store
  // This is for local development only - workflow should pass via env var
  try {
    certificateArn = cdk.aws_ssm.StringParameter.valueFromLookup(
      app,
      "/portfolio/domain/acm-arn"
    );

    // Check if we got a dummy value (parameter doesn't exist)
    if (certificateArn?.includes("dummy-value")) {
      certificateArn = undefined;
      console.log(
        "⚠ Certificate ARN not found in SSM - HTTPS will be disabled"
      );
    } else if (certificateArn) {
      console.log(`✓ Using certificate ARN from SSM Parameter Store`);
      console.log(`  Certificate: ${certificateArn}`);
    }
  } catch (error) {
    // Parameter doesn't exist
    certificateArn = undefined;
    console.log("⚠ Certificate ARN not configured - HTTPS will be disabled");
  }
} else {
  console.log("Domain lookup skipped - HTTPS will be disabled");
}

// ========================================
// 6. Load Balancer Stack
// ========================================
// Creates Application Load Balancer
// Depends on: NetworkingStack (VPC)
// Uses certificate ARN from previous step (if available)

const loadBalancerStack = new LoadBalancerStack(
  app,
  `LoadBalancerStack-${config.envName}`,
  {
    ...stackProps,
    description: "Application Load Balancer infrastructure",
    envName: config.envName,
    vpc: networkingStack.vpc,
    loadBalancerName: `${config.envName}-alb`,
    enableHttps: !!certificateArn,
    certificateArn: certificateArn,
    redirectHttpToHttps: !!certificateArn,
    allowedCidrs: ["0.0.0.0/0"],
    deletionProtection: config.envName === "production",
    accessLogEnabled: true, // Enable ALB access logs for security and troubleshooting
  }
);

// Add dependencies
loadBalancerStack.addDependency(networkingStack);

// Log HTTPS status
if (certificateArn) {
  console.log("✓ Load Balancer configured with HTTPS");
  console.log("  HTTP traffic will redirect to HTTPS");
}

// ========================================
// 7. Connect ECS Service to Load Balancer
// ========================================
// Create target group for ECS service
// Note: Using INSTANCE target type because ECS is using EC2 launch type with BRIDGE networking
// If you switch to AWSVPC networking, change this to TargetType.IP
const ecsTargetGroup = loadBalancerStack.addTargetGroup({
  name: `${envName}-ecs-service`,
  port: 3000,
  protocol: elbv2.ApplicationProtocol.HTTP,
  targetType: elbv2.TargetType.INSTANCE, // INSTANCE for EC2 launch type with bridge networking
  healthCheckPath: "/api/health",
  healthCheckInterval: cdk.Duration.seconds(60),
  deregistrationDelay: cdk.Duration.seconds(30),
});

// Add listener rule to route traffic to ECS service
loadBalancerStack.addListenerRule({
  targetGroupName: `${envName}-ecs-service`,
  priority: 100,
  pathPattern: "/*",
});

// ========================================
// 8. Create Compute Stack
// ========================================
// Now create the ECS service (after target group is ready)
const computeStack = new ComputeStack(app, `ComputeStack-${config.envName}`, {
  ...stackProps,
  envName: config.envName,
  vpc: networkingStack.vpc,
  targetGroup: ecsTargetGroup, // Attach ECS service to ALB target group
});

// Explicit dependencies
computeStack.addDependency(networkingStack);
computeStack.addDependency(loadBalancerStack);

// ========================================
// 9. Configure Security Groups
// ========================================
// Allow traffic from ALB to ECS
const ecsSecurityGroup = computeStack.cluster.connections.securityGroups[0];
if (ecsSecurityGroup) {
  ecsSecurityGroup.addIngressRule(
    loadBalancerStack.getSecurityGroup(),
    cdk.aws_ec2.Port.tcp(3000),
    "Allow traffic from ALB"
  );
}

// ========================================
// 10. Monitoring Stacks (Optional)
// ========================================
// Creates CloudWatch alarms, dashboards, and Prometheus/Grafana on ECS
//
// ========================================
// PIPELINE ACCOUNT: Centralized Monitoring
// ========================================
if (config.isMonitoringAccount) {
  console.log("\n========================================");
  console.log("PIPELINE ACCOUNT: Centralized Monitoring");
  console.log("========================================");
  console.log(`VPC CIDR: ${vpcCidrMap[config.envName]}`);
  console.log(
    `Monitoring accounts: ${config.monitoredAccounts?.join(", ") || "none"}\n`
  );

  // Certificate configuration (optional)
  let monitoringCertificateArn: string | undefined;
  if (process.env.CERTIFICATE_ARN && process.env.ROOT_DOMAIN_NAME) {
    const certAccountId = process.env.CERTIFICATE_ARN.split(":")[4];
    if (certAccountId === config.account) {
      monitoringCertificateArn = process.env.CERTIFICATE_ARN;
      console.log(
        `✓ HTTPS enabled for monitoring.${process.env.ROOT_DOMAIN_NAME}`
      );
    } else {
      console.log("⚠️ Certificate cross-account - using HTTP only");
    }
  } else {
    console.log("⚠️ No certificate - using HTTP only");
  }

  // Layer 1: Infrastructure
  const monitoringInfraStack = new MonitoringInfraStack(
    app,
    `MonitoringInfraStack-${config.envName}`,
    {
      ...stackProps,
      envName: config.envName,
      vpc: networkingStack.vpc,
      certificateArn: monitoringCertificateArn,
      enableHttps: !!monitoringCertificateArn,
    }
  );
  monitoringInfraStack.addDependency(networkingStack);

  // Layer 2: Services
  const monitoringServiceStack = new MonitoringServiceStack(
    app,
    `MonitoringServiceStack-${config.envName}`,
    {
      ...stackProps,
      envName: config.envName,
      cluster: monitoringInfraStack.cluster,
      autoScalingGroup: monitoringInfraStack.autoScalingGroup,
      loadBalancer: monitoringInfraStack.loadBalancer,
      listener: monitoringInfraStack.listener,
      fileSystem: monitoringInfraStack.fileSystem,
    }
  );
  monitoringServiceStack.addDependency(monitoringInfraStack);

  console.log("✅ Pipeline monitoring stacks configured");
} else {
  // Application accounts: Local monitoring (CloudWatch + ECS monitoring)
  console.log(`\n📊 Local monitoring for ${config.envName}`);

  // CloudWatch Monitoring Stack
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
  monitoringStack.addDependency(computeStack);

  // ECS Monitoring Stack (Prometheus + Grafana on ECS)
  console.log(`   Adding ECS monitoring (Prometheus + Grafana)`);

  const monitoringEcsStack = new MonitoringEcsStack(
    app,
    `MonitoringEcsStack-${config.envName}`,
    {
      ...stackProps,
      envName: config.envName,
      vpc: networkingStack.vpc,
      albDnsName: loadBalancerStack.alb.loadBalancer.loadBalancerDnsName,
      // Enable EFS for persistent storage (data survives instance replacement)
      enablePersistence: true,
      // Optional: Restrict access to specific IPs for security
      // allowedIpRanges: ['YOUR_IP/32'],
    }
  );

  monitoringEcsStack.addDependency(networkingStack);
  monitoringEcsStack.addDependency(loadBalancerStack);

  console.log(`✅ Local monitoring configured for ${config.envName}`);
}

// ========================================
// 11. Cross-Account Monitoring Access (for centralized monitoring)
// ========================================
// If this is an application account (dev/staging/production) and we have a pipeline account,
// create IAM roles and EventBridge rules to allow centralized monitoring
if (
  !config.isMonitoringAccount &&
  config.pipelineAccount &&
  config.enableEventBridge
) {
  console.log("\n🔗 Setting up cross-account monitoring access");
  console.log(`   Pipeline account: ${config.pipelineAccount}\n`);

  // Import the stack
  const { CrossAccountMonitoringStack } = require("../lib/stacks");

  new CrossAccountMonitoringStack(
    app,
    `CrossAccountMonitoring-${config.envName}`,
    {
      ...stackProps,
      envName: config.envName,
      pipelineAccountId: config.pipelineAccount,
      enableEventBridge: true,
      enableCloudWatch: true,
      enableEcsAccess: true,
    }
  );
}

// ========================================
// 12. VPC Peering (for cross-account connectivity)
// ========================================
// VPC peering enables Prometheus in pipeline account to scrape metrics from dev/staging/prod
//
// Two components:
// 1. VpcPeeringAcceptorRole: Deployed in peer accounts (dev/staging/prod)
//    - Allows pipeline account to accept peering and update routes
// 2. VpcPeeringStack: Deployed in pipeline account
//    - Creates peering connections to all peer accounts

// In application accounts (dev/staging/prod): Create the acceptor role
if (!config.isMonitoringAccount && config.pipelineAccount) {
  console.log("\n🔗 Creating VPC Peering Acceptor Role");
  console.log(
    `   Allowing pipeline account ${config.pipelineAccount} to peer\n`
  );

  new VpcPeeringAcceptorRole(networkingStack, "VpcPeeringAcceptorRole", {
    requesterAccountId: config.pipelineAccount,
    envName: config.envName,
  });
}

// In pipeline account: Create peering connections to application accounts
// Note: This requires the acceptor roles to exist in peer accounts first
// Deploy with: ENVIRONMENT=pipeline yarn cdk deploy VpcPeeringStack-pipeline
if (
  config.isMonitoringAccount &&
  config.monitoredAccounts &&
  config.monitoredAccounts.length > 0
) {
  // Get peer VPC info from environment variables (from workflow) or SSM parameters
  // Priority: Environment variables (from workflow) > SSM parameters > Skip
  const peerAccounts: Array<{
    envName: string;
    accountId: string;
    vpcId: string;
    vpcCidr: string;
    roleArn: string;
  }> = [];

  // Check for development account peering config
  let devVpcId = process.env.DEV_VPC_ID;
  const devAccountId = process.env.AWS_ACCOUNT_ID_DEV;

  // If not provided via environment, try SSM parameter lookup
  if (!devVpcId && devAccountId && process.env.SKIP_DOMAIN_LOOKUP !== "true") {
    try {
      devVpcId = cdk.aws_ssm.StringParameter.valueFromLookup(
        app,
        "/networking/development/vpc-id"
      );

      // Check if we got a dummy value (parameter doesn't exist)
      if (devVpcId?.includes("dummy-value")) {
        devVpcId = undefined;
        console.log("⚠ Dev VPC ID not found in SSM parameter");
      } else if (devVpcId) {
        console.log(`✓ Found Dev VPC ID in SSM: ${devVpcId}`);
      }
    } catch (error) {
      console.log("⚠ Could not lookup Dev VPC ID from SSM");
      devVpcId = undefined;
    }
  }

  if (devVpcId && devAccountId && devVpcId !== "NOT_FOUND") {
    peerAccounts.push({
      envName: "development",
      accountId: devAccountId,
      vpcId: devVpcId,
      vpcCidr: vpcCidrMap["development"] || "10.1.0.0/16",
      roleArn: `arn:aws:iam::${devAccountId}:role/development-VpcPeeringAcceptorRole`,
    });
    console.log(`✓ Added development account for VPC peering: ${devVpcId}`);
  } else {
    console.log("⚠ Development account VPC peering not configured");
    console.log(
      "  Set DEV_VPC_ID and AWS_ACCOUNT_ID_DEV environment variables"
    );
    console.log(
      "  Or ensure /networking/development/vpc-id SSM parameter exists"
    );
  }

  if (peerAccounts.length > 0) {
    console.log("\n🔗 Creating VPC Peering Stack");
    console.log(
      `   Peering to: ${peerAccounts.map((p) => p.envName).join(", ")}\n`
    );

    const vpcPeeringStack = new VpcPeeringStack(
      app,
      `VpcPeeringStack-${config.envName}`,
      {
        ...stackProps,
        vpc: networkingStack.vpc, // Direct reference - no exports/imports
        envName: config.envName,
        peerAccounts: peerAccounts,
      }
    );

    // Explicit dependency to ensure proper deployment order
    vpcPeeringStack.addDependency(networkingStack);
  } else {
    console.log("\n VPC Peering: No peer accounts configured");
    console.log("   Set DEV_VPC_ID and AWS_ACCOUNT_ID_DEV to enable peering\n");
  }
}

// ========================================
// CDK Nag Integration
// ========================================
// Apply AWS Solutions security checks based on environment
// Development: Warnings only (lenient for rapid development)
// Staging/Production: Strict enforcement with verbose output
if (process.env.ENABLE_CDK_NAG !== "false") {
  const isProduction = ["production", "staging"].includes(envName);

  console.log(
    `\n CDK Nag: ${isProduction ? "STRICT" : "LENIENT"} mode for ${envName}`
  );

  Aspects.of(app).add(
    new AwsSolutionsChecks({
      verbose: true,
      // In development, we log warnings but don't fail the build
      // In production/staging, we enforce all rules
      logIgnores: !isProduction,
    })
  );

  console.log("   Use ENABLE_CDK_NAG=false to disable CDK Nag temporarily\n");
}

// Converts CDK code to CloudFormation templates

app.synth();
