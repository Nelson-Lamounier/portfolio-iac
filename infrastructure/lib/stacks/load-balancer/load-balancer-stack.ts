/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
import { AlbConstruct } from "../../constructs/networking/alb/alb-construct";
import { AlbListenerConstruct } from "../../constructs/networking/alb/alb-listener-construct";
import { AlbTargetGroupConstruct } from "../../constructs/networking/alb/alb-target-group-construct";
import { SuppressionManager } from "../../cdk-nag";

export interface TargetGroupConfig {
  name: string;
  port: number;
  protocol?: elbv2.ApplicationProtocol;
  targetType?: elbv2.TargetType;
  healthCheckPath?: string;
  healthCheckInterval?: cdk.Duration;
  deregistrationDelay?: cdk.Duration;
}

export interface ListenerRuleConfig {
  targetGroupName: string;
  priority: number;
  pathPattern?: string;
  hostHeader?: string;
}

export interface LoadBalancerStackProps extends cdk.StackProps {
  envName: string;
  vpc: ec2.IVpc;
  loadBalancerName?: string;
  internetFacing?: boolean;
  enableHttps?: boolean;
  certificateArn?: string;
  redirectHttpToHttps?: boolean;
  deletionProtection?: boolean;
  accessLogEnabled?: boolean;
  allowedCidrs?: string[];
}

/**
 * Refactored Load Balancer Stack
 *
 * This stack creates an Application Load Balancer with modular constructs:
 * - AlbConstruct: Creates the ALB resource
 * - AlbListenerConstruct: Manages HTTP/HTTPS listeners
 * - AlbTargetGroupConstruct: Creates target groups (added dynamically)
 *
 * Benefits:
 * - Clear separation of concerns
 * - Easier to test individual components
 * - More flexible and reusable
 * - Better CDK Nag compliance
 *
 * Usage:
 * 1. Create the stack
 * 2. Add target groups with addTargetGroup()
 * 3. Add listener rules with addListenerRule()
 */
export class LoadBalancerStack extends cdk.Stack {
  public readonly alb: AlbConstruct;
  public readonly listeners: AlbListenerConstruct;
  public readonly targetGroups: Map<string, AlbTargetGroupConstruct> =
    new Map();

  constructor(scope: Construct, id: string, props: LoadBalancerStackProps) {
    super(scope, id, props);

    const {
      envName,
      vpc,
      loadBalancerName = `${envName}-alb`,
      internetFacing = true,
      enableHttps = false,
      certificateArn,
      redirectHttpToHttps = false,
      deletionProtection = false,
      accessLogEnabled = true,
      allowedCidrs = ["0.0.0.0/0"],
    } = props;

    // ========================================================================
    // 1. CREATE APPLICATION LOAD BALANCER
    // ========================================================================
    this.alb = new AlbConstruct(this, "ALB", {
      vpc,
      envName,
      loadBalancerName,
      internetFacing,
      deletionProtection,
      accessLogEnabled,
      accessLogPrefix: `${envName}/alb`,
    });

    // ========================================================================
    // 2. CONFIGURE SECURITY GROUP
    // ========================================================================
    // Allow HTTP traffic
    allowedCidrs.forEach((cidr) => {
      this.alb.allowInbound(
        ec2.Peer.ipv4(cidr),
        ec2.Port.tcp(80),
        `Allow HTTP from ${cidr}`
      );
    });

    // Allow HTTPS traffic if enabled
    if (enableHttps) {
      allowedCidrs.forEach((cidr) => {
        this.alb.allowInbound(
          ec2.Peer.ipv4(cidr),
          ec2.Port.tcp(443),
          `Allow HTTPS from ${cidr}`
        );
      });
    }

    // ========================================================================
    // 3. CREATE LISTENERS
    // ========================================================================
    this.listeners = new AlbListenerConstruct(this, "Listeners", {
      loadBalancer: this.alb.loadBalancer,
      enableHttp: true,
      enableHttps,
      certificateArn,
      redirectHttpToHttps,
    });

    // ========================================================================
    // 4. CLOUDFORMATION OUTPUTS
    // ========================================================================
    new cdk.CfnOutput(this, "LoadBalancerArn", {
      value: this.alb.loadBalancerArn,
      description: "Application Load Balancer ARN",
      exportName: `${envName}-alb-arn`,
    });

    new cdk.CfnOutput(this, "LoadBalancerDnsName", {
      value: this.alb.dnsName,
      description: "Application Load Balancer DNS Name",
      exportName: `${envName}-alb-dns`,
    });

    new cdk.CfnOutput(this, "SecurityGroupId", {
      value: this.alb.securityGroup.securityGroupId,
      description: "ALB Security Group ID",
      exportName: `${envName}-alb-sg-id`,
    });

    if (this.listeners.httpListener) {
      new cdk.CfnOutput(this, "HttpListenerArn", {
        value: this.listeners.httpListener.listenerArn,
        description: "HTTP Listener ARN",
        exportName: `${envName}-http-listener-arn`,
      });
    }

    if (this.listeners.httpsListener) {
      new cdk.CfnOutput(this, "HttpsListenerArn", {
        value: this.listeners.httpsListener.listenerArn,
        description: "HTTPS Listener ARN",
        exportName: `${envName}-https-listener-arn`,
      });
    }

    // ========================================================================
    // 5. CDK NAG SUPPRESSIONS
    // ========================================================================
    // Apply centralized CDK Nag suppressions
    SuppressionManager.applyToStack(this, "LoadBalancerStack", envName);

    // ========================================================================
    // 6. RESOURCE TAGGING
    // ========================================================================
    cdk.Tags.of(this).add("Stack", "LoadBalancer");
    cdk.Tags.of(this).add("Environment", envName);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }

  /**
   * Add a target group to the load balancer
   */
  public addTargetGroup(
    config: TargetGroupConfig
  ): elbv2.IApplicationTargetGroup {
    const targetGroupConstruct = new AlbTargetGroupConstruct(
      this,
      `TG-${config.name}`,
      {
        vpc: this.alb.loadBalancer.vpc!,
        name: config.name,
        port: config.port,
        protocol: config.protocol,
        targetType: config.targetType,
        healthCheckPath: config.healthCheckPath,
        healthCheckInterval: config.healthCheckInterval,
        deregistrationDelay: config.deregistrationDelay,
      }
    );

    this.targetGroups.set(config.name, targetGroupConstruct);

    // Output target group ARN
    new cdk.CfnOutput(this, `TargetGroupArn-${config.name}`, {
      value: targetGroupConstruct.targetGroupArn,
      description: `Target Group ARN for ${config.name}`,
      exportName: `${this.stackName}-tg-${config.name}-arn`,
    });

    return targetGroupConstruct.targetGroup;
  }

  /**
   * Add a listener rule to route traffic to a target group
   */
  public addListenerRule(config: ListenerRuleConfig): void {
    const targetGroupConstruct = this.targetGroups.get(config.targetGroupName);
    if (!targetGroupConstruct) {
      throw new Error(
        `Target group ${config.targetGroupName} not found. Create it first with addTargetGroup()`
      );
    }

    const conditions: elbv2.ListenerCondition[] = [];

    if (config.pathPattern) {
      conditions.push(
        elbv2.ListenerCondition.pathPatterns([config.pathPattern])
      );
    }

    if (config.hostHeader) {
      conditions.push(elbv2.ListenerCondition.hostHeaders([config.hostHeader]));
    }

    if (conditions.length === 0) {
      throw new Error(
        "At least one condition (pathPattern or hostHeader) is required"
      );
    }

    this.listeners.addTargetGroup(
      `Rule-${config.targetGroupName}`,
      targetGroupConstruct.targetGroup,
      config.priority,
      conditions
    );
  }

  /**
   * Get a target group by name
   */
  public getTargetGroup(name: string): elbv2.IApplicationTargetGroup {
    const targetGroup = this.targetGroups.get(name);
    if (!targetGroup) {
      throw new Error(`Target group ${name} not found`);
    }
    return targetGroup.targetGroup;
  }

  /**
   * Get the load balancer
   */
  public getLoadBalancer(): elbv2.IApplicationLoadBalancer {
    return this.alb.loadBalancer;
  }

  /**
   * Get the security group
   */
  public getSecurityGroup(): ec2.ISecurityGroup {
    return this.alb.securityGroup;
  }

  /**
   * Get the primary listener (HTTPS if available, otherwise HTTP)
   */
  public getPrimaryListener(): elbv2.ApplicationListener | undefined {
    return this.listeners.primaryListener;
  }
}
