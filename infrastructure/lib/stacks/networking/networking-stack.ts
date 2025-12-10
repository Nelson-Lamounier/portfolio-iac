/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { VpcConstruct } from "../../constructs/networking/vpc/vpc-construct";
import { VpcFlowLogsConstruct } from "../../constructs/networking/vpc/vpc-flow-logs-construct";
import { SubnetConfigurationHelper } from "../../constructs/networking/vpc/subnet-construct";
import { SuppressionManager } from "../../cdk-nag";

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
    // 4. SSM PARAMETERS (for cross-stack/cross-account discovery)
    // ========================================================================
    new ssm.StringParameter(this, "VpcIdParameter", {
      parameterName: `/networking/${envName}/vpc-id`,
      stringValue: this.vpc.vpcId,
      description: `VPC ID for ${envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "VpcCidrParameter", {
      parameterName: `/networking/${envName}/vpc-cidr`,
      stringValue: this.vpc.vpcCidrBlock,
      description: `VPC CIDR for ${envName} environment`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // ========================================================================
    // 5. CLOUDFORMATION OUTPUTS
    // ========================================================================
    // Note: Removed exportName to avoid cross-stack dependency issues
    // Use direct stack references instead of exports/imports for better dependency management

    new cdk.CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId,
      description: "VPC ID",
      // exportName removed - use direct stack references instead
    });

    new cdk.CfnOutput(this, "VpcCidr", {
      value: this.vpc.vpcCidrBlock,
      description: "VPC CIDR Block",
      // exportName removed - use direct stack references instead
    });

    new cdk.CfnOutput(this, "AvailabilityZones", {
      value: this.vpc.availabilityZones.join(","),
      description: "Availability Zones",
      // exportName removed - use direct stack references instead
    });

    // Public subnet outputs (for reference only, no exports)
    this.vpcConstruct.publicSubnets.forEach(
      (subnet: ec2.ISubnet, index: number) => {
        new cdk.CfnOutput(this, `PublicSubnet${index + 1}Id`, {
          value: subnet.subnetId,
          description: `Public Subnet ${index + 1} ID`,
          // exportName removed - use direct stack references instead
        });
      }
    );

    // Private subnet outputs (for reference only, no exports)
    this.vpcConstruct.privateSubnets.forEach(
      (subnet: ec2.ISubnet, index: number) => {
        new cdk.CfnOutput(this, `PrivateSubnet${index + 1}Id`, {
          value: subnet.subnetId,
          description: `Private Subnet ${index + 1} ID`,
          // exportName removed - use direct stack references instead
        });
      }
    );

    // Flow logs output (for reference only, no export)
    if (this.flowLogs) {
      new cdk.CfnOutput(this, "FlowLogsLogGroup", {
        value: this.flowLogs.logGroupName,
        description: "VPC Flow Logs CloudWatch Log Group",
        // exportName removed - use direct stack references instead
      });
    }

    // ========================================================================
    // 6. CDK NAG SUPPRESSIONS
    // ========================================================================
    // Apply centralized CDK Nag suppressions
    SuppressionManager.applyToStack(this, "NetworkingStack", envName);

    // ========================================================================
    // 7. RESOURCE TAGGING
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
