/** @format */

// test/unit/monitoring/monitoring-test-config.ts

/**
 * Monitoring test configuration and utilities
 */

export const MONITORING_TEST_CONFIG = {
  // Test environments
  ENVIRONMENTS: {
    TEST: "test",
    PIPELINE: "pipeline",
    DEVELOPMENT: "development",
    PRODUCTION: "production",
  },

  // AWS Account IDs for testing
  ACCOUNTS: {
    PIPELINE: "559780231478",
    DEV: "771826808455",
    TEST: "123456789012",
  },

  // Network configuration
  NETWORK: {
    PIPELINE_VPC_CIDR: "10.0.0.0/16",
    DEV_VPC_CIDR: "10.1.0.0/16",
    TEST_VPC_CIDR: "10.2.0.0/16",
  },

  // Service ports
  PORTS: {
    PROMETHEUS: 9090,
    GRAFANA: 3000,
    NODE_EXPORTER: 9100,
    ALB_HTTP: 80,
    ALB_HTTPS: 443,
    EFS_NFS: 2049,
  },

  // Resource limits for testing
  LIMITS: {
    MAX_MEMORY_MB: 4096,
    MIN_MEMORY_MB: 128,
    MAX_CPU_UNITS: 2048,
    MIN_CPU_UNITS: 256,
    MAX_LOG_RETENTION_DAYS: 365,
    MIN_LOG_RETENTION_DAYS: 1,
  },

  // Required tags for compliance
  REQUIRED_TAGS: ["Environment", "Project", "Stack", "Owner", "CostCenter"],

  // Security compliance rules
  SECURITY: {
    FORBIDDEN_CIDRS: ["0.0.0.0/0"],
    ALLOWED_PUBLIC_PORTS: [80, 443],
    REQUIRED_ENCRYPTION: true,
    IMDSV2_REQUIRED: true,
  },

  // Performance thresholds
  PERFORMANCE: {
    MAX_TASK_DEFINITIONS: 10,
    MAX_SECURITY_GROUPS: 15,
    MAX_IAM_ROLES: 10,
    MAX_LOG_GROUPS: 20,
  },
};

/**
 * Test data generators
 */
export class MonitoringTestDataGenerator {
  static generateVpcId(environment: string = "test"): string {
    return `vpc-${environment}-${Math.random().toString(36).substr(2, 8)}`;
  }

  static generateEfsId(): string {
    return `fs-${Math.random().toString(36).substr(2, 8)}`;
  }

  static generateAccessPointId(): string {
    return `fsap-${Math.random().toString(36).substr(2, 8)}`;
  }

  static generateSecurityGroupId(): string {
    return `sg-${Math.random().toString(36).substr(2, 8)}`;
  }

  static generateClusterId(environment: string = "test"): string {
    return `${environment}-monitoring-cluster`;
  }

  static generateTargetGroupArn(
    account: string = MONITORING_TEST_CONFIG.ACCOUNTS.TEST
  ): string {
    return `arn:aws:elasticloadbalancing:eu-west-1:${account}:targetgroup/test-tg/${Math.random().toString(36).substr(2, 16)}`;
  }

  static generateTestEnvironment(
    overrides: Partial<{
      environment: string;
      account: string;
      region: string;
      vpcCidr: string;
    }> = {}
  ) {
    return {
      environment:
        overrides.environment || MONITORING_TEST_CONFIG.ENVIRONMENTS.TEST,
      account: overrides.account || MONITORING_TEST_CONFIG.ACCOUNTS.TEST,
      region: overrides.region || "eu-west-1",
      vpcCidr:
        overrides.vpcCidr || MONITORING_TEST_CONFIG.NETWORK.TEST_VPC_CIDR,
    };
  }
}

/**
 * Test validation utilities
 */
export class MonitoringTestValidators {
  static validatePortConfiguration(
    port: number,
    allowedPorts: number[]
  ): boolean {
    return allowedPorts.includes(port);
  }

  static validateResourceLimits(memory: number, cpu: number): boolean {
    return (
      memory >= MONITORING_TEST_CONFIG.LIMITS.MIN_MEMORY_MB &&
      memory <= MONITORING_TEST_CONFIG.LIMITS.MAX_MEMORY_MB &&
      cpu >= MONITORING_TEST_CONFIG.LIMITS.MIN_CPU_UNITS &&
      cpu <= MONITORING_TEST_CONFIG.LIMITS.MAX_CPU_UNITS
    );
  }

  static validateTagCompliance(
    tags: Array<{ Key: string; Value: string }>
  ): string[] {
    const tagKeys = tags.map((t) => t.Key);
    return MONITORING_TEST_CONFIG.REQUIRED_TAGS.filter(
      (requiredTag) => !tagKeys.includes(requiredTag)
    );
  }

  static validateSecurityGroupRule(rule: any): boolean {
    // Check for forbidden CIDR blocks
    if (MONITORING_TEST_CONFIG.SECURITY.FORBIDDEN_CIDRS.includes(rule.CidrIp)) {
      const port = rule.FromPort || rule.ToPort;
      return MONITORING_TEST_CONFIG.SECURITY.ALLOWED_PUBLIC_PORTS.includes(
        port
      );
    }
    return true;
  }

  static validateEncryptionSettings(resource: any): boolean {
    if (resource.Type === "AWS::EFS::FileSystem") {
      return resource.Properties?.Encrypted === true;
    }
    if (resource.Type === "AWS::EC2::LaunchTemplate") {
      const blockDevices =
        resource.Properties?.LaunchTemplateData?.BlockDeviceMappings || [];
      return blockDevices.every(
        (device: any) => !device.Ebs || device.Ebs.Encrypted === true
      );
    }
    return true;
  }
}

/**
 * Mock data for testing
 */
export const MONITORING_TEST_MOCKS = {
  VPC_ID: "vpc-test123456",
  EFS_ID: "fs-test123456",
  ACCESS_POINT_ID: "fsap-test123456",
  SECURITY_GROUP_ID: "sg-test123456",
  CLUSTER_ID: "test-monitoring-cluster",
  TARGET_GROUP_ARN:
    "arn:aws:elasticloadbalancing:eu-west-1:123456789012:targetgroup/test/1234567890123456",

  PROMETHEUS_CONFIG: {
    global: {
      scrape_interval: "15s",
      evaluation_interval: "15s",
    },
    scrape_configs: [
      {
        job_name: "prometheus",
        static_configs: [{ targets: ["localhost:9090"] }],
      },
    ],
  },

  GRAFANA_DATASOURCE: {
    apiVersion: 1,
    datasources: [
      {
        name: "Prometheus",
        type: "prometheus",
        url: "http://localhost:9090",
        access: "proxy",
        isDefault: true,
      },
    ],
  },
};
