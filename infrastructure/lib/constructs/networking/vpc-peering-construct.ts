/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { LambdaFunctionConstruct } from "../compute/lambda";

export interface VpcPeeringConstructProps {
  /**
   * The VPC in the current account (requester)
   */
  vpc: ec2.IVpc;

  /**
   * The VPC ID in the peer account (accepter)
   */
  peerVpcId: string;

  /**
   * The AWS account ID of the peer VPC
   */
  peerAccountId: string;

  /**
   * The region of the peer VPC
   * @default - same region as requester VPC
   */
  peerRegion?: string;

  /**
   * The CIDR block of the peer VPC (for route table updates)
   */
  peerVpcCidr: string;

  /**
   * Environment name for tagging
   */
  envName: string;

  /**
   * Name for the peering connection
   */
  peeringName: string;

  /**
   * IAM role ARN in peer account that allows accepting peering connections
   * This role must exist in the peer account with trust relationship to this account
   */
  peerRoleArn: string;
}

/**
 * VPC Peering Construct with Cross-Account Support
 *
 * Creates a VPC peering connection between two VPCs, potentially in different accounts.
 * Handles:
 * - Creating the peering connection
 * - Accepting the peering connection (cross-account via custom resource)
 * - Updating route tables in both VPCs
 *
 * For cross-account peering, the peer account must have an IAM role that allows
 * this account to accept peering connections.
 *
 * Usage:
 * ```typescript
 * new VpcPeeringConstruct(this, 'PeeringToDev', {
 *   vpc: pipelineVpc,
 *   peerVpcId: 'vpc-xxxxx',
 *   peerAccountId: '123456789012',
 *   peerVpcCidr: '10.1.0.0/16',
 *   envName: 'development',
 *   peeringName: 'pipeline-to-dev',
 *   peerRoleArn: 'arn:aws:iam::123456789012:role/VpcPeeringAcceptRole',
 * });
 * ```
 */
export class VpcPeeringConstruct extends Construct {
  public readonly peeringConnection: ec2.CfnVPCPeeringConnection;
  public readonly peeringConnectionId: string;
  public readonly ssmParameter: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: VpcPeeringConstructProps) {
    super(scope, id);

    const region = props.peerRegion || cdk.Stack.of(this).region;

    // ========================================================================
    // 1. CREATE VPC PEERING CONNECTION
    // ========================================================================
    this.peeringConnection = new ec2.CfnVPCPeeringConnection(
      this,
      "PeeringConnection",
      {
        vpcId: props.vpc.vpcId,
        peerVpcId: props.peerVpcId,
        peerOwnerId: props.peerAccountId,
        peerRegion: region,
        tags: [
          {
            key: "Name",
            value: props.peeringName,
          },
          {
            key: "Environment",
            value: props.envName,
          },
          {
            key: "ManagedBy",
            value: "CDK",
          },
        ],
      }
    );

    this.peeringConnectionId = this.peeringConnection.ref;

    // ========================================================================
    // 2. STORE PEERING CONNECTION ID IN SSM PARAMETER STORE
    // ========================================================================
    this.ssmParameter = new ssm.StringParameter(this, "PeeringIdParameter", {
      parameterName: `/vpc-peering/${props.envName}/connection-id`,
      stringValue: this.peeringConnectionId,
      description: `VPC Peering connection ID for ${props.peeringName}`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // ========================================================================
    // 3. ACCEPT PEERING CONNECTION (CROSS-ACCOUNT)
    // ========================================================================
    // Use custom resource to accept peering in peer account
    const acceptPeeringProvider = this.createAcceptPeeringProvider(
      props.peerRoleArn,
      region
    );

    const acceptPeering = new cdk.CustomResource(this, "AcceptPeering", {
      serviceToken: acceptPeeringProvider.serviceToken,
      properties: {
        VpcPeeringConnectionId: this.peeringConnectionId,
        PeerRoleArn: props.peerRoleArn,
        Region: region,
      },
    });

    acceptPeering.node.addDependency(this.peeringConnection);

    // ========================================================================
    // 3. UPDATE ROUTE TABLES IN REQUESTER VPC
    // ========================================================================
    // Add routes to peer VPC CIDR in all route tables
    const routeTables = props.vpc.privateSubnets
      .concat(props.vpc.publicSubnets)
      .map((subnet) => subnet.routeTable);

    // Deduplicate route tables
    const uniqueRouteTables = Array.from(
      new Set(routeTables.map((rt) => rt.routeTableId))
    ).map((id) => routeTables.find((rt) => rt.routeTableId === id)!);

    uniqueRouteTables.forEach((routeTable, index) => {
      const route = new ec2.CfnRoute(this, `Route${index}`, {
        routeTableId: routeTable.routeTableId,
        destinationCidrBlock: props.peerVpcCidr,
        vpcPeeringConnectionId: this.peeringConnectionId,
      });

      route.addDependency(this.peeringConnection);
      route.node.addDependency(acceptPeering);
    });

    // ========================================================================
    // 4. UPDATE ROUTE TABLES IN PEER VPC (CROSS-ACCOUNT)
    // ========================================================================
    // Use custom resource to add routes in peer account
    const updateRoutesProvider = this.createUpdateRoutesProvider(
      props.peerRoleArn,
      region
    );

    const updateRoutes = new cdk.CustomResource(this, "UpdatePeerRoutes", {
      serviceToken: updateRoutesProvider.serviceToken,
      properties: {
        VpcPeeringConnectionId: this.peeringConnectionId,
        PeerVpcId: props.peerVpcId,
        RequesterVpcCidr: props.vpc.vpcCidrBlock,
        PeerRoleArn: props.peerRoleArn,
        Region: region,
      },
    });

    updateRoutes.node.addDependency(acceptPeering);

    // ========================================================================
    // OUTPUTS
    // ========================================================================
    new cdk.CfnOutput(this, "PeeringConnectionId", {
      value: this.peeringConnectionId,
      description: `VPC Peering connection to ${props.envName}`,
      exportName: `vpc-peering-${props.envName}`,
    });

    new cdk.CfnOutput(this, "PeerVpcCidr", {
      value: props.peerVpcCidr,
      description: `Peer VPC CIDR for ${props.envName}`,
    });
  }

  /**
   * Create custom resource provider for accepting peering connection
   */
  private createAcceptPeeringProvider(
    peerRoleArn: string,
    region: string
  ): cr.Provider {
    // Create Lambda function using TypeScript construct
    const lambdaFunction = new LambdaFunctionConstruct(
      this,
      "AcceptPeeringLambda",
      {
        envName: "vpc-peering",
        functionName: "accept-peering",
        entry: "lambda/handlers/vpc-peering-accept.ts",
        timeout: cdk.Duration.minutes(5),
        initialPolicy: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [peerRoleArn],
          }),
        ],
      }
    );

    return new cr.Provider(this, "AcceptPeeringProvider", {
      onEventHandler: lambdaFunction.function,
    });
  }

  /**
   * Create custom resource provider for updating route tables in peer VPC
   */
  private createUpdateRoutesProvider(
    peerRoleArn: string,
    region: string
  ): cr.Provider {
    // Create Lambda function using TypeScript construct
    const lambdaFunction = new LambdaFunctionConstruct(
      this,
      "UpdateRoutesLambda",
      {
        envName: "vpc-peering",
        functionName: "update-routes",
        entry: "lambda/handlers/vpc-peering-routes.ts",
        timeout: cdk.Duration.minutes(5),
        initialPolicy: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [peerRoleArn],
          }),
        ],
      }
    );

    return new cr.Provider(this, "UpdateRoutesProvider", {
      onEventHandler: lambdaFunction.function,
    });
  }
}
