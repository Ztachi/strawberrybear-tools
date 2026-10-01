import base from '../../eslint.config.js'

export default [
  ...base,
  // DOM 的类型名称由 vue-tsc 检查，ESLint 的 JS no-undef 无法识别类型空间。
  { files: ['**/*.ts'], rules: { 'no-undef': 'off' } },
  { ignores: ['test-results/**', 'playwright-report/**'] },
]
