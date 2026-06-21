# @strawberrybear/nikki-theme

无限暖暖相关工具的共享主题 token 包。

本包只导出平台无关的颜色、阴影、圆角和 CSS 变量，不依赖 Vue、Vuetify、antdv-next 或任何运行时 UI 框架。应用侧需要自行把这些 token 组装成对应 UI 框架的主题配置。

## 边界

- 本包负责：品牌色、状态色、文本色、背景色、常用透明色、圆角、阴影和 CSS 变量映射。
- 本包不负责：组件主题对象、弹层容器、路由、状态管理、业务文案或证书模板。

## 使用

```ts
import { NIKKI_COLORS, createNikkiCssVariableRecord } from '@strawberrybear/nikki-theme'
```
