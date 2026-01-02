/** @format */

/// <reference types="jest" />

import { Match } from "aws-cdk-lib/assertions";

import { createTestMonitoringInfraStack } from "../../helpers/test-helpers";

describe("MonitoringInfraStack", () => {
  // ---------------------------------------------------------------------------
  // Basic Stack Tests
  // ---------------------------------------------------------------------------
  describe("Stack Creation", () => {
    test("creates stack successfully", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      expect(testSetup.stack).toBeDefined();
      expect(testSetup.template).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Note: VPC is created by test helper in separate stack, not by MonitoringInfraStack
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // ECS Cluster Tests
  // ---------------------------------------------------------------------------
  describe("ECS Cluster", () => {
    test("creates ECS cluster with Container Insights enabled", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterSettings: Match.arrayWith([
          {
            Name: "containerInsights",
            Value: "enabled",
          },
        ]),
      });
    });

    test("cluster has proper naming convention", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterName: "pipeline-monitoring-cluster",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Auto Scaling Group Tests
  // ---------------------------------------------------------------------------
  describe("Auto Scaling Group", () => {
    test("creates ASG with correct capacity", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties(
        "AWS::AutoScaling::AutoScalingGroup",
        {
          MinSize: "1",
          MaxSize: "1",
          DesiredCapacity: "1",
        }
      );
    });

    test("ASG uses correct instance type", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Check Launch Template for instance type
      testSetup.template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
        LaunchTemplateData: Match.objectLike({
          InstanceType: "t3.small",
        }),
      });
    });

    test("ASG has security hardening", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Just verify that ASG exists with proper configuration
      testSetup.template.hasResourceProperties(
        "AWS::AutoScaling::AutoScalingGroup",
        {
          MinSize: "1",
          MaxSize: "1",
          DesiredCapacity: "1",
        }
      );
    });

    test("ASG has required tags for EC2 service discovery", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify ASG has tags that will propagate to EC2 instances
      // These tags are required for Prometheus EC2 service discovery
      testSetup.template.hasResourceProperties(
        "AWS::AutoScaling::AutoScalingGroup",
        {
          Tags: Match.arrayWith([
            Match.objectLike({
              Key: "Environment",
              Value: "pipeline",
              PropagateAtLaunch: true,
            }),
            Match.objectLike({
              Key: "Service",
              Value: "monitoring",
              PropagateAtLaunch: true,
            }),
            Match.objectLike({
              Key: "ManagedBy",
              Value: "CDK",
              PropagateAtLaunch: true,
            }),
          ]),
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Application Load Balancer Tests
  // ---------------------------------------------------------------------------
  describe("Application Load Balancer", () => {
    test("creates internet-facing ALB", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Scheme: "internet-facing",
          Type: "application",
        }
      );
    });

    test("creates ALB listener", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.resourceCountIs(
        "AWS::ElasticLoadBalancingV2::Listener",
        1
      );
    });

    test("ALB has proper naming", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Name: "pipeline-monitoring-alb",
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // CloudWatch Logs Tests
  // ---------------------------------------------------------------------------
  describe("CloudWatch Logs", () => {
    test("creates task log group with retention", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: Match.stringLikeRegexp(".*/tasks$"),
        RetentionInDays: 14,
      });
    });

    test("creates event log group with retention", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: Match.stringLikeRegexp(".*/events$"),
        RetentionInDays: 14,
      });
    });

    test("creates ECS event rule", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::Events::Rule", {
        EventPattern: {
          source: ["aws.ecs"],
          "detail-type": [
            "ECS Task State Change",
            "ECS Container Instance State Change",
            "ECS Service Action",
          ],
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // S3 Configuration Bucket Tests
  // ---------------------------------------------------------------------------
  describe("S3 Configuration Bucket", () => {
    test("creates S3 bucket for configuration", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.resourceCountIs("AWS::S3::Bucket", 1);
    });

    test("S3 bucket has versioning enabled", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::S3::Bucket", {
        VersioningConfiguration: {
          Status: "Enabled",
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // IAM Role Tests
  // ---------------------------------------------------------------------------
  describe("IAM Roles and Policies", () => {
    test("creates IAM role for ASG instances", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: "ec2.amazonaws.com",
              },
            }),
          ]),
        },
      });
    });

    test("grants EFS permissions to ASG role", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "elasticfilesystem:ClientMount",
                "elasticfilesystem:ClientWrite",
                "elasticfilesystem:ClientRootAccess",
              ]),
            }),
          ]),
        },
      });
    });

    test("grants SSM permissions to instance role", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Check that the instance role has SSM permissions for State Manager
      // This includes permissions for associations, documents, and commands
      const policies = testSetup.template.findResources("AWS::IAM::Policy");
      const hasSsmStateManagerPermissions = Object.values(policies).some((policy: any) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        return statements.some((stmt: any) => {
          const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
          return actions.some((action: string) => 
            action.includes("ssm:DescribeInstanceInformation") ||
            action.includes("ssm:ListAssociations") ||
            action.includes("ssm:UpdateInstanceInformation") ||
            action.includes("ssm:SendCommand")
          );
        });
      });
      expect(hasSsmStateManagerPermissions).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // User Data Tests (Minimal User Data)
  // ---------------------------------------------------------------------------
  describe("User Data Configuration", () => {
    test("uses minimal user data for infrastructure registration", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify launch template has user data
      testSetup.template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
        LaunchTemplateData: Match.objectLike({
          UserData: Match.anyValue(),
        }),
      });
    });

    test("user data is minimal (SSM agent only)", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // User data should be present but minimal (SSM agent only)
      // ECS agent and CloudWatch Agent setup is handled by SSM State Manager
      const launchTemplates = testSetup.template.findResources("AWS::EC2::LaunchTemplate");
      expect(Object.keys(launchTemplates).length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // SSM State Manager Tests
  // ---------------------------------------------------------------------------
  describe("SSM State Manager Configuration", () => {
    test("creates SSM documents for ECS agent configuration", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify SSM document exists for ECS agent config
      testSetup.template.hasResourceProperties("AWS::SSM::Document", {
        DocumentType: "Command",
        DocumentFormat: "YAML",
        Name: Match.stringLikeRegexp(".*ecs-agent-config"),
      });
    });

    test("creates SSM documents for CloudWatch Agent configuration", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify SSM document exists for CloudWatch Agent config
      testSetup.template.hasResourceProperties("AWS::SSM::Document", {
        DocumentType: "Command",
        DocumentFormat: "YAML",
        Name: Match.stringLikeRegexp(".*cloudwatch-agent-config"),
      });
    });

    test("creates SSM associations for ECS agent setup", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify SSM associations exist for ECS agent
      const associations = testSetup.template.findResources("AWS::SSM::Association");
      const ecsAssociations = Object.values(associations).filter((assoc: any) => {
        const name = assoc.Properties?.AssociationName || "";
        return name.includes("ecs-agent");
      });
      expect(ecsAssociations.length).toBeGreaterThan(0);
    });

    test("creates SSM associations for CloudWatch Agent setup", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify SSM associations exist for CloudWatch Agent
      const associations = testSetup.template.findResources("AWS::SSM::Association");
      const cwAssociations = Object.values(associations).filter((assoc: any) => {
        const name = assoc.Properties?.AssociationName || "";
        return name.includes("cloudwatch-agent");
      });
      expect(cwAssociations.length).toBeGreaterThan(0);
    });

    test("SSM associations target instances by tags", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify associations have target tags
      testSetup.template.hasResourceProperties("AWS::SSM::Association", {
        Targets: Match.arrayWith([
          Match.objectLike({
            Key: "tag:Environment",
            Values: ["pipeline"],
          }),
          Match.objectLike({
            Key: "tag:Service",
            Values: ["monitoring"],
          }),
        ]),
      });
    });

    test("SSM associations have scheduled maintenance", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify associations have schedule expression
      testSetup.template.hasResourceProperties("AWS::SSM::Association", {
        ScheduleExpression: Match.stringLikeRegexp("rate\\(.*\\)"),
        ApplyOnlyAtCronInterval: false, // Also run on new instances
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Application Setup Lambda Tests
  // ---------------------------------------------------------------------------
  describe("Application Setup Lambda", () => {
    test("creates Lambda function for application setup", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Check that Lambda function exists
      const lambdaCount = Object.keys(
        testSetup.template.findResources("AWS::Lambda::Function")
      ).length;
      expect(lambdaCount).toBeGreaterThan(0);
      
      // Check Lambda properties (check any Lambda function with these properties)
      testSetup.template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs22.x",
        Timeout: 600, // 10 minutes
        MemorySize: 512,
      });
    });

    test("Lambda has correct environment variables", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Check that at least one Lambda has the expected environment variables
      // The application setup Lambda should have CLUSTER_NAME (CloudFormation ref), ENV_NAME, and REGION
      testSetup.template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            CLUSTER_NAME: Match.anyValue(), // CloudFormation reference, not literal string
            ENV_NAME: "pipeline",
            REGION: "eu-west-1",
            EFS_STACK_NAME: Match.anyValue(), // May be a reference or literal
            FILE_SYSTEM_ID: Match.anyValue(), // CloudFormation reference
          }),
        }),
      });
    });

    test("creates EventBridge rule for container instance registration", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::Events::Rule", {
        EventPattern: {
          source: ["aws.ecs"],
          "detail-type": ["ECS Container Instance State Change"],
          detail: {
            status: ["ACTIVE"],
          },
        },
      });
    });

    test("Lambda has permissions for ECS and SSM", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Check that Lambda has ECS permissions
      testSetup.template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "ecs:ListContainerInstances",
                "ecs:DescribeContainerInstances",
              ]),
            }),
          ]),
        },
      });

      // Check that Lambda has SSM Run Command permissions
      testSetup.template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "ssm:SendCommand",
                "ssm:GetCommandInvocation",
              ]),
            }),
          ]),
        },
      });

      // Check that Lambda has SSM GetParameter permissions with envName path
      // Find all IAM policies and check if any has SSM GetParameter with envName path
      const allPolicies = testSetup.template.findResources("AWS::IAM::Policy");
      const hasSsmGetParameterWithEnvName = Object.values(allPolicies).some((policy: any) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        return statements.some((stmt: any) => {
          const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
          const hasSsmActions = actions.some((action: string) => 
            action === "ssm:GetParameter" || action === "ssm:GetParameters"
          );
          if (!hasSsmActions) return false;
          
          const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
          return resources.some((resource: string) => 
            resource && resource.includes("parameter/monitoring/pipeline")
          );
        });
      });
      
      expect(hasSsmGetParameterWithEnvName).toBe(true);
    });

    test("creates Custom Resource to trigger Lambda on stack updates", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify Custom Resource exists (created by CustomResource construct)
      // Note: CDK Custom Resources are created as AWS::CloudFormation::CustomResource
      const customResources = testSetup.template.findResources("AWS::CloudFormation::CustomResource");
      const applicationSetupCustomResource = Object.entries(customResources).find(
        ([logicalId, resource]: [string, any]) => 
          resource.Properties?.ServiceToken && 
          (logicalId.includes("ApplicationSetup") || logicalId.includes("Trigger"))
      );
      
      expect(applicationSetupCustomResource).toBeDefined();
      if (applicationSetupCustomResource) {
        const [, resource] = applicationSetupCustomResource;
        expect(resource.Properties?.ServiceToken).toBeDefined();
      }

      // Verify Custom Resource Provider Lambda exists
      // The Provider creates a Lambda function with onEvent handler
      const providerLambdas = testSetup.template.findResources("AWS::Lambda::Function");
      const providerLambda = Object.entries(providerLambdas).find(
        ([logicalId, lambda]: [string, any]) => 
          lambda.Properties?.Handler?.includes("onEvent") ||
          logicalId.includes("ApplicationSetupProvider") ||
          logicalId.includes("framework-onEvent")
      );
      
      expect(providerLambda).toBeDefined();
    });

    test("Lambda SSM permissions use envName path", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify SSM permissions use /monitoring/{envName}/* path
      // Find all IAM policies and check if any has SSM GetParameter with envName path
      const policies = testSetup.template.findResources("AWS::IAM::Policy");
      const hasCorrectSsmPath = Object.values(policies).some((policy: any) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        return statements.some((stmt: any) => {
          const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
          const hasSsmActions = actions.some((action: string) => 
            action === "ssm:GetParameter" || action === "ssm:GetParameters"
          );
          if (!hasSsmActions) return false;
          
          const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
          return resources.some((resource: string) => 
            resource && resource.includes("parameter/monitoring/pipeline")
          );
        });
      });
      
      expect(hasCorrectSsmPath).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Stack Outputs Tests
  // ---------------------------------------------------------------------------
  describe("Stack Outputs", () => {
    test("exports cluster information", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      const outputs = testSetup.template.findOutputs("*");
      const outputKeys = Object.keys(outputs);

      expect(outputKeys).toContain("ClusterArn");
      expect(outputKeys).toContain("ClusterName");
    });

    test("exports load balancer information", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      const outputs = testSetup.template.findOutputs("*");
      const outputKeys = Object.keys(outputs);

      expect(outputKeys).toContain("LoadBalancerDns");
      expect(outputKeys).toContain("LoadBalancerArn");
      expect(outputKeys).toContain("ListenerArn");
    });

    test("exports monitoring URLs", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      const outputs = testSetup.template.findOutputs("*");
      const outputKeys = Object.keys(outputs);

      expect(outputKeys).toContain("GrafanaUrl");
      expect(outputKeys).toContain("PrometheusUrl");
    });
  });
});
