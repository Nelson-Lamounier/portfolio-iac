/** @format */

import js from "@eslint/js";

export default [
  // Global ignores for the entire monorepo
  {
    ignores: [
      "node_modules/**",
      ".turbo/**",
      "dist/**",
      "build/**",
      "coverage/**",
      ".next/**",
      "cdk.out/**",
      "out/**",
    ],
  },

  // Base configuration for JavaScript files in root
  {
    files: ["*.js", "*.mjs"],
    ...js.configs.recommended,
    rules: {
      "no-console": "warn",
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // Configuration files
  {
    files: ["*.config.js", "*.config.mjs", "turbo.json"],
    rules: {
      "no-console": "off",
    },
  },
];
