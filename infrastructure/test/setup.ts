/** @format */

// test/setup.ts - Jest setup file for monitoring tests

import { disableCdkNag } from "./helpers/test-helpers";

// Ensure Jest globals are available
/// <reference types="jest" />

// Global test setup
beforeAll(() => {
  // Disable CDK Nag for unit tests to speed up execution
  disableCdkNag();

  // Set test environment variables
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = "eu-west-1";
  process.env.AWS_DEFAULT_REGION = "eu-west-1";

  // Suppress CDK warnings in tests
  process.env.CDK_DISABLE_VERSION_CHECK = "true";

  // Set consistent timezone for tests
  process.env.TZ = "UTC";
});

// Global test teardown
afterAll(() => {
  // Clean up any test resources
  delete process.env.ENABLE_CDK_NAG;
  delete process.env.NODE_ENV;
});

// Increase timeout for CDK synthesis tests
jest.setTimeout(30000);

// AWS SDK mocking removed - not needed for CDK unit tests
// CDK unit tests only test CloudFormation template generation, not actual AWS API calls

// Console log suppression for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  // Suppress CDK output during tests unless explicitly enabled
  if (!process.env.VERBOSE_TESTS) {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterEach(() => {
  // Restore console methods
  if (!process.env.VERBOSE_TESTS) {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  }
});
