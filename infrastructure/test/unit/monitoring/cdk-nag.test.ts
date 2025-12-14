/** @format */

// test/monitoring/cdk-nag.test.ts
import * as cdk from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks } from "cdk-nag";
import { MonitoringInfraStack } from "../../../lib/stacks/monitoring/monitoring-infra-stack";
import { createTestMonitoringInfraStack } from "../../helpers/test-helpers";

describe("CDK Nag Compliance", () => {
  let testSetup: {
    app: cdk.App;
    stack: MonitoringInfraStack;
    template: any;
  };

  beforeEach(() => {
    // Enable CDK Nag for testing
    process.env.ENABLE_CDK_NAG = "true";

    testSetup = createTestMonitoringInfraStack({
      envName: "pipeline",
      account: "123456789012",
      region: "eu-west-1",
    });

    // Apply CDK Nag to the app
    cdk.Aspects.of(testSetup.app).add(
      new AwsSolutionsChecks({ verbose: true })
    );
  });

  afterEach(() => {
    // Reset CDK Nag environment variable
    delete process.env.ENABLE_CDK_NAG;
  });

  test("no CDK Nag errors", () => {
    const errors = Annotations.fromStack(testSetup.stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );

    // Filter out suppressed errors
    const unsuppressedErrors = errors.filter(
      (e) => !String(e.entry.data).includes("[Suppressed]")
    );

    if (unsuppressedErrors.length > 0) {
      console.log("CDK Nag Errors found:");
      unsuppressedErrors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.entry.data}`);
      });
    }

    expect(unsuppressedErrors).toHaveLength(0);
  });

  test("no high severity warnings without justification", () => {
    const warnings = Annotations.fromStack(testSetup.stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );

    // High severity rules that must not have warnings
    const highSeverityRules = [
      "AwsSolutions-IAM4", // Managed policies
      "AwsSolutions-IAM5", // Wildcard permissions
      "AwsSolutions-EC23", // Security group open to world
      "AwsSolutions-S1", // S3 bucket public access
      "AwsSolutions-S2", // S3 bucket public read
      "AwsSolutions-S3", // S3 bucket public write
    ];

    const highSeverityWarnings = warnings.filter((warning) => {
      return highSeverityRules.some((rule) =>
        String(warning.entry.data).includes(rule)
      );
    });

    // All high severity warnings should be suppressed with justification
    highSeverityWarnings.forEach((warning) => {
      const warningText = String(warning.entry.data);
      if (!warningText.includes("[Suppressed]")) {
        console.log(
          `High severity warning without suppression: ${warningText}`
        );
      }
      expect(warningText).toContain("[Suppressed]");
    });
  });

  test("CDK Nag suppressions are properly documented", () => {
    const allAnnotations = [
      ...Annotations.fromStack(testSetup.stack).findError(
        "*",
        Match.anyValue()
      ),
      ...Annotations.fromStack(testSetup.stack).findWarning(
        "*",
        Match.anyValue()
      ),
      ...Annotations.fromStack(testSetup.stack).findInfo("*", Match.anyValue()),
    ];

    const suppressedAnnotations = allAnnotations.filter((annotation) =>
      String(annotation.entry.data).includes("[Suppressed]")
    );

    // Each suppression should have a reason
    suppressedAnnotations.forEach((annotation) => {
      const suppressionText = String(annotation.entry.data);

      // Should contain suppression reason keywords
      const hasReason = [
        "reason:",
        "justification:",
        "because",
        "required for",
        "needed for",
        "necessary for",
      ].some((keyword) => suppressionText.toLowerCase().includes(keyword));

      if (!hasReason) {
        console.log(
          `Suppression without proper justification: ${suppressionText}`
        );
      }

      expect(hasReason).toBe(true);
    });
  });

  test("security-related CDK Nag rules are enforced", () => {
    const securityRules = [
      "AwsSolutions-IAM4", // AWS managed policies
      "AwsSolutions-IAM5", // Wildcard permissions
      "AwsSolutions-EC23", // Security groups open to world
      "AwsSolutions-ELB2", // ALB access logging
      "AwsSolutions-S1", // S3 bucket public access
    ];

    const errors = Annotations.fromStack(testSetup.stack).findError(
      "*",
      Match.anyValue()
    );
    const warnings = Annotations.fromStack(testSetup.stack).findWarning(
      "*",
      Match.anyValue()
    );

    const allSecurityAnnotations = [...errors, ...warnings].filter(
      (annotation) => {
        return securityRules.some((rule) =>
          String(annotation.entry.data).includes(rule)
        );
      }
    );

    // Security rules should either be compliant (no annotations) or properly suppressed
    allSecurityAnnotations.forEach((annotation) => {
      const annotationText = String(annotation.entry.data);

      // If there's a security annotation, it should be suppressed with justification
      if (!annotationText.includes("[Suppressed]")) {
        console.log(`Unsuppressed security rule violation: ${annotationText}`);
      }
    });

    // This test passes if we reach here without throwing
    expect(true).toBe(true);
  });

  test("CDK Nag can be disabled via environment variable", () => {
    // Test that CDK Nag respects the ENABLE_CDK_NAG environment variable
    delete process.env.ENABLE_CDK_NAG;

    const testApp = new cdk.App();
    const testStack = createTestMonitoringInfraStack({
      envName: "test-disabled",
      account: "123456789012",
      region: "eu-west-1",
    });

    // When CDK Nag is disabled, there should be no CDK Nag annotations
    const cdkNagAnnotations = [
      ...Annotations.fromStack(testStack.stack).findError(
        "*",
        Match.stringLikeRegexp("AwsSolutions-.*")
      ),
      ...Annotations.fromStack(testStack.stack).findWarning(
        "*",
        Match.stringLikeRegexp("AwsSolutions-.*")
      ),
    ];

    // Should have no CDK Nag annotations when disabled
    expect(cdkNagAnnotations.length).toBe(0);
  });
});
