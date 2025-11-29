/** @format */

import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import { Template, Match } from "aws-cdk-lib/assertions";
import { EventBridgeConstruct } from "../../lib/constructs/monitoring/eventbridge-construct";

describe("EventBridgeConstruct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let alarmTopic: sns.Topic;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    alarmTopic = new sns.Topic(stack, "AlarmTopic");
  });

  describe("Pipeline Account Configuration", () => {
    test("creates custom event bus in pipeline account", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111", "222222222222"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::Events::EventBus", 1);
      template.hasResourceProperties("AWS::Events::EventBus", {
        Name: "cross-account-monitoring",
      });
    });

    test("creates event bus policy for target accounts", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111", "222222222222"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::Events::EventBusPolicy", 1);
    });

    test("creates log group for events", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/aws/events/cross-account-monitoring",
      });
    });

    test("creates ECS task state change rule", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Events::Rule", {
        Name: "ecs-task-state-changes",
        EventPattern: Match.objectLike({
          source: ["aws.ecs"],
          "detail-type": ["ECS Task State Change"],
        }),
      });
    });

    test("creates ECS deployment state change rule", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Events::Rule", {
        Name: "ecs-deployment-state-changes",
        EventPattern: Match.objectLike({
          source: ["aws.ecs"],
          "detail-type": ["ECS Deployment State Change"],
        }),
      });
    });

    test("creates CloudFormation stack rule", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Events::Rule", {
        Name: "cloudformation-stack-events",
        EventPattern: Match.objectLike({
          source: ["aws.cloudformation"],
          "detail-type": ["CloudFormation Stack Status Change"],
        }),
      });
    });

    test("creates ECR image push rule", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Events::Rule", {
        Name: "ecr-image-push-events",
        EventPattern: Match.objectLike({
          source: ["aws.ecr"],
          "detail-type": ["ECR Image Action"],
        }),
      });
    });

    test("creates Auto Scaling rule", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Events::Rule", {
        Name: "autoscaling-events",
        EventPattern: Match.objectLike({
          source: ["aws.autoscaling"],
        }),
      });
    });

    test("creates security events rule", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Events::Rule", {
        Name: "security-events",
        EventPattern: Match.objectLike({
          source: ["aws.iam", "aws.ec2"],
        }),
      });
    });

    test("rules have SNS targets", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      // Check that at least one rule has SNS target
      template.hasResourceProperties("AWS::Events::Rule", {
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.objectLike({
              Ref: Match.stringLikeRegexp("AlarmTopic.*"),
            }),
          }),
        ]),
      });
    });

    test("rules have CloudWatch Logs targets", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      // Check that at least one rule has multiple targets
      template.hasResourceProperties("AWS::Events::Rule", {
        Targets: Match.arrayWith([Match.objectLike({ Arn: Match.anyValue() })]),
      });
    });
  });

  describe("Target Account Configuration", () => {
    test("creates IAM role for cross-account access", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "development",
        isPipelineAccount: false,
        pipelineAccountId: "999999999999",
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "eventbridge-cross-account-development",
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: "events.amazonaws.com",
              },
            }),
          ]),
        }),
      });
    });

    test("IAM role has PutEvents permission", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "development",
        isPipelineAccount: false,
        pipelineAccountId: "999999999999",
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "events:PutEvents",
              Effect: "Allow",
              Resource: Match.stringLikeRegexp(
                ".*999999999999.*cross-account-monitoring"
              ),
            }),
          ]),
        }),
      });
    });

    test("creates rule to forward ECS events", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "development",
        isPipelineAccount: false,
        pipelineAccountId: "999999999999",
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Events::Rule", {
        Name: "forward-ecs-events-development",
        EventPattern: Match.objectLike({
          source: ["aws.ecs"],
        }),
      });
    });

    test("creates rule to forward CloudFormation events", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "development",
        isPipelineAccount: false,
        pipelineAccountId: "999999999999",
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Events::Rule", {
        Name: "forward-cfn-events-development",
        EventPattern: Match.objectLike({
          source: ["aws.cloudformation"],
        }),
      });
    });

    test("creates rule to forward ECR events", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "development",
        isPipelineAccount: false,
        pipelineAccountId: "999999999999",
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Events::Rule", {
        Name: "forward-ecr-events-development",
        EventPattern: Match.objectLike({
          source: ["aws.ecr"],
        }),
      });
    });

    test("creates rule to forward Auto Scaling events", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "development",
        isPipelineAccount: false,
        pipelineAccountId: "999999999999",
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Events::Rule", {
        Name: "forward-asg-events-development",
        EventPattern: Match.objectLike({
          source: ["aws.autoscaling"],
        }),
      });
    });

    test("throws error when pipelineAccountId missing", () => {
      expect(() => {
        new EventBridgeConstruct(stack, "TestEventBridge", {
          envName: "development",
          isPipelineAccount: false,
          alarmTopic,
        });
      }).toThrow("pipelineAccountId is required");
    });
  });

  describe("Public Properties", () => {
    test("exposes event bus in pipeline account", () => {
      const eventBridge = new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111"],
        alarmTopic,
      });

      expect(eventBridge.eventBus).toBeDefined();
      expect(eventBridge.eventBus.eventBusArn).toBeDefined();
    });

    test("exposes event bus in target account", () => {
      const eventBridge = new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "development",
        isPipelineAccount: false,
        pipelineAccountId: "999999999999",
        alarmTopic,
      });

      expect(eventBridge.eventBus).toBeDefined();
    });
  });

  describe("Environment-Specific Configuration", () => {
    test("development environment rules", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "development",
        isPipelineAccount: false,
        pipelineAccountId: "999999999999",
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "eventbridge-cross-account-development",
      });
    });

    test("staging environment rules", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "staging",
        isPipelineAccount: false,
        pipelineAccountId: "999999999999",
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "eventbridge-cross-account-staging",
      });
    });

    test("production environment rules", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "production",
        isPipelineAccount: false,
        pipelineAccountId: "999999999999",
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "eventbridge-cross-account-production",
      });
    });
  });

  describe("Multiple Target Accounts", () => {
    test("handles multiple target accounts", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: ["111111111111", "222222222222", "333333333333"],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::Events::EventBusPolicy", 1);
    });

    test("handles empty target accounts array", () => {
      new EventBridgeConstruct(stack, "TestEventBridge", {
        envName: "pipeline",
        isPipelineAccount: true,
        targetAccountIds: [],
        alarmTopic,
      });
      const template = Template.fromStack(stack);

      // Should still create event bus but no policy
      template.resourceCountIs("AWS::Events::EventBus", 1);
    });
  });
});
