# 主题和样式规范

## 主题入口

Infinity Nikki Player 使用 `src/theme/infinityNikkiTheme.ts` 管理 antdv-next 主题。根组件通过 `ConfigProvider` 注入 `infinityNikkiTheme`，启动时通过 `configureAntdvStaticContext()` 为静态 notification/message/modal 注入同一主题上下文。

本项目不启用 antdv-next `zeroRuntime`。Tailwind CSS v3 和项目 CSS 变量继续保留。

## 无限暖暖配色

| 用途                 | 色值      | 说明                                 |
| -------------------- | --------- | ------------------------------------ |
| Primary              | `#F7C0C1` | 主品牌粉色                           |
| Primary Hover        | `#F5AAB8` | 悬停态、选中项悬停                   |
| Primary Active       | `#E98CA2` | 按下态、链接重点                     |
| Layout Background    | `#FFF7FA` | 应用布局背景                         |
| Container Background | `#FFFFFF` | 普通容器                             |
| Elevated Background  | `#FFF9FC` | Modal、Drawer、Popover、Notification |
| Text                 | `#4A3F3F` | 主文本                               |
| Secondary Text       | `#6B5A5A` | 次级文本                             |
| Border               | `#F3CAD0` | 输入框、表格、容器边框               |
| Success              | `#4ADE80` | 播放状态、成功反馈                   |
| Warning              | `#F5C542` | 暂停和警告                           |
| Error                | `#EF5B6B` | 错误反馈                             |

## antdv-next Token

主题 token 应集中写在 `infinityNikkiTheme`：

```ts
export const infinityNikkiTheme: ThemeConfig = {
  token: {
    colorPrimary: '#F7C0C1',
    colorPrimaryHover: '#F5AAB8',
    colorPrimaryActive: '#E98CA2',
    colorBgLayout: '#FFF7FA',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFF9FC',
    colorText: '#4A3F3F',
    colorTextSecondary: '#6B5A5A',
    colorBorder: '#F3CAD0',
    borderRadius: 12,
  },
}
```

组件级 token 用于修正 antdv-next 默认视觉，例如 Button 阴影、Table hover、Tabs ink bar、Modal/Drawer/Popover elevated 背景。

## 项目 CSS 变量

`src/style.css` 中的变量是项目视觉和 Tailwind 语义色，不再代表某个外部 UI 框架。

```css
:root {
  --color-primary: #f7c0c1;
  --color-primary-light: #fddde6;
  --color-secondary: #f5b8c0;
  --color-foreground: #4a3f3f;
  --color-muted: #a89a9a;
  --color-muted-dark: #6b5a5a;

  --background: 340 100% 98%;
  --foreground: 330 10% 15%;
  --primary: 350 89% 80%;
  --border: 350 55% 88%;
  --input: 350 45% 88%;
  --ring: 350 89% 80%;
}
```

Tailwind 配置继续读取这些 HSL 变量，例如 `border-border`、`text-foreground`、`bg-primary/10`。

## 视觉原则

### 1. 温暖但克制

主界面以粉色作为品牌信号，但操作界面仍应便于长期使用。大面积区域使用白色、浅粉和半透明背景，交互重点再使用主粉色。

### 2. 桌面工具密度

这是工作型桌面工具，不做营销式首屏。页面应优先展示文件列表、播放器、模板表格和编辑器。标题、按钮和表格密度应适合扫描与重复操作。

### 3. 统一圆角

常规控件圆角以 12px 为主。卡片和复杂面板可以使用 14px 到 16px。不要为普通按钮和表格单元格使用过大的圆角。

### 4. 抽屉边界

主内容区抽屉必须只覆盖 `#main-window-body`，不能覆盖 46px 顶部菜单。相关样式和容器函数由 `src/theme/infinityNikkiTheme.ts` 提供。

## 允许的局部样式

新增 UI 优先使用 Tailwind 原子类。允许 scoped CSS 的场景：

- 覆盖 antdv-next 内部结构，如 `.ant-drawer-body`、`.ant-table-thead`。
- 保留播放器、键盘预览、Canvas 模板编辑器等复杂局部视觉。
- 使用项目 CSS 变量表达渐变、透明边框和暖粉阴影。

滚动条属于应用级主题基础样式，统一维护在 `src/style.css`。新增滚动容器默认继承全局粉色
滚动条，不在局部组件里写硬编码颜色；需要覆盖 antdv-next 表格、弹层或虚拟列表时，优先使用
框架语义 class、配置入口和内部 CSS 变量。

## 暗色主题

暗色主题暂未实现。后续如需支持，应先扩展 `infinityNikkiTheme` 和项目 CSS 变量，再处理 Canvas、播放器和钢琴卷帘的对比度。
