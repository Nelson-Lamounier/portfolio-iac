/** @format */

import * as cdk from "aws-cdk-lib";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

export interface AlbListenerConstructProps {
  /**
   * The Application Load Balancer to add the listener to
   */
  loadBalancer: elbv2.IApplicationLoadBalancer;

  /**
   * Environment name for resource naming and tagging
   */
  envName: string;

  /**
   * Port for the listener
   * @default 80
   */
  port?: number;

  /**
   * Protocol for the listener
   * @default HTTP
   */
  protocol?: elbv2.ApplicationProtocol;

  /**
   * SSL certificate ARN for HTTPS listeners
   */
  certificateArn?: string;

  /**
   * Default action for the listener
   * @default Fixed response with 404
   */
  defaultAction?: elbv2.ListenerAction;

  /**
   * Whether to redirect HTTP to HTTPS
   * @default false
   */
  redirectToHttps?: boolean;

  /**
   * SSL policy for HTTPS listeners
   * @default ELBSecurityPolicy-TLS-1-2-2017-01
   */
  sslPolicy?: elbv2.SslPolicy;
}

/**
 * Construct for creating an ALB listener with monitoring-specific configuration
 */
export class AlbListenerConstruct extends Construct {
  public readonly listener: elbv2.ApplicationListener;

  constructor(scope: Construct, id: string, props: AlbListenerConstructProps) {
    super(scope, id);

    const {
      loadBalancer,
      envName,
      port = 80,
      protocol = elbv2.ApplicationProtocol.HTTP,
      certificateArn,
      defaultAction,
      redirectToHttps = false,
      sslPolicy = elbv2.SslPolicy.TLS12,
    } = props;

    // Create default action if not provided
    let listenerAction = defaultAction;

    if (!listenerAction) {
      if (redirectToHttps && protocol === elbv2.ApplicationProtocol.HTTP) {
        listenerAction = elbv2.ListenerAction.redirect({
          protocol: "HTTPS",
          port: "443",
          permanent: true,
        });
      } else {
        listenerAction = elbv2.ListenerAction.fixedResponse(404, {
          contentType: "text/plain",
          messageBody: "Not Found - Monitoring Services",
        });
      }
    }

    // Create listener
    this.listener = loadBalancer.addListener(`MonitoringListener${port}`, {
      port,
      protocol,
      defaultAction: listenerAction,
      certificates: certificateArn
        ? [elbv2.ListenerCertificate.fromArn(certificateArn)]
        : undefined,
      sslPolicy:
        protocol === elbv2.ApplicationProtocol.HTTPS ? sslPolicy : undefined,
    });

    // Add tags
    cdk.Tags.of(this.listener).add(
      "Name",
      `${envName}-monitoring-listener-${port}`
    );
    cdk.Tags.of(this.listener).add("Environment", envName);
    cdk.Tags.of(this.listener).add("Purpose", "MonitoringListener");
    cdk.Tags.of(this.listener).add("ManagedBy", "CDK");

    // Output listener information
    new cdk.CfnOutput(this, "ListenerArn", {
      value: this.listener.listenerArn,
      description: `ALB Listener ARN for ${envName} monitoring on port ${port}`,
      exportName: `${cdk.Stack.of(this).stackName}-listener-${port}-arn`,
    });
  }
}
