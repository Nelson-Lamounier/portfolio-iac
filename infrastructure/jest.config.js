/** @format */

module.exports = {
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
  preset: "ts-jest",
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/lib/$1",
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  // Configure ts-jest for better CI compatibility
  globals: {
    "ts-jest": {
      useESM: false,
      tsconfig: {
        compilerOptions: {
          module: "commonjs",
          target: "es2020",
          strict: false,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          skipLibCheck: true,
        },
      },
    },
  },
  // Add Jest environment for better TypeScript support
  testEnvironmentOptions: {
    node: {
      globals: true,
    },
  },
};
