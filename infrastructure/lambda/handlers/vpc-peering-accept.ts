/** @format */

import {
  EC2Client,
  AcceptVpcPeeringConnectionCommand,
} from "@aws-sdk/client-ec2";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

interface CloudFormationCustomResourceEvent {
  RequestType: "Create" | "Update" | "Delete";
  ResourceProperties: {
    VpcPeeringConnectionId: string;
    PeerRoleArn: string;
    Region: string;
  };
  PhysicalResourceId?: string;
}

interface CloudFormationCustomResourceResponse {
  PhysicalResourceId: string;
  Data?: {
    PeeringConnectionId?: string;
    Status?: string;
  };
}

/**
 * Lambda handler to accept VPC peering connections in peer account
 *
 * This function:
 * 1. Assumes a role in the peer account
 * 2. Accepts the VPC peering connection
 * 3. Returns the peering connection ID
 */
export const handler = async (
  event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceResponse> => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const { RequestType, ResourceProperties } = event;
  const { VpcPeeringConnectionId, PeerRoleArn, Region } = ResourceProperties;

  if (RequestType === "Create" || RequestType === "Update") {
    try {
      // Assume role in peer account
      const stsClient = new STSClient({ region: Region });
      const assumeRoleResponse = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: PeerRoleArn,
          RoleSessionName: "VpcPeeringAccept",
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

      // Accept peering connection
      const acceptResponse = await ec2Client.send(
        new AcceptVpcPeeringConnectionCommand({
          VpcPeeringConnectionId,
        })
      );

      console.log(
        `Accepted peering connection: ${VpcPeeringConnectionId}`,
        acceptResponse
      );

      return {
        PhysicalResourceId: VpcPeeringConnectionId,
        Data: {
          PeeringConnectionId: VpcPeeringConnectionId,
          Status:
            acceptResponse.VpcPeeringConnection?.Status?.Code || "accepted",
        },
      };
    } catch (error) {
      console.error("Error accepting peering:", error);

      // If already accepted, that's okay
      if (
        error instanceof Error &&
        error.message.includes("InvalidVpcPeeringConnectionID.NotFound")
      ) {
        return {
          PhysicalResourceId: VpcPeeringConnectionId,
        };
      }

      throw error;
    }
  } else if (RequestType === "Delete") {
    // No action needed on delete - peering connection will be deleted by CloudFormation
    return {
      PhysicalResourceId: event.PhysicalResourceId || VpcPeeringConnectionId,
    };
  }

  return {
    PhysicalResourceId: VpcPeeringConnectionId,
  };
};
