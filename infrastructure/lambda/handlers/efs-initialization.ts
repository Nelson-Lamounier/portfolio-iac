/**
 * EFS Initialization Lambda Function
 *
 * This Lambda function initializes EFS with the required directory structure
 * and configuration files for monitoring services (Prometheus, Grafana).
 *
 * Features:
 * - Mounts EFS using access point
 * - Creates directory structure with proper permissions
 * - Generates configuration files from SSM parameters
 * - Sets correct ownership for Prometheus (65534) and Grafana (472)
 * - Validates setup completion
 *
 * @format
 */

import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
  Context,
} from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

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

  console.log(`Initializing EFS ${EfsId} with access point ${AccessPointId}`);

  // Mount EFS
  const mountPoint = "/mnt/efs";
  await mountEfs(EfsId, AccessPointId, mountPoint, region);

  // Create directory structure
  await createDirectoryStructure(mountPoint);

  // Create configuration files
  await createConfigurationFiles(mountPoint, StackName, region);

  // Set permissions
  await setPermissions(mountPoint);

  console.log("EFS initialization completed successfully");

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

async function mountEfs(
  efsId: string,
  accessPointId: string,
  mountPoint: string,
  region: string
): Promise<void> {
  try {
    // Create mount point
    execSync(`mkdir -p ${mountPoint}`, { stdio: "inherit" });

    // Mount EFS with access point
    const mountCmd = [
      "mount",
      "-t",
      "efs",
      "-o",
      `tls,iam,accesspoint=${accessPointId}`,
      `${efsId}.efs.${region}.amazonaws.com:/`,
      mountPoint,
    ].join(" ");

    execSync(mountCmd, { stdio: "inherit" });
    console.log(`EFS mounted successfully at ${mountPoint}`);
  } catch (error) {
    console.error("Error mounting EFS:", error);
    throw error;
  }
}

async function createDirectoryStructure(mountPoint: string): Promise<void> {
  const directories = [
    // Data directories
    `${mountPoint}/prometheus-data`,
    `${mountPoint}/grafana-data`,
    `${mountPoint}/grafana-data/plugins`,
    `${mountPoint}/grafana-data/logs`,
    `${mountPoint}/grafana-data/csv`,
    `${mountPoint}/grafana-data/png`,

    // Config directories
    `${mountPoint}/config/prometheus`,
    `${mountPoint}/config/grafana/provisioning/datasources`,
    `${mountPoint}/config/grafana/provisioning/dashboards`,
    `${mountPoint}/config/grafana/dashboards`,
    `${mountPoint}/config/alertmanager`,
  ];

  for (const directory of directories) {
    try {
      mkdirSync(directory, { recursive: true });
      console.log(`Created directory: ${directory}`);
    } catch (error) {
      console.error(`Failed to create directory ${directory}:`, error);
      throw error;
    }
  }
}

async function createConfigurationFiles(
  mountPoint: string,
  stackName: string,
  region: string
): Promise<void> {
  try {
    // Get Prometheus config from SSM
    const prometheusConfig = await getSSMParameter(
      `/monitoring/${stackName}/prometheus-config`,
      region
    );
    const prometheusYmlPath = join(
      mountPoint,
      "config/prometheus/prometheus.yml"
    );
    writeYamlFile(prometheusYmlPath, JSON.parse(prometheusConfig));
    console.log(`Created Prometheus config: ${prometheusYmlPath}`);

    // Get Grafana datasource config from SSM
    const grafanaDsConfig = await getSSMParameter(
      `/monitoring/${stackName}/grafana-datasource-config`,
      region
    );
    const grafanaDsPath = join(
      mountPoint,
      "config/grafana/provisioning/datasources/prometheus.yml"
    );
    writeYamlFile(grafanaDsPath, JSON.parse(grafanaDsConfig));
    console.log(`Created Grafana datasource config: ${grafanaDsPath}`);

    // Get Grafana dashboard config from SSM
    const grafanaDbConfig = await getSSMParameter(
      `/monitoring/${stackName}/grafana-dashboard-config`,
      region
    );
    const grafanaDbPath = join(
      mountPoint,
      "config/grafana/provisioning/dashboards/dashboards.yml"
    );
    writeYamlFile(grafanaDbPath, JSON.parse(grafanaDbConfig));
    console.log(`Created Grafana dashboard config: ${grafanaDbPath}`);
  } catch (error) {
    console.error("Error creating configuration files:", error);
    throw error;
  }
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

function writeYamlFile(filePath: string, configData: any): void {
  try {
    const yamlContent = dictToYaml(configData);
    writeFileSync(filePath, yamlContent);
  } catch (error) {
    console.error(`Failed to write YAML file ${filePath}:`, error);
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

async function setPermissions(mountPoint: string): Promise<void> {
  const permissionCommands = [
    // Prometheus permissions (UID 65534)
    `chown -R 65534:65534 ${mountPoint}/prometheus-data`,
    `chown -R 65534:65534 ${mountPoint}/config/prometheus`,
    `chmod -R 777 ${mountPoint}/prometheus-data`,
    `chmod -R 755 ${mountPoint}/config/prometheus`,

    // Grafana permissions (UID 472)
    `chown -R 472:0 ${mountPoint}/grafana-data`,
    `chown -R 472:0 ${mountPoint}/config/grafana`,
    `chmod -R 777 ${mountPoint}/grafana-data`,
    `chmod -R 755 ${mountPoint}/config/grafana`,
  ];

  for (const cmd of permissionCommands) {
    try {
      execSync(cmd, { stdio: "inherit" });
      console.log(`Executed: ${cmd}`);
    } catch (error) {
      console.error(`Failed to execute ${cmd}:`, error);
      throw error;
    }
  }

  console.log("Permissions set successfully");
}
