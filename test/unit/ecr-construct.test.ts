/** @format */

import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { EcrConstruct } from "../../lib/constructs/storage/ecr-construct";

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

    const resources = template.findResources("AWS::ECR::Repository");
    const repository = Object.values(resources)[0];
    const lifecyclePolicy = JSON.parse(
      repository.Properties.LifecyclePolicy.LifecyclePolicyText
    );

    expect(lifecyclePolicy.rules[0].selection.countNumber).toBe(10);
  });

  test("creates lifecycle rule with custom max image count", () => {
    new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
      lifecycleRules: 5,
    });

    const template = Template.fromStack(stack);

    const resources = template.findResources("AWS::ECR::Repository");
    const repository = Object.values(resources)[0];
    const lifecyclePolicy = JSON.parse(
      repository.Properties.LifecyclePolicy.LifecyclePolicyText
    );

    expect(lifecyclePolicy.rules[0].selection.countNumber).toBe(5);
  });

  test("grants pipeline account access when specified", () => {
    new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
      pipelineAccount: "123456789012",
    });

    const template = Template.fromStack(stack);

    const resources = template.findResources("AWS::ECR::Repository");
    const repository = Object.values(resources)[0];
    const policyText = repository.Properties.RepositoryPolicyText;

    expect(policyText).toBeDefined();
    expect(policyText.Statement).toHaveLength(1);
    expect(policyText.Statement[0].Effect).toBe("Allow");
    expect(policyText.Statement[0].Action).toContain(
      "ecr:BatchCheckLayerAvailability"
    );
    expect(policyText.Statement[0].Action).toContain("ecr:BatchGetImage");
    expect(policyText.Statement[0].Action).toContain(
      "ecr:GetDownloadUrlForLayer"
    );
    expect(policyText.Statement[0].Action).toContain("ecr:PutImage");
  });

  test("does not create repository policy without pipeline account", () => {
    new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
    });

    const template = Template.fromStack(stack);

    const resources = template.findResources("AWS::ECR::Repository");
    const repository = Object.values(resources)[0];

    expect(repository.Properties.RepositoryPolicyText).toBeUndefined();
  });

  test("exposes repository as public property", () => {
    const construct = new EcrConstruct(stack, "TestEcr", {
      repositoryName: "test-repo",
    });

    expect(construct.repository).toBeDefined();
    expect(construct.repository).toBeInstanceOf(ecr.Repository);
  });
});
