/** @format */

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ElasticLoadBalancer } from "../../lib/constructs/networking/load-balancer-construct";

describe("ElasticLoadBalancer Construct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let vpc: ec2.Vpc;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack");
    vpc = new ec2.Vpc(stack, "TestVpc", {
      maxAzs: 2,
      natGateways: 0,
    });
  });

  describe("Basic Configuration", () => {
    test("creates load balancer with default properties", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Type: "application",
          Scheme: "internet-facing",
        }
      );
    });

    test("creates load balancer with custom name", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        loadBalancerName: "custom-alb",
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Name: "custom-alb",
        }
      );
    });

    test("creates internal load balancer when specified", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        internetFacing: false,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Scheme: "internal",
        }
      );
    });

    test("creates security group with correct ingress rules", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
      });

      const template = Template.fromStack(stack);

      // Check for HTTP ingress rule
      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            CidrIp: "0.0.0.0/0",
            FromPort: 80,
            ToPort: 80,
            IpProtocol: "tcp",
          }),
        ]),
      });
    });

    test("adds HTTPS ingress rule when HTTPS is enabled", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        enableHttps: true,
        certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/test",
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            CidrIp: "0.0.0.0/0",
            FromPort: 443,
            ToPort: 443,
            IpProtocol: "tcp",
          }),
        ]),
      });
    });
  });

  describe("HTTP Listener", () => {
    test("creates HTTP listener with default port", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Port: 80,
        Protocol: "HTTP",
      });
    });

    test("creates HTTP listener with custom port", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        httpPort: 8080,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Port: 8080,
        Protocol: "HTTP",
      });
    });

    test("HTTP listener redirects to HTTPS when HTTPS is enabled", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        enableHttps: true,
        certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/test",
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Port: 80,
        Protocol: "HTTP",
        DefaultActions: [
          {
            Type: "redirect",
            RedirectConfig: {
              Port: "443",
              Protocol: "HTTPS",
              StatusCode: "HTTP_301",
            },
          },
        ],
      });
    });

    test("HTTP listener returns fixed response when HTTPS is disabled", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        enableHttps: false,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Port: 80,
        Protocol: "HTTP",
        DefaultActions: [
          {
            Type: "fixed-response",
            FixedResponseConfig: {
              StatusCode: "200",
            },
          },
        ],
      });
    });
  });

  describe("HTTPS Listener", () => {
    test("creates HTTPS listener when enabled", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        enableHttps: true,
        certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/test",
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Port: 443,
        Protocol: "HTTPS",
        Certificates: [
          {
            CertificateArn:
              "arn:aws:acm:us-east-1:123456789012:certificate/test",
          },
        ],
      });
    });

    test("does not create HTTPS listener when disabled", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        enableHttps: false,
      });

      const template = Template.fromStack(stack);

      const listeners = template.findResources(
        "AWS::ElasticLoadBalancingV2::Listener"
      );
      const httpsListeners = Object.values(listeners).filter(
        (listener: any) => listener.Properties.Protocol === "HTTPS"
      );

      expect(httpsListeners).toHaveLength(0);
    });

    test("throws error when HTTPS enabled without certificate ARN", () => {
      expect(() => {
        new ElasticLoadBalancer(stack, "TestLB", {
          envName: "test",
          vpc,
          enableHttps: true,
        });
      }).toThrow("certificateArn is required when enableHttps is true");
    });

    test("creates HTTPS listener with custom port", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        enableHttps: true,
        certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/test",
        httpsPort: 8443,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Port: 8443,
        Protocol: "HTTPS",
      });
    });
  });

  describe("Target Groups", () => {
    test("creates target group with correct properties", () => {
      const lb = new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        targetGroups: [
          {
            name: "test-tg",
            port: 3000,
            healthCheckPath: "/health",
            createListener: false,
          },
        ],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          Port: 3000,
          Protocol: "HTTP",
          HealthCheckPath: "/health",
          HealthCheckIntervalSeconds: 30,
          HealthyThresholdCount: 2,
          UnhealthyThresholdCount: 5, // Updated to match new health check configuration
        }
      );

      expect(lb.targetGroups.has("test-tg")).toBe(true);
    });

    test("creates target group with custom health check interval", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        targetGroups: [
          {
            name: "test-tg",
            port: 3000,
            healthCheckIntervalSeconds: 60,
            createListener: false,
          },
        ],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          HealthCheckIntervalSeconds: 60,
        }
      );
    });

    test("creates target group with INSTANCE target type", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        targetGroups: [
          {
            name: "test-tg",
            port: 3000,
            targetType: elbv2.TargetType.INSTANCE,
            createListener: false,
          },
        ],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          TargetType: "instance",
        }
      );
    });

    test("creates listener rule for target group with host header", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        targetGroups: [
          {
            name: "test-tg",
            port: 3000,
            createListener: true,
            listenerPriority: 100,
            hostHeader: "example.com",
          },
        ],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::ListenerRule",
        {
          Priority: 100,
          Conditions: Match.arrayWith([
            {
              Field: "host-header",
              HostHeaderConfig: {
                Values: ["example.com"],
              },
            },
          ]),
        }
      );
    });

    test("creates listener rule for target group with path pattern", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        targetGroups: [
          {
            name: "test-tg",
            port: 3000,
            createListener: true,
            listenerPriority: 100,
            pathPattern: "/api/*",
          },
        ],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::ListenerRule",
        {
          Priority: 100,
          Conditions: Match.arrayWith([
            {
              Field: "path-pattern",
              PathPatternConfig: {
                Values: ["/api/*"],
              },
            },
          ]),
        }
      );
    });

    test("throws error when creating listener without priority", () => {
      expect(() => {
        new ElasticLoadBalancer(stack, "TestLB", {
          envName: "test",
          vpc,
          targetGroups: [
            {
              name: "test-tg",
              port: 3000,
              createListener: true,
              hostHeader: "example.com",
            },
          ],
        });
      }).toThrow("listenerPriority is required when createListener is true");
    });

    test("throws error when creating listener without conditions", () => {
      expect(() => {
        new ElasticLoadBalancer(stack, "TestLB", {
          envName: "test",
          vpc,
          targetGroups: [
            {
              name: "test-tg",
              port: 3000,
              createListener: true,
              listenerPriority: 100,
            },
          ],
        });
      }).toThrow(
        "At least one of hostHeader or pathPattern is required when createListener is true"
      );
    });

    test("can add target group dynamically", () => {
      const lb = new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
      });

      lb.addTargetGroup({
        name: "dynamic-tg",
        port: 8080,
        createListener: false,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          Port: 8080,
        }
      );

      expect(lb.targetGroups.has("dynamic-tg")).toBe(true);
    });
  });

  describe("Tags and Outputs", () => {
    test("applies environment tags to load balancer", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "production",
        vpc,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Tags: Match.arrayWith([
            {
              Key: "Environment",
              Value: "production",
            },
            {
              Key: "ManagedBy",
              Value: "CDK",
            },
          ]),
        }
      );
    });

    test("creates CloudFormation outputs", () => {
      new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        loadBalancerName: "test-alb",
      });

      const template = Template.fromStack(stack);

      template.hasOutput("*", {
        Description: "The ARN of the load balancer",
      });

      template.hasOutput("*", {
        Description: "The DNS name of the load balancer",
      });

      template.hasOutput("*", {
        Description: "The ID of the load balancer security group",
      });
    });
  });

  describe("Public Properties", () => {
    test("exposes load balancer as public property", () => {
      const lb = new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
      });

      expect(lb.loadBalancer).toBeDefined();
      expect(lb.loadBalancer).toBeInstanceOf(elbv2.ApplicationLoadBalancer);
    });

    test("exposes security group as public property", () => {
      const lb = new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
      });

      expect(lb.securityGroup).toBeDefined();
      expect(lb.securityGroup).toBeInstanceOf(ec2.SecurityGroup);
    });

    test("exposes HTTP listener as public property", () => {
      const lb = new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
      });

      expect(lb.httpListener).toBeDefined();
      expect(lb.httpListener).toBeInstanceOf(elbv2.ApplicationListener);
    });

    test("exposes HTTPS listener when enabled", () => {
      const lb = new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        enableHttps: true,
        certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/test",
      });

      expect(lb.httpsListener).toBeDefined();
      expect(lb.httpsListener).toBeInstanceOf(elbv2.ApplicationListener);
    });

    test("HTTPS listener is undefined when disabled", () => {
      const lb = new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        enableHttps: false,
      });

      expect(lb.httpsListener).toBeUndefined();
    });

    test("exposes target groups map", () => {
      const lb = new ElasticLoadBalancer(stack, "TestLB", {
        envName: "test",
        vpc,
        targetGroups: [
          {
            name: "tg1",
            port: 3000,
            createListener: false,
          },
          {
            name: "tg2",
            port: 8080,
            createListener: false,
          },
        ],
      });

      expect(lb.targetGroups).toBeInstanceOf(Map);
      expect(lb.targetGroups.size).toBe(2);
      expect(lb.targetGroups.has("tg1")).toBe(true);
      expect(lb.targetGroups.has("tg2")).toBe(true);
    });
  });
});
