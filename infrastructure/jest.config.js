/** @format */

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  testTimeout: 10000,
  verbose: false,
  collectCoverage: false,
  reporters: ["default"],
  maxWorkers: 1,
  forceExit: true,
  setupFilesAfterEnv: ["<rootDir>/test/jest-setup.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/lib/$1",
  },
};
