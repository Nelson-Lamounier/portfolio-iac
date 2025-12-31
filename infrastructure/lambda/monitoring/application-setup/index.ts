/**
 * Application Setup Lambda Function
 *
 * This Lambda function handles application setup (EFS, Prometheus, Grafana)
 * after an EC2 instance has been registered with the ECS cluster.
 *
 * Triggered by:
 * - ECS Container Instance State Change Event (when instance registers)
 * - Manual invocation for existing instances
 *
 * Uses SSM Run Command to execute setup scripts on the instance.
 *
 * @format
 */

import * as https from "https";
import * as url from "url";

import {
  ECSClient,
  ListContainerInstancesCommand,
  DescribeContainerInstancesCommand,
  ContainerInstanceStatus,
  ContainerInstance,
} from "@aws-sdk/client-ecs";
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
  CommandStatus,
} from "@aws-sdk/client-ssm";
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
} from "aws-lambda";

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION || "us-east-1",
});
const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || "us-east-1",
});

interface ApplicationSetupEvent {
  clusterName: string;
  instanceId?: string; // Optional: if provided, setup this specific instance
  fileSystemId: string;
  efsStackName: string;
  region: string;
  envName: string;
}

/**
 * Lambda handler - supports both EventBridge events and Custom Resource events
 */
export const handler = async (
  event: ApplicationSetupEvent | CloudFormationCustomResourceEvent
): Promise<void | CloudFormationCustomResourceResponse> => {
  console.log("Application Setup Lambda started");
  console.log("Event:", JSON.stringify(event, null, 2));

  // Check if this is a Custom Resource event
  if ("RequestType" in event) {
    return handleCustomResourceEvent(
      event as CloudFormationCustomResourceEvent
    );
  }

  // Handle EventBridge event
  const appEvent = event as ApplicationSetupEvent;
  const {
    clusterName,
    instanceId,
    fileSystemId,
    efsStackName,
    region,
    envName,
  } = appEvent;

  // If instanceId is provided, use it directly
  // Otherwise, find the most recently registered instance
  let targetInstanceId = instanceId;

  if (!targetInstanceId) {
    console.log(`Finding container instances in cluster: ${clusterName}`);
    targetInstanceId = await findLatestContainerInstance(clusterName);
  }

  if (!targetInstanceId) {
    console.log("No container instances found. Skipping application setup.");
    return;
  }

  console.log(`Setting up application on instance: ${targetInstanceId}`);

  // Execute application setup script via SSM Run Command
  await executeApplicationSetup(targetInstanceId, {
    fileSystemId,
    efsStackName,
    region,
    envName,
  });

  // Reload Prometheus configuration after update
  await reloadPrometheusConfig(targetInstanceId);

  console.log("✓ Application setup completed successfully");
};

/**
 * Handle Custom Resource events (Create, Update, Delete)
 */
async function handleCustomResourceEvent(
  event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceResponse> {
  const requestType = event.RequestType;
  const props = event.ResourceProperties as unknown as ApplicationSetupEvent;

  console.log(`Custom Resource ${requestType} event`);

  try {
    if (requestType === "Create" || requestType === "Update") {
      // Find all container instances and update them
      const instanceIds = await findAllContainerInstances(props.clusterName);

      if (instanceIds.length === 0) {
        console.log(
          "No container instances found. Skipping application setup."
        );
      } else {
        // Update all instances
        for (const instanceId of instanceIds) {
          console.log(`Setting up application on instance: ${instanceId}`);
          await executeApplicationSetup(instanceId, {
            fileSystemId: props.fileSystemId,
            efsStackName: props.efsStackName,
            region: props.region,
            envName: props.envName,
          });

          // Reload Prometheus configuration
          await reloadPrometheusConfig(instanceId);
        }
      }
    }

    // Send success response
    const response: CloudFormationCustomResourceResponse = {
      Status: "SUCCESS",
      PhysicalResourceId: `application-setup-${props.clusterName}`,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: {
        Message: `Application setup ${requestType} completed`,
        InstanceCount:
          requestType === "Delete"
            ? 0
            : (await findAllContainerInstances(props.clusterName)).length,
      },
    };
    await sendCustomResourceResponse(event, response);

    return {
      Status: "SUCCESS",
      PhysicalResourceId: `application-setup-${props.clusterName}`,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: {},
    };
  } catch (error) {
    console.error("Error in Custom Resource handler:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    const failureResponse: CloudFormationCustomResourceResponse = {
      Status: "FAILED",
      PhysicalResourceId:
        (event as any).PhysicalResourceId ||
        `application-setup-${props.clusterName}`,
      Reason: errorMessage,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: {},
    };
    await sendCustomResourceResponse(event, failureResponse);

    throw error;
  }
}

/**
 * Find all container instances in the cluster
 */
async function findAllContainerInstances(
  clusterName: string
): Promise<string[]> {
  try {
    const listResponse = await ecsClient.send(
      new ListContainerInstancesCommand({ cluster: clusterName })
    );

    if (
      !listResponse.containerInstanceArns ||
      listResponse.containerInstanceArns.length === 0
    ) {
      return [];
    }

    const describeResponse = await ecsClient.send(
      new DescribeContainerInstancesCommand({
        cluster: clusterName,
        containerInstances: listResponse.containerInstanceArns,
      })
    );

    if (!describeResponse.containerInstances) {
      return [];
    }

    return describeResponse.containerInstances
      .filter(
        (ci) => ci.status === ContainerInstanceStatus.ACTIVE && ci.ec2InstanceId
      )
      .map((ci) => ci.ec2InstanceId!)
      .filter((id): id is string => id !== undefined);
  } catch (error) {
    console.error("Error finding container instances:", error);
    throw error;
  }
}

/**
 * Reload Prometheus configuration using lifecycle API
 */
async function reloadPrometheusConfig(instanceId: string): Promise<void> {
  try {
    console.log("Reloading Prometheus configuration...");
    const command = new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: {
        commands: [
          "curl -X POST http://localhost:9090/prometheus/-/reload || echo 'Prometheus reload failed (may not be running yet)'",
        ],
      },
      TimeoutSeconds: 30,
    });

    await ssmClient.send(command);
    console.log("✓ Prometheus reload triggered");
  } catch (error) {
    console.warn(
      "Failed to reload Prometheus (may not be running yet):",
      error
    );
    // Don't throw - this is non-critical
  }
}

/**
 * Send Custom Resource response to CloudFormation
 */
async function sendCustomResourceResponse(
  event: CloudFormationCustomResourceEvent,
  response: CloudFormationCustomResourceResponse
): Promise<void> {
  const responseBody = JSON.stringify({
    Status: response.Status,
    Reason:
      response.Reason ||
      `See CloudWatch Logs for requestId: ${event.RequestId}`,
    PhysicalResourceId: response.PhysicalResourceId || event.RequestId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: response.Data || {},
  });

  const parsedUrl = url.parse(event.ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(responseBody),
    },
  };

  await new Promise<void>((resolve, reject) => {
    const req = https.request(options, (res) => {
      res.on("data", () => undefined);
      res.on("end", resolve);
    });

    req.on("error", (err) => {
      console.error("sendCustomResourceResponse error:", err);
      reject(err);
    });

    req.write(responseBody);
    req.end();
  });
}

/**
 * Find the most recently registered container instance
 */
async function findLatestContainerInstance(
  clusterName: string
): Promise<string | undefined> {
  try {
    // List all container instances
    const listResponse = await ecsClient.send(
      new ListContainerInstancesCommand({ cluster: clusterName })
    );

    if (
      !listResponse.containerInstanceArns ||
      listResponse.containerInstanceArns.length === 0
    ) {
      return undefined;
    }

    // Describe container instances to get EC2 instance IDs
    const describeResponse = await ecsClient.send(
      new DescribeContainerInstancesCommand({
        cluster: clusterName,
        containerInstances: listResponse.containerInstanceArns,
      })
    );

    if (
      !describeResponse.containerInstances ||
      describeResponse.containerInstances.length === 0
    ) {
      return undefined;
    }

    // Find active instances and get the first one
    const activeInstance = describeResponse.containerInstances.find(
      (ci: ContainerInstance) => ci.status === ContainerInstanceStatus.ACTIVE
    );

    if (!activeInstance || !activeInstance.ec2InstanceId) {
      return undefined;
    }

    return activeInstance.ec2InstanceId;
  } catch (error) {
    console.error("Error finding container instance:", error);
    throw error;
  }
}

/**
 * Execute application setup script on the instance
 */
async function executeApplicationSetup(
  instanceId: string,
  config: {
    fileSystemId: string;
    efsStackName: string;
    region: string;
    envName: string;
  }
): Promise<void> {
  const setupScript = buildApplicationSetupScript(config);

  console.log("Sending SSM Run Command for application setup...");

  const command = new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: "AWS-RunShellScript",
    Parameters: {
      commands: [setupScript],
    },
    TimeoutSeconds: 600, // 10 minutes
    Comment: "Application setup: EFS mount, Prometheus, Grafana configuration",
  });

  const response = await ssmClient.send(command);
  const commandId = response.Command?.CommandId;

  if (!commandId) {
    throw new Error("Failed to send SSM command");
  }

  console.log(`Command sent. Command ID: ${commandId}`);
  console.log("Waiting for command to complete...");

  // Wait for command to complete
  await waitForCommand(commandId, instanceId);

  // Get command output
  const invocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId,
    })
  );

  if (invocation.Status === CommandStatus.SUCCESS) {
    console.log("✓ Application setup completed successfully");
    console.log("Command output:", invocation.StandardOutputContent);
  } else {
    console.error("✗ Application setup failed");
    console.error("Error:", invocation.StandardErrorContent);
    throw new Error(
      `Application setup failed: ${invocation.StandardErrorContent}`
    );
  }
}

/**
 * Build application setup script
 */
function buildApplicationSetupScript(config: {
  fileSystemId: string;
  efsStackName: string;
  region: string;
  envName: string;
}): string {
  return `#!/bin/bash
set -e

echo '========================================='
echo 'Application Setup Started'
echo 'Timestamp:' $(date)
echo '========================================='

# Enable logging
exec > >(tee /var/log/application-setup.log|logger -t app-setup -s 2>/dev/console) 2>&1

# ==========================================================================
# EFS SETUP
# ==========================================================================
echo 'Installing EFS utilities...'
yum update -y
yum install -y amazon-efs-utils awscli

# Configure EFS utils
cat > /etc/efs-utils.conf << 'EOF'
[mount]
region = ${config.region}
iam = true
tls = true
rsize = 1048576
wsize = 1048576
hard = true
intr = true
timeo = 600
retrans = 2
EOF

# Mount EFS with retry logic
mkdir -p /mnt/efs
MOUNT_RETRIES=5
EFS_MOUNTED=false
for i in $(seq 1 $MOUNT_RETRIES); do
  echo "EFS mount attempt $i of $MOUNT_RETRIES"
  if timeout 90 mount -t efs -o tls,iam ${config.fileSystemId}:/ /mnt/efs; then
    echo '✓ EFS mounted successfully'
    EFS_MOUNTED=true
    break
  else
    echo 'Mount failed, retrying in 10 seconds...'
    sleep 10
  fi
done

if [ "$EFS_MOUNTED" = "false" ]; then
  echo 'ERROR: Failed to mount EFS after $MOUNT_RETRIES attempts'
  exit 1
fi

# Add to fstab for persistence
echo "${config.fileSystemId}:/ /mnt/efs efs defaults,_netdev,tls,iam 0 0" >> /etc/fstab

# ==========================================================================
# EFS DIRECTORY STRUCTURE SETUP
# ==========================================================================
echo 'Setting up EFS directory structure...'

# Create directories
sudo mkdir -p /mnt/efs/prometheus-data
sudo mkdir -p /mnt/efs/grafana-data
sudo mkdir -p /mnt/efs/config/prometheus
sudo mkdir -p /mnt/efs/config/grafana/provisioning/datasources
sudo mkdir -p /mnt/efs/config/grafana/provisioning/dashboards
sudo mkdir -p /mnt/efs/config/grafana/dashboards

# Set base permissions
sudo chown -R root:root /mnt/efs/
sudo chmod -R 755 /mnt/efs/

# Prometheus permissions (UID 65534)
sudo chown -R 65534:65534 /mnt/efs/prometheus-data
sudo chown -R 65534:65534 /mnt/efs/config/prometheus
sudo chmod -R 755 /mnt/efs/prometheus-data
sudo chmod -R 755 /mnt/efs/config/prometheus

# Grafana permissions (UID 472, GID 0 - matches Grafana container user: "472:0")
# Note: Grafana container runs as user "472:0" (grafana user, root group)
sudo chown -R 472:0 /mnt/efs/grafana-data
sudo chown -R 472:0 /mnt/efs/config/grafana
sudo chmod -R 755 /mnt/efs/grafana-data
sudo chmod -R 755 /mnt/efs/config/grafana
# Ensure Grafana can write to its data directories
sudo chmod -R 777 /mnt/efs/grafana-data

# ==========================================================================
# CONFIGURATION FILES FROM SSM
# ==========================================================================
echo 'Downloading configuration files from SSM...'

# Download Prometheus config from SSM (use YAML version created by EFS initialization Lambda)
if aws ssm get-parameter --region ${config.region} --name "/monitoring/${config.envName}/prometheus-config-yaml" --query "Parameter.Value" --output text > /tmp/prometheus.yml 2>/dev/null; then
  echo '✓ Prometheus config downloaded from SSM (YAML format)'
  cp /tmp/prometheus.yml /mnt/efs/config/prometheus/prometheus.yml
  sudo chown 65534:65534 /mnt/efs/config/prometheus/prometheus.yml
else
  echo 'ℹ Creating minimal Prometheus config (SSM not available)'
  cat > /mnt/efs/config/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
scrape_configs:
  - job_name: 'prometheus'
    metrics_path: /prometheus/metrics
    static_configs:
      - targets: ['localhost:9090']
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
EOF
  sudo chown 65534:65534 /mnt/efs/config/prometheus/prometheus.yml
fi

# Grafana configs are managed by EFS initialization Lambda
echo 'ℹ Grafana configuration managed by EFS Lambda'

# ==========================================================================
# CREATE SYMLINKS
# ==========================================================================
echo 'Creating symlinks...'

# Remove any existing directories or symlinks to prevent circular references
# This ensures we replace directories with symlinks, not create symlinks inside directories
sudo rm -rf /mnt/prometheus-data /mnt/grafana-data /mnt/prometheus-config /mnt/grafana-provisioning /mnt/grafana-dashboards 2>/dev/null || true

# Create symlinks (using absolute paths to avoid issues)
sudo ln -sf /mnt/efs/prometheus-data /mnt/prometheus-data
sudo ln -sf /mnt/efs/grafana-data /mnt/grafana-data
sudo ln -sf /mnt/efs/config/prometheus /mnt/prometheus-config
sudo ln -sf /mnt/efs/config/grafana/provisioning /mnt/grafana-provisioning
sudo ln -sf /mnt/efs/config/grafana/dashboards /mnt/grafana-dashboards

# Verify symlinks are correct (not circular)
echo 'Verifying symlinks...'
for link in prometheus-data grafana-data prometheus-config grafana-provisioning grafana-dashboards; do
  if [ -L "/mnt/$link" ]; then
    target=$(readlink -f "/mnt/$link")
    echo "✓ /mnt/$link -> $target"
    # Check for circular reference: target should not contain the link name
    if echo "$target" | grep -q "/mnt/$link"; then
      echo "ERROR: Circular symlink detected: /mnt/$link -> $target"
      exit 1
    fi
  else
    echo "ERROR: /mnt/$link is not a symlink"
    exit 1
  fi
done

# Clean up any circular symlinks that might exist inside EFS directories
# This prevents issues if symlinks were incorrectly created inside directories
echo 'Cleaning up any circular symlinks in EFS directories...'
sudo find /mnt/efs/grafana-data -type l -name "grafana-data" -delete 2>/dev/null || true
sudo find /mnt/efs/prometheus-data -type l -name "prometheus-data" -delete 2>/dev/null || true

# ==========================================================================
# COMPLETION
# ==========================================================================
touch /var/lib/cloud/instance/application-setup-complete || true

echo '========================================='
echo '✓ Application setup completed successfully!'
echo 'Timestamp:' $(date)
echo 'Log file: /var/log/application-setup.log'
echo '========================================='
`;
}

/**
 * Wait for SSM command to complete
 */
async function waitForCommand(
  commandId: string,
  instanceId: string,
  maxAttempts = 60
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

    const invocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      })
    );

    if (invocation.Status === CommandStatus.SUCCESS) {
      return;
    }

    if (
      invocation.Status === CommandStatus.FAILED ||
      invocation.Status === CommandStatus.CANCELLED ||
      invocation.Status === CommandStatus.TIMED_OUT
    ) {
      throw new Error(
        `Command ${commandId} failed with status: ${invocation.Status}`
      );
    }

    // Still in progress, continue waiting
    console.log(
      `Command status: ${invocation.Status} (attempt ${i + 1}/${maxAttempts})`
    );
  }

  throw new Error(
    `Command ${commandId} timed out after ${maxAttempts} attempts`
  );
}
