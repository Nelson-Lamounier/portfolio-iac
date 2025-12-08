/** @format */

import {
  EC2Client,
  DescribeInstancesCommand,
  type DescribeInstancesCommandInput,
} from "@aws-sdk/client-ec2";
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
} from "@aws-sdk/client-ssm";
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

interface EnvironmentTarget {
  environment: string;
  accountId: string | undefined;
  ip?: string;
}

/**
 * Lambda handler triggered by:
 * 1. S3 events (config file updates)
 * 2. EC2 state change events (instance start/stop)
 *
 * Syncs monitoring configuration from S3 to EFS
 */
export const handler = async (event: any): Promise<void> => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const pipelineInstanceId = process.env.PIPELINE_INSTANCE_ID;
  const configBucket = process.env.CONFIG_BUCKET;

  if (!pipelineInstanceId) {
    throw new Error("PIPELINE_INSTANCE_ID environment variable not set");
  }

  if (!configBucket) {
    throw new Error("CONFIG_BUCKET environment variable not set");
  }

  // Determine event source
  const isS3Event = event.Records?.[0]?.eventSource === "aws:s3";
  const isEC2Event = event.source === "aws.ec2";

  if (isS3Event) {
    console.log("S3 event detected - syncing specific file");
    const s3Key = event.Records[0].s3.object.key;
    await syncFileFromS3ToEFS(configBucket, s3Key, pipelineInstanceId);
  } else if (isEC2Event) {
    console.log("EC2 event detected - updating Prometheus targets");
    await updatePrometheusTargets(configBucket, pipelineInstanceId);
  } else {
    console.log("Manual invocation - syncing all configs");
    await syncAllConfigsFromS3ToEFS(configBucket, pipelineInstanceId);
  }

  // Reload Prometheus
  await reloadPrometheus(pipelineInstanceId);

  console.log("✓ Configuration sync completed successfully");
};

/**
 * Get private IPs for all environment instances
 */
async function getEnvironmentTargets(): Promise<EnvironmentTarget[]> {
  const environments = [
    { environment: 'development', accountId: process.env.DEV_ACCOUNT_ID },
    { environment: 'staging', accountId: process.env.STAGING_ACCOUNT_ID },
    { environment: 'production', accountId: process.env.PROD_ACCOUNT_ID },
  ];

  const targets: EnvironmentTarget[] = [];

  for (const env of environments) {
    if (!env.accountId) continue;

    try {
      const ip = await getInstanceIp(env.environment);
      if (ip) {
        targets.push({ ...env, ip });
        console.log(`✓ ${env.environment}: ${ip}`);
      }
    } catch (error) {
      console.warn(`⚠ ${env.environment}: not found or not running`);
    }
  }

  return targets;
}

/**
 * Get private IP of running instance for an environment
 */
async function getInstanceIp(environment: string): Promise<string | null> {
  const params: DescribeInstancesCommandInput = {
    Filters: [
      { Name: 'tag:Environment', Values: [environment] },
      { Name: 'instance-state-name', Values: ['running'] },
    ],
  };

  const command = new DescribeInstancesCommand(params);
  const response = await ec2Client.send(command);

  const instance = response.Reservations?.[0]?.Instances?.[0];
  return instance?.PrivateIpAddress || null;
}

/**
 * Generate Prometheus configuration with current targets
 */
function generatePrometheusConfig(targets: EnvironmentTarget[]): string {
  const timestamp = new Date().toISOString();

  let config = `# @format
# Auto-generated Prometheus Configuration
# Last updated: ${timestamp}

global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    environment: 'pipeline'
    cluster: 'pipeline-monitoring'

rule_files:
  - /etc/prometheus/alerts.yml

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    metrics_path: /prometheus/metrics
    static_configs:
      - targets: ['localhost:9090']
        labels:
          service: 'prometheus'

  # Node Exporter - Pipeline
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
        labels:
          service: 'node-exporter'
          instance: 'pipeline-monitoring'
`;

  // Add targets for each environment
  for (const target of targets) {
    if (!target.ip) continue;

    config += `
  # ${target.environment.charAt(0).toUpperCase() + target.environment.slice(1)} Environment
  - job_name: 'node-exporter-${target.environment}'
    static_configs:
      - targets: ['${target.ip}:9100']
        labels:
          service: 'node-exporter'
          environment: '${target.environment}'
          account: '${target.environment}'

  - job_name: 'nextjs-${target.environment}'
    metrics_path: /api/metrics
    static_configs:
      - targets: ['${target.ip}:3000']
        labels:
          service: 'nextjs'
          environment: '${target.environment}'
          account: '${target.environment}'
`;
  }

  return config;
}

/**
 * Upload Prometheus config to EFS via SSM
 */
async function uploadConfigToEFS(
  instanceId: string,
  config: string
): Promise<void> {
  const escapedConfig = config.replace(/'/g, "'\\''");

  const command = new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: {
      commands: [
        `cat > /tmp/prometheus.yml <<'EOFCONFIG'\n${config}\nEOFCONFIG`,
        'sudo mv /tmp/prometheus.yml /mnt/efs/config/prometheus/prometheus.yml',
        'sudo chown 65534:65534 /mnt/efs/config/prometheus/prometheus.yml',
        'sudo chmod 644 /mnt/efs/config/prometheus/prometheus.yml',
        "echo 'Config updated'",
      ],
    },
  });

  const response = await ssmClient.send(command);
  const commandId = response.Command?.CommandId;

  if (!commandId) {
    throw new Error('Failed to send SSM command');
  }

  // Wait for command to complete
  await waitForCommand(commandId, instanceId);
}

/**
 * Reload Prometheus configuration without restart
 */
async function reloadPrometheus(instanceId: string): Promise<void> {
  const command = new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: {
      commands: ['curl -X POST http://localhost:9090/prometheus/-/reload'],
    },
  });

  await ssmClient.send(command);
  console.log('✓ Prometheus reload triggered');
}

/**
 * Wait for SSM command to complete
 */
async function waitForCommand(
  commandId: string,
  instanceId: string,
  maxAttempts = 10
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const command = new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId,
    });

    const response = await ssmClient.send(command);

    if (response.Status === "Success") {
      console.log("✓ SSM command completed");
      return;
    }

    if (response.Status === "Failed") {
      throw new Error(`SSM command failed: ${response.StandardErrorContent}`);
    }
  }

  throw new Error("SSM command timed out");
}

/**
 * Sync a specific file from S3 to EFS
 */
async function syncFileFromS3ToEFS(
  bucket: string,
  key: string,
  instanceId: string
): Promise<void> {
  console.log(`Syncing ${key} from S3 to EFS...`);

  // Download file from S3
  const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(getCommand);
  const content = await response.Body?.transformToString();

  if (!content) {
    throw new Error(`Failed to read ${key} from S3`);
  }

  // Determine target path on EFS
  const efsPath = `/mnt/efs/config/${key}`;

  // Upload to EFS via SSM
  const uploadCommand = new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: "AWS-RunShellScript",
    Parameters: {
      commands: [
        `mkdir -p $(dirname ${efsPath})`,
        `cat > /tmp/config_file <<'EOFCONFIG'\n${content}\nEOFCONFIG`,
        `sudo mv /tmp/config_file ${efsPath}`,
        `sudo chown 65534:65534 ${efsPath}`,
        `sudo chmod 644 ${efsPath}`,
        `echo 'File synced: ${key}'`,
      ],
    },
  });

  const uploadResponse = await ssmClient.send(uploadCommand);
  const commandId = uploadResponse.Command?.CommandId;

  if (!commandId) {
    throw new Error("Failed to send SSM command");
  }

  await waitForCommand(commandId, instanceId);
  console.log(`✓ ${key} synced to EFS`);
}

/**
 * Sync all configuration files from S3 to EFS
 */
async function syncAllConfigsFromS3ToEFS(
  bucket: string,
  instanceId: string
): Promise<void> {
  console.log("Syncing all configs from S3 to EFS...");

  // List all objects in the bucket
  const listCommand = new ListObjectsV2Command({ Bucket: bucket });
  const listResponse = await s3Client.send(listCommand);

  const files = listResponse.Contents || [];
  console.log(`Found ${files.length} files to sync`);

  // Sync each file
  for (const file of files) {
    if (file.Key) {
      await syncFileFromS3ToEFS(bucket, file.Key, instanceId);
    }
  }

  console.log("✓ All configs synced");
}

/**
 * Update Prometheus targets based on EC2 state changes
 */
async function updatePrometheusTargets(
  bucket: string,
  instanceId: string
): Promise<void> {
  console.log("Updating Prometheus targets...");

  // Get current IPs for all environments
  const targets = await getEnvironmentTargets();

  // Generate updated Prometheus config
  const config = generatePrometheusConfig(targets);

  // Upload directly to EFS (bypass S3 for dynamic targets)
  await uploadConfigToEFS(instanceId, config);

  console.log("✓ Prometheus targets updated");
}
