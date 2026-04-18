/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:17:19
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:17:20
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/tailwind.config.js
 * @Description:
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  corePlugins: {
    // 禁用 Tailwind Preflight，避免与 Vuetify 的 normalize 样式冲突
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        primary: '#f7c0c1',
        'primary-light': '#fddde6',
        secondary: '#f5b8c0',
      },
    },
  },
  plugins: [],
}
