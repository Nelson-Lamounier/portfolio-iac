/** @format */

import {
  EC2Client,
  DescribeRouteTablesCommand,
  CreateRouteCommand,
  DeleteRouteCommand,
} from "@aws-sdk/client-ec2";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

interface CloudFormationCustomResourceEvent {
  RequestType: "Create" | "Update" | "Delete";
  ResourceProperties: {
    VpcPeeringConnectionId: string;
    PeerVpcId: string;
    RequesterVpcCidr: string;
    PeerRoleArn: string;
    Region: string;
  };
  PhysicalResourceId?: string;
}

interface CloudFormationCustomResourceResponse {
  PhysicalResourceId: string;
  Data?: {
    RouteTablesUpdated?: number;
  };
}

/**
 * Lambda handler to update route tables in peer VPC
 *
 * This function:
 * 1. Assumes a role in the peer account
 * 2. Finds all route tables in the peer VPC
 * 3. Adds routes to the requester VPC CIDR
 * 4. On delete, removes the routes
 */
export const handler = async (
  event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceResponse> => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const { RequestType, ResourceProperties } = event;
  const {
    VpcPeeringConnectionId,
    PeerVpcId,
    RequesterVpcCidr,
    PeerRoleArn,
    Region,
  } = ResourceProperties;

  const physicalResourceId = `${VpcPeeringConnectionId}-routes`;

  if (RequestType === "Create" || RequestType === "Update") {
    try {
      // Assume role in peer account
      const stsClient = new STSClient({ region: Region });
      const assumeRoleResponse = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: PeerRoleArn,
          RoleSessionName: "VpcPeeringRoutes",
        })
      );

      if (!assumeRoleResponse.Credentials) {
        throw new Error("Failed to assume role - no credentials returned");
      }

      // Create EC2 client with assumed credentials
      const ec2Client = new EC2Client({
        region: Region,
        credentials: {
          accessKeyId: assumeRoleResponse.Credentials.AccessKeyId!,
          secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey!,
          sessionToken: assumeRoleResponse.Credentials.SessionToken!,
        },
      });

      // Get all route tables for peer VPC
      const routeTablesResponse = await ec2Client.send(
        new DescribeRouteTablesCommand({
          Filters: [{ Name: "vpc-id", Values: [PeerVpcId] }],
        })
      );

      const routeTables = routeTablesResponse.RouteTables || [];
      console.log(`Found ${routeTables.length} route tables in peer VPC`);

      // Add route to each route table
      let updatedCount = 0;
      for (const routeTable of routeTables) {
        const routeTableId = routeTable.RouteTableId!;
        try {
          await ec2Client.send(
            new CreateRouteCommand({
              RouteTableId: routeTableId,
              DestinationCidrBlock: RequesterVpcCidr,
              VpcPeeringConnectionId,
            })
          );
          console.log(`Added route to ${routeTableId}`);
          updatedCount++;
        } catch (error) {
          // Route may already exist
          if (
            error instanceof Error &&
            error.message.includes("RouteAlreadyExists")
          ) {
            console.log(`Route already exists in ${routeTableId}`);
            updatedCount++;
          } else {
            console.error(`Error adding route to ${routeTableId}:`, error);
          }
        }
      }

      return {
        PhysicalResourceId: physicalResourceId,
        Data: {
          RouteTablesUpdated: updatedCount,
        },
      };
    } catch (error) {
      console.error("Error updating routes:", error);
      throw error;
    }
  } else if (RequestType === "Delete") {
    // Remove routes on delete
    try {
      const stsClient = new STSClient({ region: Region });
      const assumeRoleResponse = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: PeerRoleArn,
          RoleSessionName: "VpcPeeringRoutes",
        })
      );

      if (!assumeRoleResponse.Credentials) {
        throw new Error("Failed to assume role - no credentials returned");
      }

      const ec2Client = new EC2Client({
        region: Region,
        credentials: {
          accessKeyId: assumeRoleResponse.Credentials.AccessKeyId!,
          secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey!,
          sessionToken: assumeRoleResponse.Credentials.SessionToken!,
        },
      });

      const routeTablesResponse = await ec2Client.send(
        new DescribeRouteTablesCommand({
          Filters: [{ Name: "vpc-id", Values: [PeerVpcId] }],
        })
      );

      const routeTables = routeTablesResponse.RouteTables || [];

      for (const routeTable of routeTables) {
        const routeTableId = routeTable.RouteTableId!;
        try {
          await ec2Client.send(
            new DeleteRouteCommand({
              RouteTableId: routeTableId,
              DestinationCidrBlock: RequesterVpcCidr,
            })
          );
          console.log(`Deleted route from ${routeTableId}`);
        } catch (error) {
          console.error(`Error deleting route from ${routeTableId}:`, error);
        }
      }
    } catch (error) {
      console.error("Error during cleanup:", error);
      // Don't fail on cleanup errors
    }

    return {
      PhysicalResourceId: event.PhysicalResourceId || physicalResourceId,
    };
  }

  return {
    PhysicalResourceId: physicalResourceId,
  };
};
