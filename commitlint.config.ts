/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-01 21:05:41
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-05 20:48:09
 * @FilePath: /strawberrybear-tools/commitlint.config.ts
 * @Description: 
 */
/*
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-03-30 17:31:45
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-01 17:20:42
 * @FilePath: /homepage/commitlint.config.ts
 * @Description:
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [0], // 禁用 header 长度校验
    'body-max-line-length': [0], // 禁用 body 长度校验
  },
}
