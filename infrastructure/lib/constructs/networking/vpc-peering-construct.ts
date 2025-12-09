/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
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
 * Creates a VPC peering connection between two VPCs in different accounts.
 * Uses a custom Lambda to handle the cross-account acceptance.
 *
 * Handles:
 * - Creating the peering connection request
 * - Accepting the peering connection (cross-account via Lambda)
 * - Updating route tables in both VPCs
 *
 * For cross-account peering, the peer account must have an IAM role that allows
 * this account to accept peering connections.
 */
export class VpcPeeringConstruct extends Construct {
  public readonly peeringConnectionId: string;
  public readonly ssmParameter: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: VpcPeeringConstructProps) {
    super(scope, id);

    const region = props.peerRegion || cdk.Stack.of(this).region;

    // ========================================================================
    // 1. CREATE AND ACCEPT VPC PEERING (via Custom Resource)
    // ========================================================================
    // Use a single custom resource that creates AND accepts the peering
    // This avoids CloudFormation trying to verify the peering state
    const peeringProvider = this.createPeeringProvider(
      props.peerRoleArn,
      region
    );

    const peeringResource = new cdk.CustomResource(this, "PeeringConnection", {
      serviceToken: peeringProvider.serviceToken,
      properties: {
        VpcId: props.vpc.vpcId,
        PeerVpcId: props.peerVpcId,
        PeerOwnerId: props.peerAccountId,
        PeerRegion: region,
        PeerRoleArn: props.peerRoleArn,
        PeeringName: props.peeringName,
        EnvName: props.envName,
      },
    });

    this.peeringConnectionId = peeringResource.getAttString(
      "PeeringConnectionId"
    );

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
    // 3. UPDATE ROUTE TABLES IN REQUESTER VPC
    // ========================================================================
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

      route.node.addDependency(peeringResource);
    });

    // ========================================================================
    // 4. UPDATE ROUTE TABLES IN PEER VPC (CROSS-ACCOUNT)
    // ========================================================================
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

    updateRoutes.node.addDependency(peeringResource);

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
   * Create custom resource provider for creating and accepting peering connection
   */
  private createPeeringProvider(
    peerRoleArn: string,
    region: string
  ): cr.Provider {
    const lambdaFunction = new LambdaFunctionConstruct(
      this,
      "CreateAcceptPeeringLambda",
      {
        envName: "vpc-peering",
        functionName: "create-accept-peering",
        entry: "lambda/handlers/vpc-peering-create-accept.ts",
        timeout: cdk.Duration.minutes(5),
        initialPolicy: [
          // Permission to assume role in peer account
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [peerRoleArn],
          }),
          // Permission to create/delete peering connections
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "ec2:CreateVpcPeeringConnection",
              "ec2:DeleteVpcPeeringConnection",
              "ec2:DescribeVpcPeeringConnections",
              "ec2:CreateTags",
            ],
            resources: ["*"],
          }),
        ],
      }
    );

    // Add CDK Nag suppression for wildcard EC2 permissions
    NagSuppressions.addResourceSuppressions(
      lambdaFunction.function,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "VPC peering Lambda requires ec2:* permissions on all resources because peering connection IDs are not known at deploy time",
        },
      ],
      true
    );

    const provider = new cr.Provider(this, "PeeringProvider", {
      onEventHandler: lambdaFunction.function,
    });

    NagSuppressions.addResourceSuppressions(
      provider,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "Custom Resource Provider framework uses AWSLambdaBasicExecutionRole for CloudWatch Logs access",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          ],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "Custom Resource Provider requires invoke permissions on handler Lambda with all versions",
        },
        {
          id: "AwsSolutions-L1",
          reason:
            "Custom Resource Provider framework Lambda runtime is managed by CDK",
        },
      ],
      true
    );

    return provider;
  }

  /**
   * Create custom resource provider for updating route tables in peer VPC
   */
  private createUpdateRoutesProvider(
    peerRoleArn: string,
    region: string
  ): cr.Provider {
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

    const provider = new cr.Provider(this, "UpdateRoutesProvider", {
      onEventHandler: lambdaFunction.function,
    });

    NagSuppressions.addResourceSuppressions(
      provider,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "Custom Resource Provider framework uses AWSLambdaBasicExecutionRole for CloudWatch Logs access",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          ],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "Custom Resource Provider requires invoke permissions on handler Lambda with all versions",
        },
        {
          id: "AwsSolutions-L1",
          reason:
            "Custom Resource Provider framework Lambda runtime is managed by CDK",
        },
      ],
      true
    );

    return provider;
  }
}
