/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { VpcConstruct } from "../../constructs/networking/vpc/vpc-construct";
import { VpcFlowLogsConstruct } from "../../constructs/networking/vpc/vpc-flow-logs-construct";
import { SubnetConfigurationHelper } from "../../constructs/networking/vpc/subnet-construct";

export interface NetworkingStackProps extends cdk.StackProps {
  envName: string;
  vpcCidr?: string;
  maxAzs?: number;
  natGateways?: number;
  enableVpcFlowLogs?: boolean;
  enableVpcEndpoints?: boolean;
}

/**
 * Refactored Networking Stack
 *
 * This stack creates the foundational network infrastructure using
 * modular constructs for better separation of concerns.
 *
 * Components:
 * - EnhancedVpcConstruct: VPC with subnets and routing
 * - VpcFlowLogsConstruct: Network traffic logging (optional)
 * - VPC Endpoints: S3 and DynamoDB gateway endpoints (optional)
 *
 * Features:
 * - Configurable CIDR and availability zones
 * - Optional NAT gateways for cost optimization
 * - VPC Flow Logs for security and troubleshooting
 * - VPC Endpoints for AWS service access
 * - Comprehensive CloudFormation outputs
 *
 * CDK Nag Compliance:
 * - AwsSolutions-VPC7: VPC Flow Logs enabled (when enableVpcFlowLogs=true)
 */
export class NetworkingStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly vpcConstruct: VpcConstruct;
  public readonly flowLogs?: VpcFlowLogsConstruct;

  constructor(scope: Construct, id: string, props: NetworkingStackProps) {
    super(scope, id, props);

    const {
      envName,
      vpcCidr = "10.0.0.0/16",
      maxAzs = 2,
      natGateways = 0,
      enableVpcFlowLogs = true,
      enableVpcEndpoints = true,
    } = props;

    // ========================================================================
    // 1. CREATE VPC
    // ========================================================================
    this.vpcConstruct = new VpcConstruct(this, "Vpc", {
      envName,
      vpcName: `${envName}-vpc`,
      cidr: vpcCidr,
      maxAzs,
      natGateways,
      subnetConfiguration: SubnetConfigurationHelper.twoTierConfiguration(),
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    this.vpc = this.vpcConstruct.vpc;

    // ========================================================================
    // 2. ENABLE VPC FLOW LOGS (CDK Nag: AwsSolutions-VPC7)
    // ========================================================================
    if (enableVpcFlowLogs) {
      this.flowLogs = new VpcFlowLogsConstruct(this, "FlowLogs", {
        vpc: this.vpc,
        envName,
        trafficType: ec2.FlowLogTrafficType.ALL,
      });
    }

    // ========================================================================
    // 3. ADD VPC ENDPOINTS (Optional - for private AWS service access)
    // ========================================================================
    if (enableVpcEndpoints) {
      // S3 Gateway Endpoint (no cost)
      this.vpc.addGatewayEndpoint("S3Endpoint", {
        service: ec2.GatewayVpcEndpointAwsService.S3,
      });

      // DynamoDB Gateway Endpoint (no cost)
      this.vpc.addGatewayEndpoint("DynamoDbEndpoint", {
        service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      });

      // ECR API Interface Endpoint (for private ECR access)
      // Uncomment if needed - has hourly cost
      // this.vpc.addInterfaceEndpoint("EcrApiEndpoint", {
      //   service: ec2.InterfaceVpcEndpointAwsService.ECR,
      // });

      // ECR Docker Interface Endpoint
      // Uncomment if needed - has hourly cost
      // this.vpc.addInterfaceEndpoint("EcrDockerEndpoint", {
      //   service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      // });
    }

    // ========================================================================
    // 4. CLOUDFORMATION OUTPUTS
    // ========================================================================
    new cdk.CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId,
      description: "VPC ID",
      exportName: `${envName}-vpc-id`,
    });

    new cdk.CfnOutput(this, "VpcCidr", {
      value: this.vpc.vpcCidrBlock,
      description: "VPC CIDR Block",
      exportName: `${envName}-vpc-cidr`,
    });

    new cdk.CfnOutput(this, "AvailabilityZones", {
      value: this.vpc.availabilityZones.join(","),
      description: "Availability Zones",
      exportName: `${envName}-azs`,
    });

    // Public subnet outputs
    this.vpcConstruct.publicSubnets.forEach(
      (subnet: ec2.ISubnet, index: number) => {
        new cdk.CfnOutput(this, `PublicSubnet${index + 1}Id`, {
          value: subnet.subnetId,
          description: `Public Subnet ${index + 1} ID`,
          exportName: `${envName}-public-subnet-${index + 1}-id`,
        });
      }
    );

    // Private subnet outputs
    this.vpcConstruct.privateSubnets.forEach(
      (subnet: ec2.ISubnet, index: number) => {
        new cdk.CfnOutput(this, `PrivateSubnet${index + 1}Id`, {
          value: subnet.subnetId,
          description: `Private Subnet ${index + 1} ID`,
          exportName: `${envName}-private-subnet-${index + 1}-id`,
        });
      }
    );

    // Flow logs output
    if (this.flowLogs) {
      new cdk.CfnOutput(this, "FlowLogsLogGroup", {
        value: this.flowLogs.logGroupName,
        description: "VPC Flow Logs CloudWatch Log Group",
        exportName: `${envName}-flow-logs-log-group`,
      });
    }

    // ========================================================================
    // 5. RESOURCE TAGGING
    // ========================================================================
    cdk.Tags.of(this).add("Stack", "Networking");
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }

  /**
   * Get public subnets
   */
  public get publicSubnets(): ec2.ISubnet[] {
    return this.vpcConstruct.publicSubnets;
  }

  /**
   * Get private subnets
   */
  public get privateSubnets(): ec2.ISubnet[] {
    return this.vpcConstruct.privateSubnets;
  }

  /**
   * Get isolated subnets
   */
  public get isolatedSubnets(): ec2.ISubnet[] {
    return this.vpcConstruct.isolatedSubnets;
  }
}
