import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier/recommended';
import github from 'eslint-plugin-github';
import jest from 'eslint-plugin-jest';
import globals from 'globals';

export default [
  // Recommended base configs
  js.configs.recommended,

  // Plugin configs
  github.getFlatConfigs().recommended,
  jest.configs['flat/recommended'],
  prettier,

  // Global ignores
  {
    ignores: ['node_modules/', 'dist/', 'coverage/', '.nyc_output/', '*.min.js']
  },

  // Main config
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },

    rules: {
      'i18n-text/no-en': 'off',
      camelcase: 'off', // GitHub API uses snake_case properties
      'object-shorthand': 'off', // Allow explicit property syntax for clarity
      'import/no-namespace': 'off', // Allow * namespace imports for ES modules
      'import/no-unresolved': 'off', // False positives for packages in node_modules
      'import/extensions': ['error', 'ignorePackages', { js: 'always' }], // Require .js extensions for ES modules
      quotes: ['error', 'single', { allowTemplateLiterals: true }],
      semi: ['error', 'always'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  }
];
