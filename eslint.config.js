import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default [{ ignores: ['dist', 'android/**/build/**', 'android/app/src/main/assets/public/**'] }, ...tseslint.configs.recommended, { files: ['**/*.{ts,tsx}'], languageOptions: { ecmaVersion: 2022, globals: globals.browser }, plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh }, rules: { ...js.configs.recommended.rules, ...reactHooks.configs.recommended.rules, ...reactRefresh.configs.vite.rules, 'react-hooks/purity': 'off', 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }], '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } }];
