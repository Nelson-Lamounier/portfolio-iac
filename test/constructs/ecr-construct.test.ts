/** @format */

import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { EcrConstruct } from "../../lib/constructs/ecr-construct";

describe("EcrConstruct", () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, "TestStack");
  });

  test("creates repository with default properties", () => {
    new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: "test-repo",
      ImageScanningConfiguration: {
        ScanOnPush: true,
      },
      ImageTagMutability: "IMMUTABLE",
    });
  });

  test("creates repository with custom tag mutability", () => {
    new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
      imageTagMutability: ecr.TagMutability.MUTABLE,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::ECR::Repository", {
      ImageTagMutability: "MUTABLE",
    });
  });

  test("creates lifecycle rule with default max image count", () => {
    new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::ECR::Repository", {
      LifecyclePolicy: {
        LifecyclePolicyText: expect.stringContaining('"countNumber":10'),
      },
    });
  });

  test("creates lifecycle rule with custom max image count", () => {
    new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
      lifecycleRules: 5,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::ECR::Repository", {
      LifecyclePolicy: {
        LifecyclePolicyText: expect.stringContaining('"countNumber":5'),
      },
    });
  });

  test("grants pipeline account access when specified", () => {
    new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
      pipelineAccount: "123456789012",
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::ECR::RepositoryPolicy", 1);
  });

  test("does not create repository policy without pipeline account", () => {
    new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::ECR::RepositoryPolicy", 0);
  });

  test("exposes repository as public property", () => {
    const construct = new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
    });

    expect(construct.repository).toBeDefined();
    expect(construct.repository).toBeInstanceOf(ecr.Repository);
  });

  test("snapshot test", () => {
    new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
      pipelineAccount: "123456789012",
    });

    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
