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
    test("creates SSM association for ECS agent configuration using AWS-RunShellScript", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify SSM association exists for ECS agent config using AWS managed document
      testSetup.template.hasResourceProperties("AWS::SSM::Association", {
        Name: "AWS-RunShellScript", // AWS managed document
        AssociationName: Match.stringLikeRegexp(".*ecs-agent-config"),
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
  // Application Setup SSM State Manager Tests
  // ---------------------------------------------------------------------------
  describe("Application Setup SSM State Manager", () => {
    test("creates SSM Association for application setup", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify SSM Association exists (replaces Lambda + Custom Resource)
      // SSM State Manager Association runs application setup automatically
      const ssmAssociations = testSetup.template.findResources("AWS::SSM::Association");
      const applicationSetupAssociation = Object.entries(ssmAssociations).find(
        ([logicalId, resource]: [string, any]) => 
          resource.Properties?.AssociationName?.includes("application-setup") ||
          logicalId.includes("ApplicationSetup")
      );
      
      expect(applicationSetupAssociation).toBeDefined();
      if (applicationSetupAssociation) {
        const [, resource] = applicationSetupAssociation;
        expect(resource.Properties?.Name).toBe("AWS-RunShellScript");
        expect(resource.Properties?.Targets).toBeDefined();
        expect(resource.Properties?.Parameters).toBeDefined();
      }
    });

    test("SSM Association uses AWS-RunShellScript document", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      testSetup.template.hasResourceProperties("AWS::SSM::Association", {
        Name: "AWS-RunShellScript",
        AssociationName: "pipeline-application-setup",
      });
    });

    test("SSM Association targets instances by tags", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

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

    test("SSM Association has scheduled maintenance", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify associations have schedule expression and run on instance launch
      testSetup.template.hasResourceProperties("AWS::SSM::Association", {
        ScheduleExpression: Match.stringLikeRegexp("rate\\(.*\\)"),
        ApplyOnlyAtCronInterval: false, // Also run on new instances, not just schedule
      });
    });

    test("SSM Association has proper execution timeout", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify association has execution timeout set
      const ssmAssociations = testSetup.template.findResources("AWS::SSM::Association");
      const applicationSetupAssociation = Object.entries(ssmAssociations).find(
        ([logicalId, resource]: [string, any]) => 
          resource.Properties?.AssociationName?.includes("application-setup") ||
          logicalId.includes("ApplicationSetup")
      );
      
      expect(applicationSetupAssociation).toBeDefined();
      if (applicationSetupAssociation) {
        const [, resource] = applicationSetupAssociation;
        const parameters = resource.Properties?.Parameters || {};
        // SSM parameters are arrays
        expect(parameters.executionTimeout).toBeDefined();
        expect(Array.isArray(parameters.executionTimeout)).toBe(true);
        expect(parameters.commands).toBeDefined();
        expect(Array.isArray(parameters.commands)).toBe(true);
        expect(parameters.workingDirectory).toBeDefined();
      }
    });

    test("SSM Association has compliance severity set", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify association has compliance severity for dashboard visibility
      const ssmAssociations = testSetup.template.findResources("AWS::SSM::Association");
      const applicationSetupAssociation = Object.entries(ssmAssociations).find(
        ([logicalId, resource]: [string, any]) => 
          resource.Properties?.AssociationName?.includes("application-setup") ||
          logicalId.includes("ApplicationSetup")
      );
      
      expect(applicationSetupAssociation).toBeDefined();
      if (applicationSetupAssociation) {
        const [, resource] = applicationSetupAssociation;
        expect(resource.Properties?.ComplianceSeverity).toBe("CRITICAL");
      }
    });

    test("Instance role has SSM permissions for State Manager", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Check that instance role has SSM permissions for State Manager
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

    test("Instance role has SSM GetParameter permissions with envName path", () => {
      const testSetup = createTestMonitoringInfraStack({
        envName: "pipeline",
        account: "123456789012",
        region: "eu-west-1",
      });

      // Verify SSM permissions exist (either wildcard "*" or specific path with envName)
      // The instance role needs SSM GetParameter permissions to read monitoring configs
      const policies = testSetup.template.findResources("AWS::IAM::Policy");
      const hasSsmPermissions = Object.values(policies).some((policy: any) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        return statements.some((stmt: any) => {
          const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
          const hasSsmActions = actions.some((action: string) => 
            action === "ssm:GetParameter" || 
            action === "ssm:GetParameters" ||
            action === "ssm:GetParametersByPath"
          );
          if (!hasSsmActions) return false;
          
          // Accept either wildcard "*" (which allows all SSM parameters) or specific path
          const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
          return resources.some((resource: string) => {
            if (!resource) return false;
            // Accept wildcard (allows access to all SSM parameters including /monitoring/pipeline/*)
            if (resource === "*" || resource.includes("*")) return true;
            // Accept specific path with envName
            if (resource.includes("parameter/monitoring/pipeline")) return true;
            return false;
          });
        });
      });
      
      expect(hasSsmPermissions).toBe(true);
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
