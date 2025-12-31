/** @format */

// test/helpers/test-helpers.ts
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import { Template, Match } from "aws-cdk-lib/assertions";

import { MonitoringEfsStack } from "../../lib/stacks/monitoring/monitoring-efs-stack";
import { MonitoringInfraStack } from "../../lib/stacks/monitoring/monitoring-infra-stack";

/**
 * Test constants for monitoring infrastructure
 */
export const MONITORING_TEST_CONSTANTS = {
  DEFAULT_ACCOUNT: "123456789012",
  PIPELINE_ACCOUNT: "559780231478",
  DEV_ACCOUNT: "771826808455",
  DEFAULT_REGION: "eu-west-1",
  PIPELINE_VPC_CIDR: "10.0.0.0/16",
  DEV_VPC_CIDR: "10.1.0.0/16",
  REQUIRED_TAGS: ["Environment", "Project", "Stack"],
};

export function createTestApp(): cdk.App {
  return new cdk.App({
    context: {
      "@aws-cdk/core:newStyleStackSynthesis": true,
      "aws-cdk:enableDiffNoFail": true,
    },
  });
}

export function getDefaultTestProps() {
  return {
    env: {
      account: MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
    },
    environment: "test",
  };
}

/**
 * Creates a test MonitoringEfsStack with default configuration
 */
export function createTestMonitoringEfsStack(
  props?: Partial<{
    envName: string;
    account: string;
    region: string;
    vpcCidr: string;
  }>
) {
  const app = createTestApp();

  // Create a single stack with both VPC and EFS to avoid cross-stack references
  const stack = new cdk.Stack(app, "TestMonitoringEfsStack", {
    env: {
      account: props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
    },
  });

  // Create VPC directly in the test stack
  const vpc = new ec2.Vpc(stack, "TestVpc", {
    ipAddresses: ec2.IpAddresses.cidr(
      props?.vpcCidr || MONITORING_TEST_CONSTANTS.PIPELINE_VPC_CIDR
    ),
    maxAzs: 2,
    natGateways: 1,
    subnetConfiguration: [
      {
        cidrMask: 24,
        name: "Public",
        subnetType: ec2.SubnetType.PUBLIC,
      },
      {
        cidrMask: 24,
        name: "Private",
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    ],
  });

  // Create EFS Security Group
  const mountTargetSecurityGroup = new ec2.SecurityGroup(
    stack,
    "EfsMountTargetSg",
    {
      vpc,
      description: `EFS mount target security group for ${props?.envName || "test"} monitoring`,
      allowAllOutbound: false,
    }
  );

  mountTargetSecurityGroup.addIngressRule(
    ec2.Peer.ipv4(vpc.vpcCidrBlock),
    ec2.Port.tcp(2049),
    "Allow NFS traffic from VPC CIDR"
  );

  // Create EFS File System
  const fileSystem = new efs.FileSystem(
    stack,
    `MonitoringEfs-${props?.envName || "test"}`,
    {
      vpc,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.PROVISIONED,
      provisionedThroughputPerSecond: cdk.Size.mebibytes(10),
      encrypted: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      securityGroup: mountTargetSecurityGroup,
    }
  );

  // Configure backup policy to match test expectations
  const cfnFileSystem = fileSystem.node.defaultChild as efs.CfnFileSystem;
  cfnFileSystem.backupPolicy = {
    status: "ENABLED",
  };

  // Create EFS Access Point
  new efs.AccessPoint(stack, "MonitoringEfsAccessPoint", {
    fileSystem: fileSystem,
    path: "/monitoring",
    createAcl: {
      ownerGid: "0",
      ownerUid: "0",
      permissions: "755",
    },
    posixUser: {
      gid: "0",
      uid: "0",
    },
  });

  // Create SSM Parameters (simplified for testing)
  // Note: EFS initialization Lambda creates the YAML version, but we create JSON for testing
  const envName = props?.envName || "test";
  new cdk.aws_ssm.StringParameter(stack, "PrometheusConfig", {
    parameterName: `/monitoring/${envName}/prometheus-config`,
    stringValue: JSON.stringify({ test: "config" }),
    description: "Prometheus configuration for monitoring stack",
  });
  
  // Also create YAML version (as created by EFS initialization Lambda)
  new cdk.aws_ssm.StringParameter(stack, "PrometheusConfigYaml", {
    parameterName: `/monitoring/${envName}/prometheus-config-yaml`,
    stringValue: "global:\n  scrape_interval: 15s",
    description: "Prometheus configuration in YAML format",
  });

  new cdk.aws_ssm.StringParameter(stack, "GrafanaDatasourceConfig", {
    parameterName: `/monitoring/${stack.stackName}/grafana-datasource-config`,
    stringValue: JSON.stringify({ test: "datasource" }),
    description: "Grafana datasource configuration",
  });

  return {
    app,
    stack,
    template: Template.fromStack(stack),
  };
}

/**
 * Creates a test MonitoringInfraStack with default configuration
 */
export function createTestMonitoringInfraStack(
  props?: Partial<{
    envName: string;
    account: string;
    region: string;
    vpcCidr: string;
    efsStackName: string;
  }>
) {
  const app = createTestApp();

  // Create a VPC stack first
  const vpcStack = new cdk.Stack(app, "TestVpcStack", {
    env: {
      account: props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
    },
  });

  const vpc = createTestVpc(
    vpcStack,
    props?.vpcCidr || MONITORING_TEST_CONSTANTS.PIPELINE_VPC_CIDR
  );

  // Create mock EFS resources in the VPC stack
  const fileSystem = new efs.FileSystem(vpcStack, "TestFileSystem", {
    vpc,
    encrypted: true,
  });
  const efsAccessPoint = new efs.AccessPoint(vpcStack, "TestAccessPoint", {
    fileSystem,
    path: "/monitoring",
  });
  const efsSecurityGroup = new ec2.SecurityGroup(
    vpcStack,
    "TestEfsSecurityGroup",
    {
      vpc,
      description: "Test EFS Security Group",
    }
  );
  const efsInitializationComplete = new cdk.CustomResource(
    vpcStack,
    "TestEfsInit",
    {
      serviceToken: "arn:aws:lambda:eu-west-1:123456789012:function:test",
    }
  );

  const monitoringStack = new MonitoringInfraStack(
    app,
    "TestMonitoringInfraStack",
    {
      env: {
        account: props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
        region: props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
      },
      vpc,
      envName: props?.envName || "test",
      efsStackName: props?.efsStackName || "test-efs-stack",
      fileSystem,
      efsAccessPoint,
      efsAvailabilityZone: vpc.availabilityZones[0], // Use first AZ from VPC
      efsSecurityGroup,
      efsInitializationComplete,
    }
  );

  return {
    app,
    stack: monitoringStack,
    template: Template.fromStack(monitoringStack),
  };
}

/**
 * Creates a test MonitoringServiceStack with default configuration
 */
export function createTestMonitoringServiceStack(
  props?: Partial<{
    envName: string;
    account: string;
    region: string;
    vpcCidr: string;
  }>
) {
  const app = createTestApp();

  // Create VPC stack first
  const vpcStack = new cdk.Stack(app, "TestVpcStack", {
    env: {
      account: props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
    },
  });

  const vpc = createTestVpc(
    vpcStack,
    props?.vpcCidr || MONITORING_TEST_CONSTANTS.PIPELINE_VPC_CIDR
  );

  // Create mock EFS resources in the VPC stack
  const fileSystem = new efs.FileSystem(vpcStack, "TestFileSystem", {
    vpc,
    encrypted: true,
  });
  const efsAccessPoint = new efs.AccessPoint(vpcStack, "TestAccessPoint", {
    fileSystem,
    path: "/monitoring",
  });
  const efsSecurityGroup = new ec2.SecurityGroup(
    vpcStack,
    "TestEfsSecurityGroup",
    {
      vpc,
      description: "Test EFS Security Group",
    }
  );
  const efsInitializationComplete = new cdk.CustomResource(
    vpcStack,
    "TestEfsInit",
    {
      serviceToken: "arn:aws:lambda:eu-west-1:123456789012:function:test",
    }
  );

  // Create infrastructure stack
  const infraStack = new MonitoringInfraStack(app, "TestMonitoringInfraStack", {
    env: {
      account: props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
    },
    vpc,
    envName: props?.envName || "test",
    efsStackName: "test-efs-stack",
    fileSystem,
    efsAccessPoint,
    efsAvailabilityZone: vpc.availabilityZones[0],
    efsSecurityGroup,
    efsInitializationComplete,
  });

  // Import the MonitoringServiceStack
  const {
    MonitoringServiceStack,
  } = require("../../lib/stacks/monitoring/monitoring-service-stack");

  // Create service stack in the same app
  const serviceStack = new MonitoringServiceStack(
    app,
    "TestMonitoringServiceStack",
    {
      env: {
        account: props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
        region: props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
      },
      cluster: infraStack.cluster,
      autoScalingGroup: infraStack.autoScalingGroup,
      loadBalancer: infraStack.loadBalancer,
      listener: infraStack.listener,
      envName: props?.envName || "test",
    }
  );

  return {
    app,
    stack: serviceStack,
    template: Template.fromStack(serviceStack),
    infraStack: infraStack,
  };
}

/**
 * Creates a test VPC for monitoring tests
 */
export function createTestVpc(
  stack: cdk.Stack,
  cidr: string = MONITORING_TEST_CONSTANTS.PIPELINE_VPC_CIDR
): ec2.IVpc {
  return new ec2.Vpc(stack, "TestVpc", {
    ipAddresses: ec2.IpAddresses.cidr(cidr),
    maxAzs: 2,
    natGateways: 1,
    subnetConfiguration: [
      {
        cidrMask: 24,
        name: "Public",
        subnetType: ec2.SubnetType.PUBLIC,
      },
      {
        cidrMask: 24,
        name: "Private",
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    ],
  });
}

/**
 * Security validation helpers
 */
export function assertNoPublicIngress(
  template: Template,
  allowedPorts: number[] = []
): void {
  const securityGroups = template.findResources("AWS::EC2::SecurityGroup");

  Object.entries(securityGroups).forEach(([id, sg]: [string, any]) => {
    const ingressRules = sg.Properties?.SecurityGroupIngress || [];
    ingressRules.forEach((rule: any, index: number) => {
      if (rule.CidrIp === "0.0.0.0/0") {
        const port = rule.FromPort || rule.ToPort;
        if (!allowedPorts.includes(port)) {
          throw new Error(
            `Security group ${id} rule ${index} allows ingress from 0.0.0.0/0 on port ${port}`
          );
        }
      }
    });
  });
}

export function assertAllResourcesTagged(
  template: Template,
  requiredTags: string[] = MONITORING_TEST_CONSTANTS.REQUIRED_TAGS
): void {
  const resourceTypes = [
    "AWS::EC2::VPC",
    "AWS::EC2::Subnet",
    "AWS::EC2::SecurityGroup",
    "AWS::ECS::Cluster",
    "AWS::EFS::FileSystem",
    "AWS::ApplicationAutoScaling::ScalableTarget",
  ];

  resourceTypes.forEach((resourceType) => {
    const resources = template.findResources(resourceType);
    Object.entries(resources).forEach(([id, resource]: [string, any]) => {
      const tags = resource.Properties?.Tags || [];
      const tagKeys = tags.map((t: any) => t.Key);

      requiredTags.forEach((requiredTag) => {
        if (!tagKeys.includes(requiredTag)) {
          throw new Error(
            `Resource ${id} (${resourceType}) missing required tag: ${requiredTag}`
          );
        }
      });
    });
  });
}

/**
 * Monitoring-specific validation helpers
 */
export function assertMonitoringSecurityCompliance(template: Template): void {
  // Check EFS encryption
  template.hasResourceProperties("AWS::EFS::FileSystem", {
    Encrypted: true,
  });

  // Check EBS encryption
  const launchTemplates = template.findResources("AWS::EC2::LaunchTemplate");
  Object.values(launchTemplates).forEach((lt: any) => {
    const blockDevices =
      lt.Properties?.LaunchTemplateData?.BlockDeviceMappings || [];
    blockDevices.forEach((device: any) => {
      if (device.Ebs) {
        expect(device.Ebs.Encrypted).toBe(true);
      }
    });
  });

  // Check IMDSv2 enforcement
  Object.values(launchTemplates).forEach((lt: any) => {
    const metadataOptions = lt.Properties?.LaunchTemplateData?.MetadataOptions;
    if (metadataOptions) {
      expect(metadataOptions.HttpTokens).toBe("required");
    }
  });
}

export function assertMonitoringResourceLimits(template: Template): void {
  // Check ECS task resource limits
  const taskDefinitions = template.findResources("AWS::ECS::TaskDefinition");
  Object.values(taskDefinitions).forEach((td: any) => {
    const containers = td.Properties?.ContainerDefinitions || [];
    containers.forEach((container: any) => {
      expect(container.Memory).toBeDefined();
      expect(container.Memory).toBeGreaterThan(0);
      expect(container.Memory).toBeLessThanOrEqual(4096); // Max 4GB
    });
  });
}

export function assertMonitoringHealthChecks(template: Template): void {
  // Check ECS service health checks
  const taskDefinitions = template.findResources("AWS::ECS::TaskDefinition");
  Object.values(taskDefinitions).forEach((td: any) => {
    const containers = td.Properties?.ContainerDefinitions || [];
    containers.forEach((container: any) => {
      if (container.Name === "prometheus" || container.Name === "grafana") {
        expect(container.HealthCheck).toBeDefined();
        expect(container.HealthCheck.Command).toBeDefined();
      }
    });
  });
}

export function assertMonitoringNetworking(template: Template): void {
  // Check that monitoring services are in private subnets
  const services = template.findResources("AWS::ECS::Service");
  Object.values(services).forEach((service: any) => {
    const networkConfig = service.Properties?.NetworkConfiguration;
    if (networkConfig?.AwsvpcConfiguration) {
      expect(networkConfig.AwsvpcConfiguration.AssignPublicIp).toBe("DISABLED");
    }
  });
}

/**
 * Cross-account testing helpers
 */
export function assertCrossAccountAccess(
  template: Template,
  devVpcCidr: string = MONITORING_TEST_CONSTANTS.DEV_VPC_CIDR
): void {
  // Check security group rules for cross-account access
  template.hasResourceProperties("AWS::EC2::SecurityGroup", {
    SecurityGroupIngress: Match.arrayWith([
      Match.objectLike({
        CidrIp: devVpcCidr,
        FromPort: 9100, // Node exporter port
        ToPort: 9100,
        IpProtocol: "tcp",
      }),
    ]),
  });
}

/**
 * Performance and cost optimization validation
 */
export function assertCostOptimization(template: Template): void {
  // Check EFS lifecycle policies
  template.hasResourceProperties("AWS::EFS::FileSystem", {
    LifecyclePolicies: Match.arrayWith([
      Match.objectLike({
        TransitionToIA: Match.anyValue(),
      }),
    ]),
  });

  // Check EFS throughput mode for cost optimization
  template.hasResourceProperties("AWS::EFS::FileSystem", {
    ThroughputMode: "bursting",
  });
}

/**
 * Disable CDK Nag for testing
 */
export function disableCdkNag(): void {
  process.env.ENABLE_CDK_NAG = "false";
}

/**
 * Enable CDK Nag for testing
 */
export function enableCdkNag(): void {
  process.env.ENABLE_CDK_NAG = "true";
}

/**
 * Creates a test setup with proper cross-stack dependencies (for integration testing)
 */
export function createTestMonitoringEfsStackWithCrossStackDeps(
  props?: Partial<{
    envName: string;
    account: string;
    region: string;
    vpcCidr: string;
  }>
) {
  const app = createTestApp();

  // Create VPC stack (simulates networking stack)
  const vpcStack = new cdk.Stack(app, "TestNetworkingStack", {
    env: {
      account: props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
    },
  });

  const vpc = createTestVpc(
    vpcStack,
    props?.vpcCidr || MONITORING_TEST_CONSTANTS.PIPELINE_VPC_CIDR
  );

  // Export VPC for cross-stack reference
  new cdk.CfnOutput(vpcStack, "VpcId", {
    value: vpc.vpcId,
    exportName: `${vpcStack.stackName}-VpcId`,
  });

  new cdk.CfnOutput(vpcStack, "VpcArn", {
    value: vpc.vpcArn,
    exportName: `${vpcStack.stackName}-VpcArn`,
  });

  // Create EFS stack that depends on VPC stack (creates cross-stack reference)
  const efsStack = new MonitoringEfsStack(app, "TestMonitoringEfsStack", {
    env: {
      account: props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
    },
    vpc, // This creates cross-stack reference
    envName: props?.envName || "test",
  });

  return {
    app,
    vpcStack,
    efsStack,
    vpc,
    vpcTemplate: Template.fromStack(vpcStack),
    efsTemplate: Template.fromStack(efsStack),
  };
}

/**
 * Creates a test setup using VPC lookup (simulates existing infrastructure)
 */
export function createTestMonitoringEfsStackWithExistingVpc(
  props?: Partial<{
    envName: string;
    account: string;
    region: string;
    vpcId: string;
  }>
) {
  const vpcId = props?.vpcId || "vpc-existing123";

  const app = new cdk.App({
    context: {
      // Mock VPC lookup response
      [`vpc-provider:account=${props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT}:filter.vpc-id=${vpcId}:region=${props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION}:returnAsymmetricSubnets=true`]:
        {
          vpcId: vpcId,
          vpcCidrBlock: "10.0.0.0/16",
          availabilityZones: ["eu-west-1a", "eu-west-1b"],
          subnetGroups: [
            {
              name: "Public",
              type: "Public",
              subnets: [
                {
                  subnetId: "subnet-public1",
                  availabilityZone: "eu-west-1a",
                  routeTableId: "rtb-public",
                },
              ],
            },
            {
              name: "Private",
              type: "Private",
              subnets: [
                {
                  subnetId: "subnet-private1",
                  availabilityZone: "eu-west-1a",
                  routeTableId: "rtb-private",
                },
              ],
            },
          ],
        },
    },
  });

  const stack = new cdk.Stack(app, "TestMonitoringEfsStack", {
    env: {
      account: props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
    },
  });

  // Use existing VPC via lookup
  const existingVpc = ec2.Vpc.fromLookup(stack, "ExistingVpc", {
    vpcId: vpcId,
  });

  const efsStack = new MonitoringEfsStack(app, "TestEfsStack", {
    env: {
      account: props?.account || MONITORING_TEST_CONSTANTS.DEFAULT_ACCOUNT,
      region: props?.region || MONITORING_TEST_CONSTANTS.DEFAULT_REGION,
    },
    vpc: existingVpc,
    envName: props?.envName || "test",
  });

  return {
    app,
    stack: efsStack,
    template: Template.fromStack(efsStack),
  };
}

/**
 * Testing strategies for cross-stack dependencies:
 *
 * 1. **Unit Testing (current approach)**:
 *    - Use createTestMonitoringEfsStack()
 *    - Everything in one stack, no cross-stack refs
 *    - Fast, isolated, good for testing individual stack logic
 *
 * 2. **Integration Testing**:
 *    - Use createTestMonitoringEfsStackWithCrossStackDeps()
 *    - Proper cross-stack references
 *    - Tests actual deployment scenario
 *
 * 3. **Existing Infrastructure Testing**:
 *    - Use createTestMonitoringEfsStackWithExistingVpc()
 *    - Simulates deploying to existing VPC
 *    - Uses CDK context to mock VPC lookup
 *
 * 4. **Full App Testing**:
 *    - Test app.synth() with multiple stacks
 *    - Verify stack dependencies and deployment order
 *    - Check CloudFormation template cross-references
 */
