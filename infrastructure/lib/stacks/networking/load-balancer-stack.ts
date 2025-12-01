/** @format */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import {
  ElasticLoadBalancer,
  TargetGroupConfig,
} from "../../constructs/networking/load-balancer-construct";

export interface LoadBalancerStackProps extends cdk.StackProps {
  envName: string;
  vpc: ec2.IVpc;
  loadBalancerName?: string;
  enableHttps?: boolean;
  certificateArn?: string;
  initialTargetGroups?: TargetGroupConfig[];
  tags?: { [key: string]: string };
}

export class LoadBalancerStack extends cdk.Stack {
  public readonly loadBalancer: ElasticLoadBalancer;
  public readonly targetGroups: Map<string, elbv2.ApplicationTargetGroup>;
  public readonly httpListener?: elbv2.ApplicationListener;
  public readonly httpsListener?: elbv2.ApplicationListener;

  constructor(scope: Construct, id: string, props: LoadBalancerStackProps) {
    super(scope, id, props);

    // Create the Elastic Load Balancer
    this.loadBalancer = new ElasticLoadBalancer(this, "LoadBalancer", {
      envName: props.envName,
      vpc: props.vpc,
      loadBalancerName: props.loadBalancerName || "PortfolioLoadBalancer",
      enableHttps: props.enableHttps || false,
      certificateArn: props.certificateArn,
      targetGroups: props.initialTargetGroups || [],
    });

    // Store references to listeners and target groups
    this.httpListener = this.loadBalancer.httpListener;
    this.httpsListener = this.loadBalancer.httpsListener;
    this.targetGroups = this.loadBalancer.targetGroups;

    // Apply custom tags if provided
    if (props.tags) {
      Object.entries(props.tags).forEach(([key, value]) => {
        cdk.Tags.of(this.loadBalancer.loadBalancer).add(key, value);
      });
    }

    // Create stack-level outputs with export names
    new cdk.CfnOutput(this, "LoadBalancerArn", {
      value: this.loadBalancer.loadBalancer.loadBalancerArn,
      description: "The ARN of the load balancer",
      exportName: `${this.stackName}-LoadBalancerArn`,
    });

    new cdk.CfnOutput(this, "LoadBalancerDnsName", {
      value: this.loadBalancer.loadBalancer.loadBalancerDnsName,
      description: "The DNS name of the load balancer",
      exportName: `${props.envName}-LoadBalancerDnsName`,
    });

    new cdk.CfnOutput(this, "SecurityGroupId", {
      value: this.loadBalancer.securityGroup.securityGroupId,
      description: "The ID of the load balancer security group",
      exportName: `${props.envName}-SecurityGroupId`,
    });

    // Output listener information
    if (this.httpListener) {
      new cdk.CfnOutput(this, "HttpListenerArn", {
        value: this.httpListener.listenerArn,
        description: "The ARN of the HTTP listener",
        exportName: `${props.envName}-HttpListenerArn`,
      });
    }

    if (this.httpsListener) {
      new cdk.CfnOutput(this, "HttpsListenerArn", {
        value: this.httpsListener.listenerArn,
        description: "The ARN of the HTTPS listener",
        exportName: `${props.envName}-HttpsListenerArn`,
      });
    }

    // Output target group information
    this.targetGroups.forEach((targetGroup, name) => {
      new cdk.CfnOutput(this, `TargetGroupArn-${name}`, {
        value: targetGroup.targetGroupArn,
        description: `The ARN of the ${name} target group`,
        exportName: `${props.envName}-TargetGroupArn-${name}`,
      });
    });
  }

  /**
   * Add a new target group to the load balancer
   */
  public addTargetGroup(
    config: TargetGroupConfig
  ): elbv2.ApplicationTargetGroup {
    return this.loadBalancer.addTargetGroup(config);
  }

  /**
   * Get a target group by name
   */
  public getTargetGroup(
    name: string
  ): elbv2.ApplicationTargetGroup | undefined {
    return this.targetGroups.get(name);
  }

  /**
   * Get all target groups
   */
  public getAllTargetGroups(): Map<string, elbv2.ApplicationTargetGroup> {
    return this.targetGroups;
  }

  /**
   * Get the load balancer instance
   */
  public getLoadBalancer(): elbv2.ApplicationLoadBalancer {
    return this.loadBalancer.loadBalancer;
  }

  /**
   * Get the security group
   */
  public getSecurityGroup(): ec2.SecurityGroup {
    return this.loadBalancer.securityGroup;
  }
}
