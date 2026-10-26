import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// #288：存量巨文件仍报 500 行警告；新增文件不能再超过 600 行。
// 物理行计数与 max-lines 一致，包含空行/注释，不把末尾换行额外算一行。
const maxNewFileLines = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: { exceeded: '文件有 {{lines}} 行，超过新文件 600 行上限，请按职责拆分。' },
  },
  create(context) {
    return {
      Program(node) {
        const sourceLines = context.sourceCode.lines;
        const lines = sourceLines.length - (sourceLines.at(-1) === '' ? 1 : 0);
        if (lines > 600) context.report({ node, loc: { line: 601, column: 0 }, messageId: 'exceeded', data: { lines } });
      },
    };
  },
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'scripts', 'test-results', 'playwright-report', 'src/content/schema/compiled'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': hooks, maintenance: { rules: { 'max-new-file-lines': maxNewFileLines } } },
    rules: {
      ...hooks.configs.recommended.rules,
      'max-lines': ['warn', { max: 500, skipBlankLines: false, skipComments: false }],
      'maintenance/max-new-file-lines': 'error',
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
  {
    // main@cca7e56 已超过 600 行、且不在 #288 拆分范围的固定基线。
    // 不按 glob 或当前行数动态豁免，新文件不会进入此名单。
    files: ['src/domain/buildSim.ts', 'src/domain/garrisonGeneral.ts', 'src/shared/nav/pageRegistry.ts', 'tests/e2e/smoke.spec.ts'],
    rules: { 'maintenance/max-new-file-lines': 'off' },
  },
);
