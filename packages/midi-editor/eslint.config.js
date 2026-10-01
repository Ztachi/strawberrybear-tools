import base from '../../eslint.config.js'

export default [
  ...base,
  // 本包是无 DOM 的纯 TS 库；类型名由 tsc 负责检查。
  { files: ['**/*.ts'], rules: { 'no-undef': 'off' } },
]
