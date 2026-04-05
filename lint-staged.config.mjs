export default {
  // apps 目录运行 eslint --fix 和 prettier --write
  'apps/**/*.{js,ts,mjs,cjs,vue}': ['eslint --fix', 'prettier --write'],
  // server 目录
  'server/**/*.ts': ['eslint --fix', 'prettier --write'],
  // test 目录
  'test/**/*.{ts,js}': ['eslint --fix', 'prettier --write'],
  // 文档和其它配置文件仅做 prettier 格式化
  '*.{json,md,css,yaml,yml}': ['prettier --write'],
  // dq7-shuffle 项目
  'apps/dq7-shuffle/**/*.{js,ts,mjs,cjs}': ['eslint --fix', 'prettier --write'],
}
