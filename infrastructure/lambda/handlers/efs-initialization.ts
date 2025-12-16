/**
 * EFS Initialization Lambda Function
 *
 * This Lambda function initializes EFS configuration by storing setup commands
 * and enhanced configuration files in SSM parameters for EC2 instances to use.
 *
 * Features:
 * - Creates enhanced YAML configuration files in SSM
 * - Stores directory structure and permission commands
 * - Provides setup scripts for EC2 instances
 * - No VPC dependencies (runs outside VPC)
 *
 * @format
 */

import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
  Context,
} from "aws-lambda";
import * as https from "https";
import * as url from "url";
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

export const handler = async (
  event: CloudFormationCustomResourceEvent,
  context: Context
): Promise<CloudFormationCustomResourceResponse> => {
  console.log(
    "EFS Initialization Lambda started",
    JSON.stringify(event, null, 2)
  );

  try {
    const requestType = event.RequestType;
    console.log(`Request type: ${requestType}`);

    let response: CloudFormationCustomResourceResponse;

    if (requestType === "Create" || requestType === "Update") {
      response = await initializeEfs(event, context);
    } else if (requestType === "Delete") {
      response = await cleanupEfs(event, context);
    } else {
      throw new Error(`Unknown request type: ${requestType}`);
    }

    await sendResponse(event, context, response);
    return response;
  } catch (error) {
    console.error("Error in handler:", error);
    const failureResponse: CloudFormationCustomResourceResponse = {
      Status: "FAILED",
      Reason: error instanceof Error ? error.message : String(error),
      PhysicalResourceId:
        (event as any).PhysicalResourceId || "efs-init-failed",
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: {},
    };
    await sendResponse(event, context, failureResponse);
    return failureResponse;
  }
};

async function initializeEfs(
  event: CloudFormationCustomResourceEvent,
  _context: Context
): Promise<CloudFormationCustomResourceResponse> {
  // Align with properties sent by the stack (FileSystemId, AccessPointId, Environment)
  const {
    FileSystemId,
    AccessPointId,
    Environment: envName,
  } = event.ResourceProperties as any;
  const region = process.env.AWS_REGION!;

  console.log(
    `Initializing EFS configuration for ${FileSystemId} with access point ${AccessPointId} in env ${envName}`
  );

  // Create enhanced configuration files in SSM
  await createEnhancedConfigurationFiles(envName, region);

  // Store directory structure and permissions in SSM for EC2 instances to use
  await storeDirectoryStructureInSSM(envName, region);

  console.log("EFS configuration initialization completed successfully");

  return {
    Status: "SUCCESS",
    PhysicalResourceId: `efs-init-${FileSystemId}`,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: {
      FileSystemId,
      AccessPointId,
      InitializationStatus: "Complete",
    },
  };
}

async function cleanupEfs(
  event: CloudFormationCustomResourceEvent,
  _context: Context
): Promise<CloudFormationCustomResourceResponse> {
  console.log("EFS cleanup - no action needed (data preserved)");

  return {
    Status: "SUCCESS",
    PhysicalResourceId: (event as any).PhysicalResourceId || "efs-init-cleanup",
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: {},
  };
}

async function createEnhancedConfigurationFiles(
  envName: string,
  region: string
): Promise<void> {
  try {
    // Get existing configurations and enhance them
    const prometheusConfig = await getSSMParameter(
      `/monitoring/${envName}/prometheus-config`,
      region
    );
    const grafanaDsConfig = await getSSMParameter(
      `/monitoring/${envName}/grafana-datasource-config`,
      region
    );
    const grafanaDbConfig = await getSSMParameter(
      `/monitoring/${envName}/grafana-dashboard-config`,
      region
    );

    // Store enhanced YAML configurations for EC2 instances to use
    await putSSMParameter(
      `/monitoring/${envName}/prometheus-config-yaml`,
      dictToYaml(JSON.parse(prometheusConfig)),
      region
    );

    await putSSMParameter(
      `/monitoring/${envName}/grafana-datasource-config-yaml`,
      dictToYaml(JSON.parse(grafanaDsConfig)),
      region
    );

    await putSSMParameter(
      `/monitoring/${envName}/grafana-dashboard-config-yaml`,
      dictToYaml(JSON.parse(grafanaDbConfig)),
      region
    );

    console.log("Enhanced configuration files stored in SSM");
  } catch (error) {
    console.error("Error creating enhanced configuration files:", error);
    throw error;
  }
}

async function storeDirectoryStructureInSSM(
  envName: string,
  region: string
): Promise<void> {
  const setupScript = `#!/bin/bash
set -e

echo "Setting up EFS directory structure and permissions..."

# Create directory structure with proper ownership from the start
mkdir -p /mnt/efs/prometheus-data
mkdir -p /mnt/efs/grafana-data/plugins
mkdir -p /mnt/efs/grafana-data/logs
mkdir -p /mnt/efs/grafana-data/csv
mkdir -p /mnt/efs/grafana-data/png
mkdir -p /mnt/efs/config/prometheus
mkdir -p /mnt/efs/config/grafana/provisioning/datasources
mkdir -p /mnt/efs/config/grafana/provisioning/dashboards
mkdir -p /mnt/efs/config/grafana/dashboards
mkdir -p /mnt/efs/config/alertmanager

# Set ownership and permissions for Prometheus (UID 65534)
chown -R 65534:65534 /mnt/efs/prometheus-data /mnt/efs/config/prometheus
chmod -R 755 /mnt/efs/prometheus-data /mnt/efs/config/prometheus

# Set ownership and permissions for Grafana (UID 472, GID 0)
chown -R 472:0 /mnt/efs/grafana-data /mnt/efs/config/grafana
chmod -R 755 /mnt/efs/grafana-data /mnt/efs/config/grafana

# Ensure Grafana can write to its data directories
chmod -R 777 /mnt/efs/grafana-data/plugins
chmod -R 777 /mnt/efs/grafana-data/logs
chmod -R 777 /mnt/efs/grafana-data/csv
chmod -R 777 /mnt/efs/grafana-data/png

# Create configuration files from SSM
echo "Creating configuration files from SSM parameters..."
aws ssm get-parameter --region ${region} --name "/monitoring/${envName}/prometheus-config-yaml" --query "Parameter.Value" --output text > /mnt/efs/config/prometheus/prometheus.yml
aws ssm get-parameter --region ${region} --name "/monitoring/${envName}/grafana-datasource-config-yaml" --query "Parameter.Value" --output text > /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
aws ssm get-parameter --region ${region} --name "/monitoring/${envName}/grafana-dashboard-config-yaml" --query "Parameter.Value" --output text > /mnt/efs/config/grafana/provisioning/dashboards/dashboards.yml

# Set proper ownership for config files
chown 65534:65534 /mnt/efs/config/prometheus/prometheus.yml
chown 472:0 /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
chown 472:0 /mnt/efs/config/grafana/provisioning/dashboards/dashboards.yml

# Verify directory structure and permissions
echo "Verifying directory structure:"
ls -la /mnt/efs/
ls -la /mnt/efs/grafana-data/
ls -la /mnt/efs/config/grafana/

echo "EFS setup completed successfully"
`;

  await putSSMParameter(
    `/monitoring/${envName}/efs-setup-script`,
    setupScript,
    region
  );

  console.log("EFS setup script stored in SSM");
}

async function getSSMParameter(
  parameterName: string,
  _region: string
): Promise<string> {
  try {
    const command = new GetParameterCommand({ Name: parameterName });
    const response = await ssmClient.send(command);
    return response.Parameter?.Value || "";
  } catch (error) {
    console.error(`Failed to get SSM parameter ${parameterName}:`, error);
    throw error;
  }
}

async function putSSMParameter(
  parameterName: string,
  value: string,
  _region: string
): Promise<void> {
  try {
    const command = new PutParameterCommand({
      Name: parameterName,
      Value: value,
      Type: "String",
      Overwrite: true,
      Description: "EFS configuration generated by Lambda",
    });
    await ssmClient.send(command);
    console.log(`Stored SSM parameter: ${parameterName}`);
  } catch (error) {
    console.error(`Failed to put SSM parameter ${parameterName}:`, error);
    throw error;
  }
}

function dictToYaml(data: any, indent: number = 0): string {
  const yamlLines: string[] = [];
  const indentStr = "  ".repeat(indent);

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        yamlLines.push(`${indentStr}${key}:`);
        yamlLines.push(dictToYaml(value, indent + 1));
      } else if (Array.isArray(value)) {
        yamlLines.push(`${indentStr}${key}:`);
        for (const item of value) {
          if (typeof item === "object" && item !== null) {
            yamlLines.push(`${indentStr}- `);
            const itemYaml = dictToYaml(item, indent + 1);
            yamlLines.push(
              itemYaml.replace(
                new RegExp(`^${indentStr}  `, "gm"),
                `${indentStr}  `
              )
            );
          } else {
            yamlLines.push(`${indentStr}- ${item}`);
          }
        }
      } else {
        yamlLines.push(`${indentStr}${key}: ${value}`);
      }
    }
  }

  return yamlLines.join("\n");
}

async function sendResponse(
  event: CloudFormationCustomResourceEvent,
  context: Context,
  response: CloudFormationCustomResourceResponse
): Promise<void> {
  const responseBody = JSON.stringify({
    Status: response.Status,
    Reason:
      response.Reason ||
      `See CloudWatch Logs for requestId: ${context.awsRequestId}`,
    PhysicalResourceId: response.PhysicalResourceId || context.logStreamName,
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
      console.error("sendResponse error:", err);
      reject(err);
    });

    req.write(responseBody);
    req.end();
  });
}
