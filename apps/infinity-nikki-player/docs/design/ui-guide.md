# UI 组件使用指南

## 技术栈

- **UI 框架**: `antdv-next@1.3.3`
- **样式方案**: Tailwind CSS v3 + 项目 CSS 变量
- **主题入口**: `src/theme/infinityNikkiTheme.ts`
- **反馈入口**: `src/lib/feedback.ts`
- **图标库**: `lucide-vue-next`（优先） + `@antdv-next/icons`

官方参考：

- antdv-next LLMs: <https://www.antdv-next.cn/llms.txt>
- antdv-next Skills: <https://www.antdv-next.cn/docs/vue/skills-cn>
- antdv-next 主题定制: <https://www.antdv-next.cn/docs/vue/customize-theme-cn>

## 组件导入

业务组件直接从 `antdv-next` 按需导入，不新增自动导入插件。

```vue
<script setup lang="ts">
import { Button, Drawer, Input, Modal, Select, SelectOption } from 'antdv-next'
</script>

<template>
  <Button type="primary" size="small">保存</Button>
  <Input v-model:value="name" />
  <Select v-model:value="templateId">
    <SelectOption value="piano">Piano</SelectOption>
  </Select>
</template>
```

## 图标使用

通用操作图标优先使用 `lucide-vue-next`，保持播放器、模板编辑器等工具界面的线性图标风格。
品牌图标、实心状态图标或 lucide 缺失的语义图标，使用 antdv-next 配套的
`@antdv-next/icons`。不要手写 SVG 或用文本伪装图标；新增图标前先查询现有两个图标库。

只需要提示文案的图标入口应使用 `Tooltip` 或 `Popover`，不要依赖原生 `title` 属性。帮助、
说明类入口不应为了显示图标而包一层有边框的按钮；除非交互设计明确需要按钮外观，否则使用
语义化 `button` 承载图标和无障碍标签。

## 公共组件边界

底层公共组件应封装稳定的业务意图，而不是把同一套状态拼装逻辑散落到页面里。跨页面复用的
控件如果天然绑定同一个 Pinia 状态，例如当前键位映射模板选择，应在公共组件内部读取和更新
store；调用方只传布局、尺寸、弹层 class 等展示参数。页面组件负责组合业务区域，避免重复
生成 options、重复处理 store selection 或复制 i18n 显示名逻辑。

可增长集合必须用结构化数组驱动渲染，例如联系方式、外链、社交账号、设置入口和菜单项。
语言包中每一项应保存 `type`、`label`、`account` / `url` 等字段，组件用 `v-for` 渲染；
不要为每个渠道新增 `qqLabel`、`qqAccount`、`discordLabel` 这类平铺 key，也不要在模板里复制
多段只有文案和图标不同的 DOM。图标差异通过 `type -> icon` 注册表解决。

常见 v-model 规则：

| 组件     | 写法                                  |
| -------- | ------------------------------------- |
| `Input`  | `v-model:value`                       |
| `Select` | `v-model:value`                       |
| `Slider` | `v-model:value`                       |
| `Switch` | `v-model:checked`                     |
| `Modal`  | `v-model:open` 或 `:open` + `@cancel` |
| `Drawer` | `:open` + `@update:open`              |

## Tailwind 使用

保留 Tailwind CSS v3。新增 UI 样式优先使用 Tailwind 原子类；只有以下情况才新增 scoped CSS：

- 需要覆盖 antdv-next 内部语义结构，例如 Drawer body padding。
- 需要表达已有项目变量或渐变。
- Canvas、播放器、键盘预览等复杂组件已有稳定局部样式。

不要为新 UI 建立一套新的 class 系统。既有 custom class 可以保留，除非它直接依赖已移除的 UI 框架行为。

## CSS 布局优先

布局高度、滚动区域和响应式尺寸优先交给 CSS 处理。能用 `flex`、`min-h-0`、`overflow`、
`calc()` 或组件支持的 CSS 尺寸值表达时，不要新增 `ResizeObserver`、窗口 resize 监听、
`getBoundingClientRect()` 测量或 debounce 状态同步。

模板管理表格是基准案例：`TemplateEditor.vue` 的表格 body 高度直接使用
`scroll.y: 'calc(100vh - 280px)'`，删除 `debouncedUpdateTableScrollY` 及相关监听后，布局仍由
CSS 随窗口变化自动计算。

## 框架主题优先

禁止用 `!important` 强制覆盖 antdv-next 组件样式。主题色、边框、阴影、圆角、hover/active
状态优先写入 `ConfigProvider` 的 `theme.token` 或 `theme.components`；组件局部差异优先使用
框架 props、`classes`、`styles` 和语义 DOM class。只有非框架组件或纯业务容器样式才写普通
CSS class，且不得压制框架主题机制。

新增样式不得硬编码已有设计系统可表达的视觉值；必须优先复用项目 CSS 变量、主题 token
或 `src/theme/infinityNikkiTheme.ts` 中的主题常量。覆盖 antdv-next 或 `@v-c/*` 内部结构前，
必须先检查框架提供的配置入口，包括组件 token、组件 props、语义 class/style 扩展和内部 CSS
变量。只有确认没有可配置入口时，才允许使用窄范围全局选择器覆盖，并在选择器上限定到具体
弹层或组件容器。

应用级滚动条统一在 `src/style.css` 中定义，颜色、hover 状态和透明轨道都必须读取项目 CSS
变量或主题 token。页面、表格、弹层和虚拟列表不得在组件内零散硬编码滚动条颜色；如果框架内部
使用原生滚动容器，优先通过全局伪元素和 antdv-next 语义 class 覆盖；如果是内联样式或虚拟
滚动条，必须先检查组件配置和内部 CSS 变量，确认无法配置后再做限定范围覆盖。

## 主题和 App 上下文

`src/App.vue` 必须用 `ConfigProvider` 和 `App` 包裹主界面：

```vue
<ConfigProvider :theme="infinityNikkiTheme" :locale="currentAntdvLocale">
  <AntApp>
    <MainWindow />
    <AboutDialog />
  </AntApp>
</ConfigProvider>
```

应用语言切换必须同步 antdv-next 框架语言。新增语言包时，在 `src/i18n/index.ts` 的统一语言注册表里同时登记业务 messages 和对应的 `antdv-next/locale/*`，根 `ConfigProvider` 通过当前 `vue-i18n` 语言传入 `locale`。不要只更新业务语言包，否则 Select 空态、Pagination、Modal 等框架内置文案会回退英文。

静态 notification/message/modal 不会自动继承根 `ConfigProvider`，启动时由 `configureAntdvStaticContext()` 配置 holder，并在 holder 渲染时读取当前 antdv-next locale。不要在业务模块直接调用 antdv-next 静态通知 API，统一使用 `feedback`。

```ts
import { feedback } from '@/lib/feedback'

feedback.success(t('template.saved'))
feedback.error(t('template.saveFailed'), { description: String(error) })
```

## 抽屉容器规则

主窗口顶部菜单高度为 46px。MIDI 详情和模板编辑抽屉只允许覆盖内容区，不能覆盖顶部菜单栏。

抽屉必须使用主内容区 portal：

```vue
<Drawer
  :open="open"
  placement="left"
  width="100%"
  :get-container="getMainWindowPopupContainer"
  :root-style="getContentDrawerRootStyle()"
>
  ...
</Drawer>
```

`getContentDrawerRootStyle()` 必须返回 `position: 'absolute'`。这是 antdv-next Drawer 自定义容器的必要条件，否则 Drawer 仍会按视口 fixed 定位。

## 表格和分页

列表型数据使用 antdv-next `Table` 和 `Pagination`。如果业务需要跨分页保留选择，不要强行使用 Table 内置 rowSelection；可以保留页面内的 `Set` 状态并在列中渲染复选框。

```vue
<Table
  :data-source="pagedTemplates"
  :pagination="false"
  :row-key="(template) => template.id"
  size="small"
>
  <TableColumn key="name" :title="t('template.name')" />
</Table>

<Pagination
  :current="currentPage"
  :page-size="pageSize"
  :total="filteredTemplates.length"
  show-size-changer
  @change="handlePaginationChange"
/>
```

## 弹层组件

- Tooltip: 用 `:title` 传入文本，直接包裹触发元素。
- Popover: 用 `trigger="click"` 和 `#content` 渲染菜单内容。
- Modal: 用 `:footer="null"` 时，业务按钮写在默认插槽里。
- Drawer: 内容区抽屉必须遵守上面的容器规则。

## 桌面交互限制

桌面应用中禁止使用触摸手势相关交互：

- 禁止使用 `touchstart`、`touchmove`、`touchend`。
- 禁止使用 `pinch-zoom`、`pan` 等移动端手势。
- 禁止通过 `pointerType` 分支实现触摸手势。
- 允许鼠标点击、拖拽、滚轮、键盘快捷键和原生输入控件。

例外：Canvas 或 Slider 可以使用普通 pointer 事件处理桌面拖拽，但不能加入移动端手势语义。

## 组件存放规范

全局可复用业务组件放在 `src/components/`，页面私有组件放在对应 `src/views/**/components/`。本项目不维护本地 UI 框架源码目录。

```text
src/
├── components/
│   ├── KeyboardPreview/
│   ├── PlayerControls/
│   └── PreviewPlayer/
└── views/
    └── MainWindow/
        ├── FilesTab/
        ├── TemplatesTab/
        └── LogsTab/
```

组件拆分应降低复杂度。页面主体状态、搜索、分页、批量操作可保留在页面主组件中；复杂编辑器、抽屉和可复用播放器适合拆成子组件。

## 业务边界

UI 框架迁移不应改变业务逻辑：

- 不改 Rust 命令参数和返回结构。
- 不改 MIDI 导入、解析、播放、键盘模拟和模板持久化规则。
- Store 内只允许替换反馈提示调用，不改状态流。
- Tab 离开守卫、模板 dirty confirm、导入前切回文件页等交互规则必须保持。
