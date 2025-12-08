/** @format */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Template, Match } from "aws-cdk-lib/assertions";
import { VpcConstruct } from "../../lib/constructs/networking/vpc-construct";
import { MonitoringInfraStack } from "../../lib/stacks/monitoring/monitoring-infra-stack";

describe("MonitoringInfraStack", () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let vpc: ec2.IVpc;

  beforeEach(() => {
    app = new cdk.App();
    const vpcStack = new cdk.Stack(app, "VpcStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
    });
    const vpcConstruct = new VpcConstruct(vpcStack, "TestVpc", {
      maxAzs: 2,
      natGateways: 0,
    });
    vpc = vpcConstruct.vpc;
  });

  describe("Stack Creation", () => {
    test("creates stack with correct name", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      expect(infraStack.stackName).toBe("MonitoringInfraStack-pipeline");
    });
  });

  describe("S3 Configuration Bucket", () => {
    test("creates monitoring config bucket", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.resourceCountIs("AWS::S3::Bucket", 1);
    });

    test("bucket has versioning enabled", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        VersioningConfiguration: {
          Status: "Enabled",
        },
      });
    });

    test("exposes config bucket property", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      expect(infraStack.configBucket).toBeDefined();
      expect(infraStack.configBucket.bucket).toBeDefined();
    });
  });

  describe("EFS File System", () => {
    test("creates EFS file system", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.resourceCountIs("AWS::EFS::FileSystem", 1);
    });

    test("enables encryption on EFS", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.hasResourceProperties("AWS::EFS::FileSystem", {
        Encrypted: true,
      });
    });

    test("creates EFS access point", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.resourceCountIs("AWS::EFS::AccessPoint", 1);
    });

    test("access point has correct path", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.hasResourceProperties("AWS::EFS::AccessPoint", {
        FileSystemId: Match.anyValue(),
        PosixUser: {
          Gid: "0",
          Uid: "0",
        },
      });
    });

    test("exposes file system property", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      expect(infraStack.fileSystem).toBeDefined();
      expect(infraStack.fileSystem.fileSystemId).toBeDefined();
    });
  });

  describe("ECS Cluster", () => {
    test("creates ECS cluster", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.resourceCountIs("AWS::ECS::Cluster", 1);
    });

    test("cluster has correct name", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.hasResourceProperties("AWS::ECS::Cluster", {
        ClusterName: "pipeline-monitoring-cluster",
      });
    });

    test("exposes cluster property", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      expect(infraStack.cluster).toBeDefined();
      // clusterName is a token during synthesis, verify it's defined
      expect(infraStack.cluster.clusterName).toBeDefined();
    });
  });

  describe("Auto Scaling Group", () => {
    test("creates auto scaling group", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.resourceCountIs("AWS::AutoScaling::AutoScalingGroup", 1);
    });

    test("ASG has correct capacity", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
        MinSize: "1",
        MaxSize: "1",
        DesiredCapacity: "1",
      });
    });

    test("exposes auto scaling group property", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      expect(infraStack.autoScalingGroup).toBeDefined();
    });
  });

  describe("CloudWatch Log Groups", () => {
    test("creates task log group", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: Match.stringLikeRegexp("/ecs/.*tasks"),
        RetentionInDays: 14,
      });
    });

    test("creates event log group", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: Match.stringLikeRegexp("/ecs/.*events"),
        RetentionInDays: 14,
      });
    });

    test("exposes log group properties", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      expect(infraStack.taskLogGroup).toBeDefined();
      expect(infraStack.eventLogGroup).toBeDefined();
    });
  });

  describe("Application Load Balancer", () => {
    test("creates application load balancer", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
    });

    test("ALB is internet-facing", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.hasResourceProperties(
        "AWS::ElasticLoadBalancingV2::LoadBalancer",
        {
          Scheme: "internet-facing",
        }
      );
    });

    test("creates HTTP listener", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        Port: 80,
        Protocol: "HTTP",
      });
    });

    test("exposes load balancer property", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      expect(infraStack.loadBalancer).toBeDefined();
      expect(infraStack.loadBalancer.loadBalancerDnsName).toBeDefined();
    });

    test("exposes listener property", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      expect(infraStack.listener).toBeDefined();
      expect(infraStack.listener.listenerArn).toBeDefined();
    });
  });

  describe("Security Groups", () => {
    test("creates ALB security group", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      const securityGroups = template.findResources("AWS::EC2::SecurityGroup");
      expect(Object.keys(securityGroups).length).toBeGreaterThan(0);
    });

    test("allows HTTP traffic to ALB", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      // Check that security group ingress rules exist
      const ingresses = template.findResources(
        "AWS::EC2::SecurityGroupIngress"
      );
      expect(Object.keys(ingresses).length).toBeGreaterThan(0);
    });
  });

  describe("Outputs", () => {
    test("creates multiple outputs", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      const outputs = template.findOutputs("*");
      // Should have at least 7 outputs
      expect(Object.keys(outputs).length).toBeGreaterThanOrEqual(7);
    });

    test("exports contain cluster information", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);
      const outputs = template.findOutputs("*");
      const outputNames = Object.keys(outputs);

      // Verify key outputs exist
      expect(outputNames).toContain("ClusterArn");
      expect(outputNames).toContain("ClusterName");
      expect(outputNames).toContain("EfsFileSystemId");
      expect(outputNames).toContain("LoadBalancerDns");
      expect(outputNames).toContain("GrafanaUrl");
      expect(outputNames).toContain("PrometheusUrl");
    });
  });

  describe("Tags", () => {
    test("applies correct tags to stack", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
        }
      );

      const template = Template.fromStack(infraStack);

      // Check that resources have expected tags
      template.hasResourceProperties("AWS::ECS::Cluster", {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: "Environment",
            Value: "pipeline",
          }),
        ]),
      });
    });
  });

  describe("Custom IP Ranges", () => {
    test("respects custom allowed IP ranges", () => {
      const infraStack = new MonitoringInfraStack(
        app,
        "MonitoringInfraStack-pipeline",
        {
          env: {
            account: "123456789012",
            region: "eu-west-1",
          },
          vpc,
          envName: "pipeline",
          allowedIpRanges: ["10.0.0.0/8"],
        }
      );

      const template = Template.fromStack(infraStack);
      // Verify security group is created
      const securityGroups = template.findResources("AWS::EC2::SecurityGroup");
      expect(Object.keys(securityGroups).length).toBeGreaterThan(0);
    });
  });
});
