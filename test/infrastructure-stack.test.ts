/** @format */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { InfrastructureStack } from "../lib/infrastructure-stack";

describe("InfrastructureStack", () => {
  test("infrastructure matches snapshot", () => {
    const app = new cdk.App();
    const stack = new InfrastructureStack(app, "TestStack", {
      env: { account: "123456789012", region: "eu-west-1" },
      envName: "test",
      pipelineAccount: "987654321098",
    });
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
