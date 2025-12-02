#!/usr/bin/env node
/** @format */

// Better TypeScript stack traces for debugging
import "source-map-support/register";
// Loads .env file for local development (not used in CI/CD)
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
  NetworkingStack,
  StorageStack,
  ComputeStack,
  MonitoringStack,
  MonitoringEc2Stack,
  LoadBalancerStack,
} from "../lib/stacks";
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
// 3. Compute Stack (Created after Load Balancer)
// ========================================
// Creates ECS cluster and service
// Depends on: NetworkingStack (VPC), StorageStack (ECR)
// Note: Will be created after Load Balancer stack to connect target group

// ========================================
// 4. Monitoring Stack (Created after Compute Stack)
// ========================================
// Will be created after Compute Stack is defined

// ========================================
// 5. Certificate Configuration
// ========================================
// Certificates are managed manually in root account (where Route 53 hosted zone lives)
// Certificate ARN is stored in SSM Parameter Store: /portfolio/domain/acm-arn
//
// To create/update certificate:
// 1. Create certificate in AWS Console (ACM) in root account
// 2. Use DNS validation with Route 53
// 3. Store ARN in SSM:
//    aws ssm put-parameter --name "/portfolio/domain/acm-arn" \
//      --value "arn:aws:acm:eu-west-1:ACCOUNT:certificate/ID" \
//      --type String --overwrite --profile github-actions
//
// For local override, set CERTIFICATE_ARN environment variable

let certificateArn: string | undefined;

// Check if certificate ARN is provided (for cross-account scenarios)
// Priority: Environment variable > SSM Parameter Store > Create new
if (process.env.CERTIFICATE_ARN) {
  certificateArn = process.env.CERTIFICATE_ARN;
  console.log(`Using certificate from environment: ${certificateArn}`);
} else if (process.env.SKIP_DOMAIN_LOOKUP !== "true") {
  // Try to fetch certificate ARN from SSM Parameter Store
  try {
    certificateArn = cdk.aws_ssm.StringParameter.valueFromLookup(
      app,
      "/portfolio/domain/acm-arn"
    );

    // Check if we got a dummy value (parameter doesn't exist)
    if (certificateArn?.includes("dummy-value")) {
      certificateArn = undefined;
    } else if (certificateArn) {
      console.log(`Using certificate from SSM: ${certificateArn}`);
    }
  } catch (error) {
    // Parameter doesn't exist, will try to create certificate
    certificateArn = undefined;
  }
}

// ========================================
// 6. Load Balancer Stack
// ========================================
// Creates Application Load Balancer
// Depends on: NetworkingStack (VPC)
// Uses certificate ARN from SSM Parameter Store (if available)
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
    tags: {
      Environment: config.envName,
      Project: "portfolio",
      ManagedBy: "cdk",
    },
  }
);

// Add dependencies
loadBalancerStack.addDependency(networkingStack);

// ========================================
// 7. Connect ECS Service to Load Balancer
// ========================================
// Create target group for ECS service
const ecsTargetGroup = loadBalancerStack.addTargetGroup({
  name: `ecs-service-${envName}`,
  port: 3000,
  healthCheckPath: "/api/health",
  protocol: elbv2.ApplicationProtocol.HTTP,
  targetType: elbv2.TargetType.IP,
  healthCheckIntervalSeconds: 30,
  deregistrationDelay: cdk.Duration.seconds(30),
  createListener: true,
  listenerPriority: 100,
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
  repository: storageStack.repository,
  targetGroup: ecsTargetGroup, // Attach ECS service to ALB target group
});

// Explicit dependencies
computeStack.addDependency(networkingStack);
computeStack.addDependency(storageStack);
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
// Creates CloudWatch alarms, dashboards, and Prometheus/Grafana on EC2
// Depends on: ComputeStack (ECS cluster and service), LoadBalancerStack (ALB DNS)
if (config.enableMonitoring) {
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

  // EC2 Monitoring Stack (Prometheus + Grafana)
  const monitoringEc2Stack = new MonitoringEc2Stack(
    app,
    `MonitoringEc2Stack-${config.envName}`,
    {
      ...stackProps,
      envName: config.envName,
      vpc: networkingStack.vpc,
      albDnsName:
        loadBalancerStack.loadBalancer.loadBalancer.loadBalancerDnsName,
      // Optional: Restrict Grafana access to specific IPs
      // allowedIpRanges: ['YOUR_IP/32'],
    }
  );

  monitoringEc2Stack.addDependency(networkingStack);
  monitoringEc2Stack.addDependency(loadBalancerStack);
}

// Converts CDK code to CloudFormation templates

app.synth();
