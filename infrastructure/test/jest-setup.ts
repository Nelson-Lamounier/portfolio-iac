/** @format */

/// <reference types="jest" />

// Jest setup file to ensure types are available
// Global test configuration
jest.setTimeout(10000);

// Suppress console output during tests unless explicitly enabled
if (!process.env.VERBOSE_TESTS) {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
}
