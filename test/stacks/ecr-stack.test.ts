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
    template.hasResourceProperties("AWS::ECR::Repository", {
      LifecyclePolicy: {
        LifecyclePolicyText: Match.stringLikeRegexp("maxImageCount"),
      },
    });
  });

  test("creates repository with retain removal policy", () => {
    template.hasResource("AWS::ECR::Repository", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
    });
  });

  test("grants cross-account access to pipeline account", () => {
    template.hasResourceProperties("AWS::ECR::RepositoryPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Principal: {
              AWS: {
                "Fn::Join": Match.arrayWith([
                  Match.arrayWith([
                    Match.stringLikeRegexp("arn:.*:iam::987654321098:root"),
                  ]),
                ]),
              },
            },
            Action: Match.arrayWith([
              "ecr:BatchCheckLayerAvailability",
              "ecr:GetDownloadUrlForLayer",
              "ecr:BatchGetImage",
            ]),
          }),
        ]),
      },
    });
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
    const stagingStack = new EcrStack(app, "StagingEcrStack", {
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
    const stackWithoutPipeline = new EcrStack(app, "NoPipelineStack", {
      env: {
        account: "123456789012",
        region: "eu-west-1",
      },
      envName: "development",
    });

    const noPipelineTemplate = Template.fromStack(stackWithoutPipeline);

    noPipelineTemplate.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: "app-repo-development",
    });

    noPipelineTemplate.resourceCountIs("AWS::ECR::RepositoryPolicy", 0);
  });

  test("exposes repository as public property", () => {
    expect(stack.repository).toBeDefined();
    expect(stack.repository.repositoryName).toBe("app-repo-development");
  });

  test("snapshot test", () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});
