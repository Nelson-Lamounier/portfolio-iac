/** @format */

module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/__backup_tests/", "/examples/"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        isolatedModules: true, // Skip type checking for faster tests
      },
    ],
  },
  collectCoverageFrom: ["lib/**/*.ts", "!lib/**/*.d.ts", "!lib/**/index.ts"],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 40,
      lines: 60,
      statements: 60,
    },
  },
};
