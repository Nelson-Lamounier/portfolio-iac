/** @format */

// Jest setup file - simplified to avoid TypeScript issues
// Global test configuration is handled by Jest config

// Suppress console output during tests unless explicitly enabled
if (!process.env.VERBOSE_TESTS) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}
