# Antdv Next UI 规范

## 禁止按视觉变体复制整段模板

同一个控件在不同场景中只允许保留一套组件结构，通过 props、computed class、CSS 变量或小型子组件切换视觉状态。

禁止为正常模式、悬浮模式、桌面、移动、启用、禁用等视觉差异复制两份功能相同的 DOM。例如同一个播放按钮不能同时维护一份框架 `Button` 和一份原生 `button`。

允许拆分的前提是交互语义确实不同，例如一个是菜单触发器、另一个是拖拽句柄；否则应统一为一个组件。

## 框架弹层内容规范

Antdv Next 的 `Modal`、`Popover`、`Drawer` 已经提供背景、边框、圆角和阴影。弹层内部内容不得重复添加整块白底、外边框或外阴影，只保留必要的内部间距、分隔线和内容排版。

弹层内容文字必须满足浅粉背景下的可读性：正文使用 `--color-foreground`，辅助信息优先使用 `--color-muted-dark`，避免大面积使用过浅的灰色。

## 按钮和图标

所有 Antdv Next `Button` 的图标必须使用 `#icon` 插槽，并给图标设置明确的宽高和 `stroke-width`，避免框架默认图标尺寸导致视觉过小。

普通描边操作按钮统一使用 `.nikki-outline-btn`。hover 和 focus 状态必须填充品牌渐变背景，并将文字和图标切换为白色。

## 首页视图切换

首页文件和模板这种同级视图切换使用 `RadioGroup` + `RadioButton`，不要再使用 `Tabs`。切换控件仍然放在 sticky 工具栏左侧，右侧保留同一行的文件操作按钮。

`RadioButton` 内可以保留图标，但图标和文字必须放在同一个 label 容器里，保证垂直居中和点击区域稳定。

## Select 和滚动

Antdv Next `Select` 必须使用 `options` 或合法的 `SelectOption` 结构，不能只写空壳组件。

在悬浮窗等受尺寸限制的容器中，`Select` 下拉层必须通过 `list-height` 和 popup class 限制高度，让选项在下拉层内部滚动，避免被窗口边界截断。

所有框架滚动区域的滚动条颜色要和主界面保持一致，Select 下拉、Table body 等都使用统一的粉色滚动条样式。

## Table 布局

模板列表等占据剩余空间的页面，应让外层布局负责分配高度，`Table` 通过 `scroll.y` 在表格内部滚动。

需要固定表头或操作列时，使用 Antdv Next `Table` 的 `scroll`、`fixed` 和列配置，不要手写外层 overflow 来模拟固定效果。
