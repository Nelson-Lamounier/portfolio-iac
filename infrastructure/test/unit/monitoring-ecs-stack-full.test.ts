/** @format */

import { App, Stack } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Template, Match, Capture } from "aws-cdk-lib/assertions";
import { MonitoringEcsStack } from "../../lib/stacks/monitoring/monitoring-ecs-stack";

describe("MonitoringEcsStack Test Suite", () => {
  let template: Template;
  let app: App;
  let vpc: ec2.IVpc;

  beforeAll(() => {
    app = new App();

    // Create VPC for testing
    const vpcStack = new Stack(app, "TestVpcStack", {
      env: { account: "123456789012", region: "eu-west-1" },
    });
    vpc = new ec2.Vpc(vpcStack, "TestVpc", {
      maxAzs: 2,
      natGateways: 0,
    });

    // Create MonitoringEcsStack
    const stack = new MonitoringEcsStack(app, "TestMonitoringEcsStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
      envName: "test",
      vpc,
      albDnsName: "test-alb-123456.eu-west-1.elb.amazonaws.com",
    });

    template = Template.fromStack(stack);
  });

  describe("ECS Cluster", () => {
    test("creates ECS cluster with correct name", () => {
      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterName: "test-monitoring-cluster",
      });
    });

    test("cluster has Container Insights enabled", () => {
      const clusterSettingsCapture = new Capture();
      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterSettings: clusterSettingsCapture,
      });

      const settings = clusterSettingsCapture.asArray();
      expect(settings).toContainEqual({
        Name: "containerInsights",
        Value: "enabled",
      });
    });

    test("cluster has correct tags", () => {
      const tagsCapture = new Capture();
      template.hasResourceProperties("AWS::ECS::Cluster", {
        Tags: tagsCapture,
      });

      const tags = tagsCapture.asArray();
      expect(tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: "Environment",
            Value: "test",
          }),
          expect.objectContaining({
            Key: "Purpose",
            Value: "Monitoring",
          }),
        ])
      );
    });

    test("uses t3.small instance", () => {
      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        InstanceType: "t3.small",
      });
    });

    test("has single instance capacity", () => {
      template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
        MinSize: "1",
        MaxSize: "1",
        DesiredCapacity: "1",
      });
    });

    test("creates exactly one ECS cluster", () => {
      template.resourceCountIs("AWS::ECS::Cluster", 1);
    });
  });

  describe("EBS Volume Configuration", () => {
    test("configures EBS volume with encryption", () => {
      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        BlockDeviceMappings: [
          {
            DeviceName: "/dev/xvda",
            Ebs: {
              VolumeSize: 30,
              VolumeType: "gp3",
              Encrypted: true,
              DeleteOnTermination: true,
            },
          },
        ],
      });
    });

    test("EBS volume has correct size for monitoring data", () => {
      const blockDevicesCapture = new Capture();
      template.hasResourceProperties("AWS::AutoScaling::LaunchConfiguration", {
        BlockDeviceMappings: blockDevicesCapture,
      });

      const devices = blockDevicesCapture.asArray();
      expect(devices[0].Ebs.VolumeSize).toBe(30);
    });
  });

  describe("ECS Services", () => {
    test("creates three ECS services", () => {
      template.resourceCountIs("AWS::ECS::Service", 3);
    });

    test("creates Prometheus service", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "test-prometheus",
        DesiredCount: 1,
        EnableExecuteCommand: true,
      });
    });

    test("creates Grafana service", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "test-grafana",
        DesiredCount: 1,
        EnableExecuteCommand: true,
      });
    });

    test("creates Node Exporter service with monitoring suffix", () => {
      template.hasResourceProperties("AWS::ECS::Service", {
        ServiceName: "test-monitoring-node-exporter",
        DesiredCount: 1,
        EnableExecuteCommand: true,
      });
    });

    test("all services use EC2 launch type", () => {
      const services = template.findResources("AWS::ECS::Service");
      Object.values(services).forEach((service: any) => {
        expect(service.Properties.LaunchType).toBe("EC2");
      });
    });
  });

  describe("Application Load Balancer", () => {
    test("creates internet-facing ALB", () => {
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Name: "test-monitoring-alb",
          Scheme: "internet-facing",
          Type: "application",
        }
      );
    });

    test("ALB has correct tags", () => {
      const tagsCapture = new Capture();
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Tags: tagsCapture,
        }
      );

      const tags = tagsCapture.asArray();
      expect(tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: "Environment",
            Value: "test",
          }),
          expect.objectContaining({
            Key: "Purpose",
            Value: "Monitoring",
          }),
        ])
      );
    });

    test("creates target groups for services", () => {
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 2);
    });

    test("creates Grafana target group", () => {
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          Port: 3000,
          Protocol: "HTTP",
          TargetType: "instance",
          HealthCheckPath: "/grafana/api/health",
        }
      );
    });

    test("creates Prometheus target group", () => {
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::TargetGroup",
        {
          Port: 9090,
          Protocol: "HTTP",
          TargetType: "instance",
          HealthCheckPath: "/prometheus/-/healthy",
        }
      );
    });
  });

  describe("ALB Listener and Rules", () => {
    test("creates HTTP listener on port 80", () => {
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Port: 80,
        Protocol: "HTTP",
      });
    });

    test("creates listener rules for routing", () => {
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::ListenerRule", 2);
    });

    test("creates Grafana routing rule", () => {
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::ListenerRule",
        {
          Priority: 100,
          Conditions: [
            {
              Field: "path-pattern",
              PathPatternConfig: {
                Values: ["/grafana*"],
              },
            },
          ],
        }
      );
    });

    test("creates Prometheus routing rule", () => {
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::ListenerRule",
        {
          Priority: 200,
          Conditions: [
            {
              Field: "path-pattern",
              PathPatternConfig: {
                Values: ["/prometheus*"],
              },
            },
          ],
        }
      );
    });
  });

  describe("CloudWatch Log Groups", () => {
    test("creates log group for monitoring task logs", () => {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/TestMonitoringEcsStack/tasks",
        RetentionInDays: 14,
      });
    });

    test("creates log group for monitoring ECS events", () => {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/TestMonitoringEcsStack/events",
        RetentionInDays: 14,
      });
    });

    test("creates log group for Prometheus", () => {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/test-prometheus",
        RetentionInDays: 7,
      });
    });

    test("creates log group for Grafana", () => {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/test-grafana",
        RetentionInDays: 7,
      });
    });

    test("creates log group for Node Exporter with monitoring suffix", () => {
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/ecs/test-monitoring-node-exporter",
        RetentionInDays: 7,
      });
    });
  });

  describe("EventBridge Rule", () => {
    test("creates EventBridge rule for monitoring cluster events", () => {
      template.hasResourceProperties("AWS::Events::Rule", {
        Description: Match.stringLikeRegexp(
          "Capture ECS events for.*monitoring cluster"
        ),
        EventPattern: Match.objectLike({
          source: ["aws.ecs"],
          "detail-type": [
            "ECS Task State Change",
            "ECS Container Instance State Change",
            "ECS Service Action",
          ],
        }),
      });
    });

    test("EventBridge rule targets CloudWatch Logs", () => {
      const targetsCapture = new Capture();
      template.hasResourceProperties("AWS::Events::Rule", {
        Targets: targetsCapture,
      });

      const targets = targetsCapture.asArray();
      expect(targets.length).toBeGreaterThan(0);
    });
  });

  describe("Security Groups", () => {
    test("creates security group for monitoring ALB", () => {
      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        GroupDescription: "Security group for monitoring ALB",
      });
    });

    test("ALB security group allows HTTP traffic", () => {
      template.hasResourceProperties("AWS::EC2::SecurityGroup", {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            IpProtocol: "tcp",
            FromPort: 80,
            ToPort: 80,
            CidrIp: "0.0.0.0/0",
          }),
        ]),
      });
    });

    test("instance security group has egress rules", () => {
      // Find the instance security group (not ALB SG)
      const securityGroups = template.findResources("AWS::EC2::SecurityGroup");
      const instanceSG = Object.values(securityGroups).find((sg: any) => {
        const desc = sg.Properties?.GroupDescription || "";
        return desc.includes("Instance") || desc.includes("Capacity");
      });

      expect(instanceSG).toBeDefined();
      const egress = instanceSG?.Properties?.SecurityGroupEgress || [];

      // Should have at least one egress rule
      expect(egress.length).toBeGreaterThan(0);
    });
  });

  describe("IAM Roles", () => {
    test("creates execution roles for monitoring services", () => {
      const roles = template.findResources("AWS::IAM::Role");
      const executionRoles = Object.values(roles).filter((role: any) => {
        return role.Properties.AssumeRolePolicyDocument.Statement.some(
          (stmt: any) => stmt.Principal?.Service === "ecs-tasks.amazonaws.com"
        );
      });

      expect(executionRoles.length).toBeGreaterThan(0);
    });

    test("Grafana has CloudWatch read permissions", () => {
      // Find Grafana task role policy
      const policies = template.findResources("AWS::IAM::Policy");
      const grafanaPolicy = Object.values(policies).find((policy: any) => {
        const policyName = policy.Properties?.PolicyName || "";
        return (
          policyName.includes("Grafana") && policyName.includes("TaskRole")
        );
      });

      expect(grafanaPolicy).toBeDefined();
      const statements =
        grafanaPolicy?.Properties?.PolicyDocument?.Statement || [];
      const hasCloudWatchPermissions = statements.some((stmt: any) => {
        const actions = stmt.Action || [];
        return (
          actions.includes("cloudwatch:DescribeAlarms") ||
          actions.includes("cloudwatch:GetMetricData")
        );
      });

      expect(hasCloudWatchPermissions).toBe(true);
    });

    test("Prometheus has EC2 describe permissions for service discovery", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                "ec2:DescribeInstances",
                "ec2:DescribeTags",
              ]),
              Effect: "Allow",
            }),
          ]),
        }),
      });
    });
  });

  describe("Stack Outputs", () => {
    test("exports Grafana URL", () => {
      template.hasOutput("GrafanaUrl", {
        Description: "Grafana Dashboard URL (default: admin/admin)",
      });
    });

    test("exports Prometheus URL", () => {
      template.hasOutput("PrometheusUrl", {
        Description: "Prometheus URL",
      });
    });

    test("exports monitoring ALB DNS", () => {
      template.hasOutput("MonitoringAlbDns", {
        Description: "Monitoring ALB DNS name",
      });
    });

    test("exports cluster name", () => {
      template.hasOutput("ClusterName", {
        Description: "ECS Cluster name for monitoring",
      });
    });

    test("exports task log group name", () => {
      template.hasOutput("MonitoringTaskLogGroupName", {
        Description: "CloudWatch Log Group for Monitoring Task Logs",
      });
    });

    test("exports event log group name", () => {
      template.hasOutput("MonitoringEventLogGroupName", {
        Description: "CloudWatch Log Group for Monitoring ECS Events",
      });
    });
  });

  describe("Resource Counts", () => {
    test("has correct total resource count", () => {
      const templateJson = template.toJSON();
      const resourceCount = Object.keys(templateJson.Resources || {}).length;

      // Should have cluster, services, ALB, target groups, listeners, etc.
      expect(resourceCount).toBeGreaterThan(30);
    });
  });

  describe("Snapshots", () => {
    test("MonitoringEcsStack matches snapshot", () => {
      expect(template.toJSON()).toMatchSnapshot();
    });

    test("ECS Cluster matches snapshot", () => {
      const cluster = template.findResources("AWS::ECS::Cluster");
      expect(cluster).toMatchSnapshot();
    });

    test("ECS Services match snapshot", () => {
      const services = template.findResources("AWS::ECS::Service");
      expect(services).toMatchSnapshot();
    });

    test("ALB matches snapshot", () => {
      const alb = template.findResources(
        "AWS::ElasticLoadBalancingV2::LoadBalancer"
      );
      expect(alb).toMatchSnapshot();
    });

    test("Target Groups match snapshot", () => {
      const targetGroups = template.findResources(
        "AWS::ElasticLoadBalancingV2::TargetGroup"
      );
      expect(targetGroups).toMatchSnapshot();
    });

    test("Log Groups match snapshot", () => {
      const logGroups = template.findResources("AWS::Logs::LogGroup");
      expect(logGroups).toMatchSnapshot();
    });
  });
});
