import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'scripts', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': hooks },
    rules: {
      ...hooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-irregular-whitespace': ['error', { skipJSXText: true, skipStrings: true }],
      // 禁止 emoji / 装饰性 Unicode 符号作为界面图标（见 CONTRIBUTING.md）
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/[\\u2190-\\u21FF\\u2600-\\u27BF\\u2B00-\\u2BFF]|[\\uD83C-\\uDBFF][\\uDC00-\\uDFFF]/u]',
          message: 'UI 图标请使用 Lucide <Icon />，不要使用 emoji/Unicode 符号',
        },
        {
          selector: 'JSXText[value=/[\\u2190-\\u21FF\\u2600-\\u27BF\\u2B00-\\u2BFF]|[\\uD83C-\\uDBFF][\\uDC00-\\uDFFF]/u]',
          message: 'UI 图标请使用 Lucide <Icon />，不要使用 emoji/Unicode 符号',
        },
      ],
    },
  },
);
