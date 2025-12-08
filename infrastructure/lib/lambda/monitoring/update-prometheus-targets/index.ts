/** @format */

import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeInstancesCommandInput,
} from '@aws-sdk/client-ec2';
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
} from '@aws-sdk/client-ssm';

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

interface EnvironmentTarget {
  environment: string;
  accountId: string;
  ip?: string;
}

/**
 * Lambda handler triggered by EC2 state change events
 * Automatically updates Prometheus targets when instances start/stop
 */
export const handler = async (event: any): Promise<void> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const pipelineInstanceId = process.env.PIPELINE_INSTANCE_ID;
  if (!pipelineInstanceId) {
    throw new Error('PIPELINE_INSTANCE_ID environment variable not set');
  }

  // Get current IPs for all environments
  const targets = await getEnvironmentTargets();

  // Generate Prometheus config
  const config = generatePrometheusConfig(targets);

  // Upload config to EFS via SSM
  await uploadConfigToEFS(pipelineInstanceId, config);

  // Reload Prometheus
  await reloadPrometheus(pipelineInstanceId);

  console.log('✓ Prometheus targets updated successfully');
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

    if (response.Status === 'Success') {
      console.log('✓ SSM command completed');
      return;
    }

    if (response.Status === 'Failed') {
      throw new Error(`SSM command failed: ${response.StandardErrorContent}`);
    }
  }

  throw new Error('SSM command timed out');
}
