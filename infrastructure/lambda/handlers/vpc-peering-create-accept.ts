/** @format */

import {
  EC2Client,
  CreateVpcPeeringConnectionCommand,
  AcceptVpcPeeringConnectionCommand,
  DeleteVpcPeeringConnectionCommand,
  DescribeVpcPeeringConnectionsCommand,
  CreateTagsCommand,
} from "@aws-sdk/client-ec2";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

interface CloudFormationCustomResourceEvent {
  RequestType: "Create" | "Update" | "Delete";
  ResourceProperties: {
    VpcId: string;
    PeerVpcId: string;
    PeerOwnerId: string;
    PeerRegion: string;
    PeerRoleArn: string;
    PeeringName: string;
    EnvName: string;
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
 * Lambda handler to create and accept VPC peering connections cross-account
 *
 * This function:
 * 1. Creates the VPC peering connection request
 * 2. Assumes a role in the peer account
 * 3. Accepts the VPC peering connection
 * 4. Returns the peering connection ID
 */
export const handler = async (
  event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceResponse> => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const { RequestType, ResourceProperties, PhysicalResourceId } = event;
  const {
    VpcId,
    PeerVpcId,
    PeerOwnerId,
    PeerRegion,
    PeerRoleArn,
    PeeringName,
    EnvName,
  } = ResourceProperties;

  const ec2Client = new EC2Client({ region: PeerRegion });

  if (RequestType === "Create") {
    try {
      // Step 1: Create VPC peering connection request
      console.log(
        `Creating VPC peering connection from ${VpcId} to ${PeerVpcId} in account ${PeerOwnerId}`
      );

      const createResponse = await ec2Client.send(
        new CreateVpcPeeringConnectionCommand({
          VpcId: VpcId,
          PeerVpcId: PeerVpcId,
          PeerOwnerId: PeerOwnerId,
          PeerRegion: PeerRegion,
        })
      );

      const peeringConnectionId =
        createResponse.VpcPeeringConnection?.VpcPeeringConnectionId;

      if (!peeringConnectionId) {
        throw new Error(
          "Failed to create VPC peering connection - no ID returned"
        );
      }

      console.log(`Created peering connection: ${peeringConnectionId}`);

      // Add tags to the peering connection
      await ec2Client.send(
        new CreateTagsCommand({
          Resources: [peeringConnectionId],
          Tags: [
            { Key: "Name", Value: PeeringName },
            { Key: "Environment", Value: EnvName },
            { Key: "ManagedBy", Value: "CDK" },
          ],
        })
      );

      // Step 2: Assume role in peer account
      console.log(`Assuming role: ${PeerRoleArn}`);

      const stsClient = new STSClient({ region: PeerRegion });
      const assumeRoleResponse = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: PeerRoleArn,
          RoleSessionName: "VpcPeeringAccept",
        })
      );

      if (!assumeRoleResponse.Credentials) {
        throw new Error("Failed to assume role - no credentials returned");
      }

      console.log("Successfully assumed role");

      // Step 3: Accept peering connection using assumed credentials
      const peerEc2Client = new EC2Client({
        region: PeerRegion,
        credentials: {
          accessKeyId: assumeRoleResponse.Credentials.AccessKeyId!,
          secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey!,
          sessionToken: assumeRoleResponse.Credentials.SessionToken!,
        },
      });

      console.log(`Accepting peering connection: ${peeringConnectionId}`);

      const acceptResponse = await peerEc2Client.send(
        new AcceptVpcPeeringConnectionCommand({
          VpcPeeringConnectionId: peeringConnectionId,
        })
      );

      console.log(
        `Accepted peering connection. Status: ${acceptResponse.VpcPeeringConnection?.Status?.Code}`
      );

      return {
        PhysicalResourceId: peeringConnectionId,
        Data: {
          PeeringConnectionId: peeringConnectionId,
          Status:
            acceptResponse.VpcPeeringConnection?.Status?.Code || "accepted",
        },
      };
    } catch (error) {
      console.error("Error creating/accepting peering:", error);
      throw error;
    }
  } else if (RequestType === "Update") {
    // For updates, we can't modify a peering connection, just return existing
    console.log(`Update requested for peering: ${PhysicalResourceId}`);
    return {
      PhysicalResourceId: PhysicalResourceId || "unknown",
      Data: {
        PeeringConnectionId: PhysicalResourceId,
      },
    };
  } else if (RequestType === "Delete") {
    if (PhysicalResourceId && PhysicalResourceId !== "unknown") {
      try {
        console.log(`Deleting peering connection: ${PhysicalResourceId}`);

        // Check if peering exists
        const describeResponse = await ec2Client.send(
          new DescribeVpcPeeringConnectionsCommand({
            VpcPeeringConnectionIds: [PhysicalResourceId],
          })
        );

        const peering = describeResponse.VpcPeeringConnections?.[0];
        if (
          peering &&
          peering.Status?.Code !== "deleted" &&
          peering.Status?.Code !== "deleting"
        ) {
          await ec2Client.send(
            new DeleteVpcPeeringConnectionCommand({
              VpcPeeringConnectionId: PhysicalResourceId,
            })
          );
          console.log(`Deleted peering connection: ${PhysicalResourceId}`);
        } else {
          console.log(
            `Peering connection already deleted or deleting: ${PhysicalResourceId}`
          );
        }
      } catch (error) {
        // Ignore errors on delete - peering might already be gone
        console.log(`Error deleting peering (ignoring): ${error}`);
      }
    }

    return {
      PhysicalResourceId: PhysicalResourceId || "deleted",
    };
  }

  return {
    PhysicalResourceId: PhysicalResourceId || "unknown",
  };
};
