/** @format */

import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Base configurations
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Global ignores
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'build/**',
      '.turbo/**',
      'coverage/**',
      'next-env.d.ts', // Ignore Next.js type definitions
    ],
  },

  // JavaScript config files
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // TypeScript and React files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-require-imports': 'off', // Allow require in tests
      '@typescript-eslint/triple-slash-reference': 'off', // Allow Next.js triple slash references

      // React specific rules
      'react/react-in-jsx-scope': 'off', // Not needed in Next.js
      'react/prop-types': 'off', // Using TypeScript for prop validation

      // General rules
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Test files configuration
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '__tests__/**/*',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },

  // API routes and server-side code
  {
    files: ['src/app/api/**/*.ts', 'src/lib/**/*.ts'],
    rules: {
      'no-console': 'off', // Allow console in API routes and server utilities
    },
  },
)
