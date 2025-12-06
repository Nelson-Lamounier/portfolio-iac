/** @format */

// /** @format */

// import * as cdk from "aws-cdk-lib";
// import { Template, Match } from "aws-cdk-lib/assertions";
// import * as ec2 from "aws-cdk-lib/aws-ec2";
// import { LoadBalancerStack } from "../../lib/stacks/networking/load-balancer-stack";

// describe("LoadBalancerStack", () => {
//   let app: cdk.App;
//   let vpc: ec2.Vpc;

//   beforeEach(() => {
//     app = new cdk.App();
//     const vpcStack = new cdk.Stack(app, "VpcStack");
//     vpc = new ec2.Vpc(vpcStack, "TestVpc", {
//       maxAzs: 2,
//       natGateways: 0,
//     });
//   });

//   describe("Stack Creation", () => {
//     test("creates stack with required properties", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       const template = Template.fromStack(stack);

//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
//       template.resourceCountIs("AWS::EC2::SecurityGroup", 1);
//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 1); // HTTP only
//     });

//     test("creates stack with HTTPS enabled", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//         enableHttps: true,
//         certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/test",
//       });

//       const template = Template.fromStack(stack);

//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 2); // HTTP + HTTPS
//     });

//     test("creates stack with custom load balancer name", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//         loadBalancerName: "custom-alb",
//       });

//       const template = Template.fromStack(stack);

//       template.hasResourceProperties(
//         "AWS::ElasticLoadBalancingV2::LoadBalancer",
//         {
//           Name: "custom-alb",
//         }
//       );
//     });

//     test("creates stack with initial target groups", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//         initialTargetGroups: [
//           {
//             name: "app-tg",
//             port: 3000,
//             healthCheckPath: "/health",
//             createListener: false,
//           },
//         ],
//       });

//       const template = Template.fromStack(stack);

//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 1);
//       template.hasResourceProperties(
//         "AWS::ElasticLoadBalancingV2::TargetGroup",
//         {
//           Port: 3000,
//           HealthCheckPath: "/health",
//         }
//       );
//     });

//     test("applies custom tags to resources", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "production",
//         vpc,
//         tags: {
//           Project: "MyProject",
//           Team: "DevOps",
//         },
//       });

//       const template = Template.fromStack(stack);

//       template.hasResourceProperties(
//         "AWS::ElasticLoadBalancingV2::LoadBalancer",
//         {
//           Tags: Match.arrayWith([
//             {
//               Key: "Project",
//               Value: "MyProject",
//             },
//             {
//               Key: "Team",
//               Value: "DevOps",
//             },
//           ]),
//         }
//       );
//     });
//   });

//   describe("Stack Outputs", () => {
//     test("creates output for load balancer ARN", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       const template = Template.fromStack(stack);

//       template.hasOutput("LoadBalancerArn", {
//         Description: "The ARN of the load balancer",
//       });
//     });

//     test("creates output for load balancer DNS name", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       const template = Template.fromStack(stack);

//       template.hasOutput("LoadBalancerDnsName", {
//         Description: "The DNS name of the load balancer",
//       });
//     });

//     test("creates output for security group ID", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       const template = Template.fromStack(stack);

//       template.hasOutput("SecurityGroupId", {
//         Description: "The ID of the load balancer security group",
//       });
//     });

//     test("creates output for HTTP listener ARN", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       const template = Template.fromStack(stack);

//       template.hasOutput("HttpListenerArn", {
//         Description: "The ARN of the HTTP listener",
//       });
//     });

//     test("creates output for HTTPS listener ARN when enabled", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//         enableHttps: true,
//         certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/test",
//       });

//       const template = Template.fromStack(stack);

//       template.hasOutput("HttpsListenerArn", {
//         Description: "The ARN of the HTTPS listener",
//       });
//     });

//     test("creates outputs for target groups", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//         initialTargetGroups: [
//           {
//             name: "app-tg",
//             port: 3000,
//             createListener: false,
//           },
//         ],
//       });

//       const template = Template.fromStack(stack);

//       // Check that target group output exists (output name may vary)
//       const outputs = template.findOutputs("*");
//       const outputKeys = Object.keys(outputs);
//       const hasTargetGroupOutput = outputKeys.some((key) =>
//         key.includes("TargetGroupArn")
//       );

//       expect(hasTargetGroupOutput).toBe(true);
//     });

//     test("creates export names for outputs", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       const template = Template.fromStack(stack);

//       // Check that outputs exist
//       const outputs = template.findOutputs("*");

//       expect(Object.keys(outputs).length).toBeGreaterThan(0);
//     });
//   });

//   describe("Public Methods", () => {
//     test("addTargetGroup creates new target group", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       stack.addTargetGroup({
//         name: "new-tg",
//         port: 8080,
//         createListener: false,
//       });

//       const template = Template.fromStack(stack);

//       template.hasResourceProperties(
//         "AWS::ElasticLoadBalancingV2::TargetGroup",
//         {
//           Port: 8080,
//         }
//       );
//     });

//     test("getTargetGroup returns existing target group", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//         initialTargetGroups: [
//           {
//             name: "app-tg",
//             port: 3000,
//             createListener: false,
//           },
//         ],
//       });

//       const targetGroup = stack.getTargetGroup("app-tg");

//       expect(targetGroup).toBeDefined();
//     });

//     test("getTargetGroup returns undefined for non-existent target group", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       const targetGroup = stack.getTargetGroup("non-existent");

//       expect(targetGroup).toBeUndefined();
//     });

//     test("getAllTargetGroups returns all target groups", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//         initialTargetGroups: [
//           {
//             name: "tg1",
//             port: 3000,
//             createListener: false,
//           },
//           {
//             name: "tg2",
//             port: 8080,
//             createListener: false,
//           },
//         ],
//       });

//       const targetGroups = stack.getAllTargetGroups();

//       expect(targetGroups.size).toBe(2);
//       expect(targetGroups.has("tg1")).toBe(true);
//       expect(targetGroups.has("tg2")).toBe(true);
//     });

//     test("getLoadBalancer returns load balancer instance", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       const loadBalancer = stack.getLoadBalancer();

//       expect(loadBalancer).toBeDefined();
//     });

//     test("getSecurityGroup returns security group instance", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       const securityGroup = stack.getSecurityGroup();

//       expect(securityGroup).toBeDefined();
//     });
//   });

//   describe("Public Properties", () => {
//     test("exposes loadBalancer property", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       expect(stack.loadBalancer).toBeDefined();
//     });

//     test("exposes targetGroups property", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       expect(stack.targetGroups).toBeDefined();
//       expect(stack.targetGroups).toBeInstanceOf(Map);
//     });

//     test("exposes httpListener property", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//       });

//       expect(stack.httpListener).toBeDefined();
//     });

//     test("exposes httpsListener property when HTTPS enabled", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//         enableHttps: true,
//         certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/test",
//       });

//       expect(stack.httpsListener).toBeDefined();
//     });

//     test("httpsListener is undefined when HTTPS disabled", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//         enableHttps: false,
//       });

//       expect(stack.httpsListener).toBeUndefined();
//     });
//   });

//   describe("Integration Scenarios", () => {
//     test("creates complete HTTP-only setup", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "development",
//         vpc,
//         loadBalancerName: "dev-alb",
//         enableHttps: false,
//         initialTargetGroups: [
//           {
//             name: "app",
//             port: 3000,
//             healthCheckPath: "/",
//             createListener: true,
//             listenerPriority: 100,
//             pathPattern: "/*",
//           },
//         ],
//       });

//       const template = Template.fromStack(stack);

//       // Verify all components
//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 1);
//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 1);
//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::ListenerRule", 1);
//       template.resourceCountIs("AWS::EC2::SecurityGroup", 1);
//     });

//     test("creates complete HTTPS setup with redirect", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "production",
//         vpc,
//         loadBalancerName: "prod-alb",
//         enableHttps: true,
//         certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/prod",
//         initialTargetGroups: [
//           {
//             name: "app",
//             port: 3000,
//             healthCheckPath: "/api/health",
//             createListener: true,
//             listenerPriority: 100,
//             pathPattern: "/*",
//           },
//         ],
//       });

//       const template = Template.fromStack(stack);

//       // Verify all components
//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 2); // HTTP + HTTPS
//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 1);
//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::ListenerRule", 1);

//       // Verify HTTP redirects to HTTPS
//       template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
//         Port: 80,
//         DefaultActions: [
//           {
//             Type: "redirect",
//             RedirectConfig: {
//               Port: "443",
//               Protocol: "HTTPS",
//               StatusCode: "HTTP_301",
//             },
//           },
//         ],
//       });
//     });

//     test("creates multi-target-group setup", () => {
//       const stack = new LoadBalancerStack(app, "TestLBStack", {
//         envName: "test",
//         vpc,
//         initialTargetGroups: [
//           {
//             name: "api",
//             port: 3000,
//             createListener: true,
//             listenerPriority: 100,
//             pathPattern: "/api/*",
//           },
//           {
//             name: "web",
//             port: 8080,
//             createListener: true,
//             listenerPriority: 200,
//             pathPattern: "/*",
//           },
//         ],
//       });

//       const template = Template.fromStack(stack);

//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 2);
//       template.resourceCountIs("AWS::ElasticLoadBalancingV2::ListenerRule", 2);

//       // Verify priorities
//       template.hasResourceProperties(
//         "AWS::ElasticLoadBalancingV2::ListenerRule",
//         {
//           Priority: 100,
//         }
//       );
//       template.hasResourceProperties(
//         "AWS::ElasticLoadBalancingV2::ListenerRule",
//         {
//           Priority: 200,
//         }
//       );
//     });
//   });
// });
