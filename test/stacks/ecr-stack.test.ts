/** @format */

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { EcrStack } from "../../lib/stacks/ecr-stack";

describe("EcrStack", () => {
  let app: cdk.App;
  let stack: EcrStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new EcrStack(app, "TestEcrStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
      envName: "development",
      pipelineAccount: "987654321098",
    });
    template = Template.fromStack(stack);
  });

  test("creates ECR repository with correct properties", () => {
    template.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: "app-repo-development",
      ImageScanningConfiguration: {
        ScanOnPush: true,
      },
      ImageTagMutability: "IMMUTABLE",
    });
  });

  test("has lifecycle policy configured", () => {
    const resources = template.findResources("AWS::ECR::Repository");
    const repository = Object.values(resources)[0];
    const lifecyclePolicy = JSON.parse(
      repository.Properties.LifecyclePolicy.LifecyclePolicyText
    );

    expect(lifecyclePolicy.rules).toHaveLength(1);
    expect(lifecyclePolicy.rules[0].selection.countNumber).toBe(10);
  });

  test("creates repository with retain removal policy", () => {
    template.hasResource("AWS::ECR::Repository", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
    });
  });

  test("grants cross-account access to pipeline account", () => {
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

  test("creates CloudFormation outputs", () => {
    template.hasOutput("RepositoryUri", {
      Description: "ECR Repository URI",
      Export: {
        Name: "development-ecr-repository-uri",
      },
    });

    template.hasOutput("RepositoryArn", {
      Description: "ECR Repository ARN",
      Export: {
        Name: "development-ecr-repository-arn",
      },
    });
  });

  test("repository name includes environment name", () => {
    const stagingApp = new cdk.App();
    const stagingStack = new EcrStack(stagingApp, "StagingEcrStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
      envName: "staging",
    });

    const stagingTemplate = Template.fromStack(stagingStack);

    stagingTemplate.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: "app-repo-staging",
    });
  });

  test("works without pipeline account", () => {
    const noPipelineApp = new cdk.App();
    const stackWithoutPipeline = new EcrStack(
      noPipelineApp,
      "NoPipelineStack",
      {
        env: {
          account: "123456789012",
          region: "eu-west-1",
        },
        envName: "development",
      }
    );

    const noPipelineTemplate = Template.fromStack(stackWithoutPipeline);

    noPipelineTemplate.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: "app-repo-development",
    });

    const resources = noPipelineTemplate.findResources("AWS::ECR::Repository");
    const repository = Object.values(resources)[0];
    expect(repository.Properties.RepositoryPolicyText).toBeUndefined();
  });

  test("exposes repository as public property", () => {
    expect(stack.repository).toBeDefined();
    expect(stack.repository).toBeInstanceOf(cdk.aws_ecr.Repository);
  });

  test("snapshot test", () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});
