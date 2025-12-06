/** @format */

import { Construct } from "constructs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

export interface HttpListenerProps {
  loadBalancer: elbv2.IApplicationLoadBalancer;
  port?: number;
  defaultAction?: elbv2.ListenerAction;
}

export interface HttpsListenerProps {
  loadBalancer: elbv2.IApplicationLoadBalancer;
  certificateArn: string;
  port?: number;
  sslPolicy?: elbv2.SslPolicy;
  defaultAction?: elbv2.ListenerAction;
}

export interface AlbListenerConstructProps {
  loadBalancer: elbv2.IApplicationLoadBalancer;
  enableHttp?: boolean;
  enableHttps?: boolean;
  certificateArn?: string;
  httpPort?: number;
  httpsPort?: number;
  redirectHttpToHttps?: boolean;
  sslPolicy?: elbv2.SslPolicy;
}

/**
 * Reusable construct for creating ALB listeners
 *
 * This construct manages HTTP and HTTPS listeners for an ALB.
 * It handles common patterns like HTTP to HTTPS redirection.
 *
 * Features:
 * - HTTP listener with configurable default action
 * - HTTPS listener with certificate
 * - Automatic HTTP to HTTPS redirection
 * - Configurable SSL policy
 */
export class AlbListenerConstruct extends Construct {
  public readonly httpListener?: elbv2.ApplicationListener;
  public readonly httpsListener?: elbv2.ApplicationListener;

  constructor(scope: Construct, id: string, props: AlbListenerConstructProps) {
    super(scope, id);

    const {
      loadBalancer,
      enableHttp = true,
      enableHttps = false,
      certificateArn,
      httpPort = 80,
      httpsPort = 443,
      redirectHttpToHttps = false,
      sslPolicy = elbv2.SslPolicy.RECOMMENDED_TLS,
    } = props;

    // Validate HTTPS configuration
    if (enableHttps && !certificateArn) {
      throw new Error("certificateArn is required when enableHttps is true");
    }

    if (redirectHttpToHttps && !enableHttps) {
      throw new Error(
        "enableHttps must be true when redirectHttpToHttps is true"
      );
    }

    // Create HTTPS listener first (if enabled)
    if (enableHttps && certificateArn) {
      this.httpsListener = loadBalancer.addListener("HttpsListener", {
        port: httpsPort,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [elbv2.ListenerCertificate.fromArn(certificateArn)],
        sslPolicy,
        open: true,
        defaultAction: elbv2.ListenerAction.fixedResponse(404, {
          contentType: "text/plain",
          messageBody: "Not Found",
        }),
      });
    }

    // Create HTTP listener
    if (enableHttp) {
      const defaultAction = redirectHttpToHttps
        ? elbv2.ListenerAction.redirect({
            port: httpsPort.toString(),
            protocol: "HTTPS",
            permanent: true,
          })
        : elbv2.ListenerAction.fixedResponse(404, {
            contentType: "text/plain",
            messageBody: "Not Found",
          });

      this.httpListener = loadBalancer.addListener("HttpListener", {
        port: httpPort,
        protocol: elbv2.ApplicationProtocol.HTTP,
        open: true,
        defaultAction,
      });
    }
  }

  /**
   * Add a target group to the primary listener (HTTPS if available, otherwise HTTP)
   */
  public addTargetGroup(
    id: string,
    targetGroup: elbv2.IApplicationTargetGroup,
    priority: number,
    conditions?: elbv2.ListenerCondition[]
  ): void {
    const listener = this.httpsListener || this.httpListener;
    if (!listener) {
      throw new Error("No listener available to add target group");
    }

    listener.addTargetGroups(id, {
      targetGroups: [targetGroup],
      priority,
      conditions: conditions || [],
    });
  }

  /**
   * Get the primary listener (HTTPS if available, otherwise HTTP)
   */
  public get primaryListener(): elbv2.ApplicationListener | undefined {
    return this.httpsListener || this.httpListener;
  }
}
