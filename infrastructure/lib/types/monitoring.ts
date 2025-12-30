/** @format */

/**
 * Cross-account monitoring target configuration
 * Used by both EFS and ECS monitoring stacks for consistent target definition
 */
export interface CrossAccountTarget {
  /** Environment name (e.g., 'development', 'staging', 'production') */
  envName: string;
  /** Private IP address of the target instance (for static configs - deprecated, use EC2 service discovery) */
  privateIp?: string;
  /** Port to scrape (default: 9100 for node-exporter, 9090 for application) */
  port: number;
  /** Target type: 'node-exporter' or 'application' */
  targetType: "node-exporter" | "application";
  /** Metrics path (default: /metrics for node-exporter, /api/metrics for application) */
  metricsPath?: string;
  /** AWS Account ID for cross-account EC2 service discovery */
  accountId?: string;
  /** IAM Role ARN for cross-account EC2 service discovery (e.g., 'arn:aws:iam::ACCOUNT:role/env-PipelineMonitoringAccess') */
  roleArn?: string;
  /** Use EC2 service discovery instead of static configs (default: true if accountId and roleArn are provided) */
  useEc2ServiceDiscovery?: boolean;
}
