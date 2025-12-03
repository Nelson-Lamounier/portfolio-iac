/** @format */

import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cdk from "aws-cdk-lib";
import { Tags } from "aws-cdk-lib";

/**
 * Configuration for a target group
 */
export interface TargetGroupConfig {
  name: string; // Name for the target group (will be suffixed with a unique identifier)
  port: number; // Port number for the target group
  healthCheckPath?: string; // Health check path for the target group
  protocol?: elbv2.ApplicationProtocol; // Protocol to use
  healthCheckIntervalSeconds?: number; // Health check interval in seconds
  targetType?: elbv2.TargetType; // Target type
  deregistrationDelay?: cdk.Duration; // Deregistration delay in seconds
  createListener?: boolean; // Whether to attach a listener for this target group
  listenerPriority?: number; // Priority for the listener rule > Required if createListener is true
  hostHeader?: string; // Host header condition for the listener rule
  pathPattern?: string; // Path pattern condition for the listener rule
}

export interface ElasticLoadBalancerProps {
  // Properties for the Elastic Load Balancer construct
  envName: string; // Environment name for tagging
  vpc: ec2.IVpc; // VPC where the load balancer will be created
  loadBalancerName?: string; // Name for the load balancer
  internetFacing?: boolean; // Whether the load balancer is internet-facing or internal >
  httpPort?: number; // HTTP port for the load balancer
  httpsPort?: number; // HTTPS port for the load balancer
  enableHttps?: boolean; // Whether to create HTTPS listener
  certificateArn?: string; // ARN of the certificate to use for HTTPS > Required if enableHttps is true
  targetGroups?: TargetGroupConfig[]; // Initial target groups to create
  securityGroups?: ec2.ISecurityGroup[]; // Security groups to attach to the load balancer
}

/**
 * A construct for a dynamic Elastic Load Balancer (Application Load Balancer)
 * that can be used for multiple projects with different target groups
 */
export class ElasticLoadBalancer extends Construct {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer; // The Application Load Balancer instance
  public readonly httpListener?: elbv2.ApplicationListener; //The HTTP listener
  public readonly httpsListener?: elbv2.ApplicationListener; // The HTTPS listener
  public readonly targetGroups: Map<string, elbv2.ApplicationTargetGroup> =
    new Map();
  public readonly securityGroup: ec2.SecurityGroup; // The security group for the load balancer

  constructor(scope: Construct, id: string, props: ElasticLoadBalancerProps) {
    super(scope, id);

    const {
      vpc,
      loadBalancerName = "DynamicALB",
      internetFacing = true,
      httpPort = 80,
      httpsPort = 443,
      enableHttps = false,
      certificateArn,
      targetGroups = [],
      securityGroups,
    } = props;

    // Validate HTTPS configuration
    if (enableHttps && !certificateArn) {
      throw new Error("certificateArn is required when enableHttps is true");
    }

    // Create a security group if not provided
    if (!securityGroups || securityGroups.length === 0) {
      this.securityGroup = new ec2.SecurityGroup(
        this,
        "LoadBalancerSecurityGroup",
        {
          vpc,
          description: "Security group for dynamic load balancer",
          allowAllOutbound: true,
        }
      );

      // Allow HTTP traffic
      this.securityGroup.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(httpPort),
        "Allow HTTP traffic"
      );

      // Allow traffic on port 3000 for services
      this.securityGroup.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(3000),
        "Allow traffic on port 3000 for services"
      );

      // Allow HTTPS traffic if enabled
      if (enableHttps) {
        this.securityGroup.addIngressRule(
          ec2.Peer.anyIpv4(),
          ec2.Port.tcp(httpsPort),
          "Allow HTTPS traffic"
        );
      }
    } else {
      this.securityGroup = securityGroups[0] as ec2.SecurityGroup;
    }

    // Create the load balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "LoadBalancer",
      {
        vpc,
        loadBalancerName,
        internetFacing,
        securityGroup: this.securityGroup,
        vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      }
    );

    // Add tags to the load balancer
    Tags.of(this.loadBalancer).add("Environment", props.envName);
    Tags.of(this.loadBalancer).add("ManagedBy", "CDK");

    // Get stack name to use in export names to avoid conflicts
    const stackName = cdk.Stack.of(this).stackName;

    // Export the load balancer ARN and security group ID
    new cdk.CfnOutput(this, "LoadBalancerArn", {
      value: this.loadBalancer.loadBalancerArn,
      description: "The ARN of the load balancer",
      exportName: `${stackName}-${loadBalancerName}Arn`,
    });

    new cdk.CfnOutput(this, "SecurityGroupId", {
      value: this.securityGroup.securityGroupId,
      description: "The ID of the load balancer security group",
      exportName: `${stackName}-${loadBalancerName}SecurityGroupId`,
    });

    // Create HTTP listener
    this.httpListener = this.loadBalancer.addListener("HttpListener", {
      port: httpPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: true,
      defaultAction: enableHttps
        ? elbv2.ListenerAction.redirect({
            port: httpsPort.toString(),
            protocol: "HTTPS",
            permanent: true,
          })
        : elbv2.ListenerAction.fixedResponse(200, {
            contentType: "text/plain",
            messageBody: "OK",
          }),
    });

    // Create HTTPS listener if enabled
    if (enableHttps && certificateArn) {
      this.httpsListener = this.loadBalancer.addListener("HttpsListener", {
        port: httpsPort,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [
          {
            certificateArn,
          },
        ],
        open: true,
        defaultAction: elbv2.ListenerAction.fixedResponse(200, {
          contentType: "text/plain",
          messageBody: "OK",
        }),
      });
    }

    // Create initial target groups if any
    for (const tgConfig of targetGroups) {
      this.addTargetGroup(tgConfig);
    }

    // Output the load balancer DNS name
    new cdk.CfnOutput(this, "LoadBalancerDnsName", {
      value: this.loadBalancer.loadBalancerDnsName,
      description: "The DNS name of the load balancer",
    });
  }

  /**
   * Add a new target group to the load balancer
   * @param config The target group configuration
   * @returns The created target group
   */
  public addTargetGroup(
    config: TargetGroupConfig
  ): elbv2.ApplicationTargetGroup {
    const {
      name,
      port,
      healthCheckPath = "/",
      protocol = elbv2.ApplicationProtocol.HTTP,
      healthCheckIntervalSeconds = 30,
      targetType = elbv2.TargetType.INSTANCE,
      deregistrationDelay = cdk.Duration.seconds(60),
      createListener = true,
      listenerPriority,
      hostHeader,
      pathPattern,
    } = config;

    // Validate listener configuration
    if (createListener && !this.httpListener && !this.httpsListener) {
      throw new Error("Cannot create listener rule: no listener available");
    }

    if (createListener && !listenerPriority) {
      throw new Error(
        "listenerPriority is required when createListener is true"
      );
    }

    if (createListener && !hostHeader && !pathPattern) {
      throw new Error(
        "At least one of hostHeader or pathPattern is required when createListener is true"
      );
    }

    // Create the target group
    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      `TargetGroup-${name}`,
      {
        vpc: this.loadBalancer.vpc,
        port,
        protocol,
        targetType,
        deregistrationDelay,
        healthCheck: {
          path: healthCheckPath,
          interval: cdk.Duration.seconds(healthCheckIntervalSeconds),
          port: "traffic-port",
          timeout: cdk.Duration.seconds(10), // Increased from 5 to 10 seconds
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 5, // Increased from 3 to 5 (more lenient)
        },
      }
    );

    // Store the target group in the map
    this.targetGroups.set(name, targetGroup);

    // Create listener rules if requested
    if (createListener) {
      const listener = this.httpsListener || this.httpListener;
      if (listener) {
        const conditions: elbv2.ListenerCondition[] = [];

        if (hostHeader) {
          conditions.push(elbv2.ListenerCondition.hostHeaders([hostHeader]));
        }

        if (pathPattern) {
          conditions.push(elbv2.ListenerCondition.pathPatterns([pathPattern]));
        }

        listener.addTargetGroups(`TargetGroupRule-${name}`, {
          targetGroups: [targetGroup],
          priority: listenerPriority,
          conditions,
        });
      }
    }

    // Output the target group ARN
    new cdk.CfnOutput(this, `TargetGroupArn-${name}`, {
      value: targetGroup.targetGroupArn,
      description: `The ARN of the ${name} target group`,
    });

    return targetGroup;
  }
}
