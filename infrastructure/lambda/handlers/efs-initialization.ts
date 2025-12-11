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

    if (requestType === "Create" || requestType === "Update") {
      return await initializeEfs(event, context);
    } else if (requestType === "Delete") {
      return await cleanupEfs(event, context);
    } else {
      throw new Error(`Unknown request type: ${requestType}`);
    }
  } catch (error) {
    console.error("Error in handler:", error);
    return {
      Status: "FAILED",
      Reason: error instanceof Error ? error.message : String(error),
      PhysicalResourceId:
        (event as any).PhysicalResourceId || "efs-init-failed",
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: {},
    };
  }
};

async function initializeEfs(
  event: CloudFormationCustomResourceEvent,
  context: Context
): Promise<CloudFormationCustomResourceResponse> {
  const { EfsId, AccessPointId, StackName } = event.ResourceProperties;
  const region = process.env.AWS_REGION!;

  console.log(
    `Initializing EFS configuration for ${EfsId} with access point ${AccessPointId}`
  );

  // Create enhanced configuration files in SSM
  await createEnhancedConfigurationFiles(StackName, region);

  // Store directory structure and permissions in SSM for EC2 instances to use
  await storeDirectoryStructureInSSM(StackName, region);

  console.log("EFS configuration initialization completed successfully");

  return {
    Status: "SUCCESS",
    PhysicalResourceId: `efs-init-${EfsId}`,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: {
      EfsId,
      AccessPointId,
      InitializationStatus: "Complete",
    },
  };
}

async function cleanupEfs(
  event: CloudFormationCustomResourceEvent,
  context: Context
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
  stackName: string,
  region: string
): Promise<void> {
  try {
    // Get existing configurations and enhance them
    const prometheusConfig = await getSSMParameter(
      `/monitoring/${stackName}/prometheus-config`,
      region
    );
    const grafanaDsConfig = await getSSMParameter(
      `/monitoring/${stackName}/grafana-datasource-config`,
      region
    );
    const grafanaDbConfig = await getSSMParameter(
      `/monitoring/${stackName}/grafana-dashboard-config`,
      region
    );

    // Store enhanced YAML configurations for EC2 instances to use
    await putSSMParameter(
      `/monitoring/${stackName}/prometheus-config-yaml`,
      dictToYaml(JSON.parse(prometheusConfig)),
      region
    );

    await putSSMParameter(
      `/monitoring/${stackName}/grafana-datasource-config-yaml`,
      dictToYaml(JSON.parse(grafanaDsConfig)),
      region
    );

    await putSSMParameter(
      `/monitoring/${stackName}/grafana-dashboard-config-yaml`,
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
  stackName: string,
  region: string
): Promise<void> {
  const setupScript = `#!/bin/bash
set -e

echo "Setting up EFS directory structure and permissions..."

# Create directory structure
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

# Set permissions
chown -R 65534:65534 /mnt/efs/prometheus-data /mnt/efs/config/prometheus
chown -R 472:0 /mnt/efs/grafana-data /mnt/efs/config/grafana
chmod -R 777 /mnt/efs/prometheus-data /mnt/efs/grafana-data
chmod -R 755 /mnt/efs/config/prometheus /mnt/efs/config/grafana

# Create configuration files from SSM
aws ssm get-parameter --name "/monitoring/${stackName}/prometheus-config-yaml" --query "Parameter.Value" --output text > /mnt/efs/config/prometheus/prometheus.yml
aws ssm get-parameter --name "/monitoring/${stackName}/grafana-datasource-config-yaml" --query "Parameter.Value" --output text > /mnt/efs/config/grafana/provisioning/datasources/prometheus.yml
aws ssm get-parameter --name "/monitoring/${stackName}/grafana-dashboard-config-yaml" --query "Parameter.Value" --output text > /mnt/efs/config/grafana/provisioning/dashboards/dashboards.yml

echo "EFS setup completed successfully"
`;

  await putSSMParameter(
    `/monitoring/${stackName}/efs-setup-script`,
    setupScript,
    region
  );

  console.log("EFS setup script stored in SSM");
}

async function getSSMParameter(
  parameterName: string,
  region: string
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
  region: string
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
