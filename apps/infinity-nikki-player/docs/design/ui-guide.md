# UI 组件使用指南

## 技术栈

- **UI 框架**: shadcn-vue (基于 Vue 3 + Tailwind CSS)
- **组件库**: 组件代码直接复制到项目中，可自由定制
- **构建工具**: Vite
- **图标库**: lucide-vue-next (基于 Lucide Icons)

## 手势操作禁止规范

**规则**: 桌面应用中，禁止使用任何触摸手势相关的操作，包括但不限于：

- 禁止使用 `touchstart`、`touchmove`、`touchend` 事件
- 禁止使用 `pinch-zoom`、`pan` 等手势操作
- 禁止使用 `pointerdown`/`pointermove` 的手势相关属性（如 `pointerType`）
- 仅允许鼠标点击、拖拽等桌面原生交互方式

**原因**: 桌面应用不需要手势操作，手势会与正常的拖拽、滚动等操作产生冲突。

**示例**:

```vue
<!-- 错误：使用了 pointerdown 手势 -->
<Slider @pointerdown="onDragStart" />

<!-- 正确：使用原生浏览器行为 -->
<Slider @update:model-value="onValueChange" />
```

```vue
<!-- 错误：禁止手势操作 -->
<div @touchstart="handleTouch" @touchmove="handleMove" />

<!-- 正确：只处理鼠标事件 -->
<div @mousedown="handleMouseDown" />
```

## 安装组件

### shadcn-vue 组件

使用 pnpm 添加 shadcn-vue 组件：

```bash
# 初始化项目（首次）
pnpm dlx shadcn-vue@latest init --defaults

# 添加组件
pnpm dlx shadcn-vue@latest add button
pnpm dlx shadcn-vue@latest add tabs
pnpm dlx shadcn-vue@latest add card
pnpm dlx shadcn-vue@latest add badge
pnpm dlx shadcn-vue@latest add input
pnpm dlx shadcn-vue@latest add slider
pnpm dlx shadcn-vue@latest add popover
pnpm dlx shadcn-vue@latest add drawer
pnpm dlx shadcn-vue@latest add tooltip
pnpm dlx shadcn-vue@latest add sonner
```

### lucide-vue-next 图标

lucide-vue-next 已安装。如需添加新图标：

```bash
pnpm add lucide-vue-next
```

## 项目目录结构

```
src/
├── assets/
│   └── images/
│       └── logo.png      # 应用 Logo
├── components/                      # 全局组件
│   ├── PreviewPlayer/               # 试听播放器
│   │   └── index.vue
│   ├── PlayerControls.vue           # 演奏控制组件
│   └── ui/                          # shadcn-vue 全局公共组件
│       ├── button/
│       ├── card/
│       ├── tabs/
│       ├── badge/
│       ├── input/
│       ├── slider/
│       ├── popover/
│       ├── drawer/
│       ├── tooltip/
│       ├── sonner/
│       └── index.ts
├── views/
│   ├── MainWindow/                       # 主窗口（页面级组件）
│   │   ├── index.vue                     # 主窗口入口
│   │   ├── FilesTab/                     # 文件页面
│   │   │   ├── index.vue
│   │   │   └── components/
│   │   │       └── MidiLibrary/          # MIDI 列表
│   │   │           ├── index.vue
│   │   │           └── components/
│   │   │               └── MidiDetail/  # MIDI 详情
│   │   │                   └── index.vue
│   │   ├── TemplatesTab/                 # 模板页面
│   │   │   ├── index.vue
│   │   │   └── components/
│   │   │       └── TemplateEditor.vue
│   │   └── LogsTab/                      # 日志页面
│   │       ├── index.vue
│   │       └── components/
│   │           └── KeyLogPanel.vue
│   └── OverlayWindow.vue                 # 悬浮模式窗口
├── stores/
│   └── player.ts                         # 播放器状态管理
├── i18n/
│   └── locales/
│       ├── en-US.ts
│       └── zh-CN.ts
└── lib/
    ├── utils.ts                           # 工具函数
    ├── keyboardMapper.ts                   # 键盘映射器（C 大调移调、白键量化）
    └── midiPlayer.ts                      # MIDI 播放器（集成 soundfont-player 发音）
```

## lib 模块说明

### keyboardMapper.ts - 键盘映射器

**功能**：将 MIDI 音符移调并量化到 C 大调白键，然后映射到物理键盘按键。

**核心算法**：

1. **移调（Transpose）**：计算原曲主音到中央 C（60）的半音偏移量，统一移调
2. **白键量化（Quantize）**：将移调后的音符映射到最近的 C 大调自然音（C/D/E/F/G/A/B）
3. **键盘映射**：根据模板定义，将音符号映射到具体键盘按键

**使用示例**：

```typescript
import { KeyboardMapper } from '@/lib/keyboardMapper'

const mapper = new KeyboardMapper({
  rows: 5,              // 键盘行数（5 八度）
  middleCPitch: 60,     // 中央 C
  originalTonic: 60,    // 原曲主音（C 大调）
  onNoteOn: (pitch, originalPitch) => {
    // 音符按下回调，可用于发音
    pianoEngine.keyDown(pitch)
  },
  onNoteOff: (pitch, originalPitch) => {
    // 音符释放回调
    pianoEngine.keyUp(pitch)
  },
})

// 设置模板
mapper.setTemplate(template)

// 获取当前激活的按键
const activeKeys = mapper.getActiveKeys(currentTimeMs, melodyEvents)
```

### midiPlayer.ts - MIDI 播放器

**功能**：基于 midi-player-js + soundfont-player 的 MIDI 播放和钢琴发音引擎。

**特性**：

- 自动演奏模式：MIDI 播放器播放
- 模板发音模式：根据 melody 数据同步触发钢琴音符
- 支持音符按下/释放
- 共享 soundfont-player 实例

**核心 API**：

```typescript
import {
  playMidi, playNote, stopNote, stopAllNotes, ensureInstrument,
} from '@/lib/midiPlayer'
await playNote(60, 80, 1)  // C4，力度 80，持续 1 秒
stopAllNotes()
```

## 组件存放规范

### 核心原则

**组件分为三类：全局公共组件、页面级组件 和 滚动容器组件**

| 类型         | 存放位置                  | 说明                                                         |
| ------------ | ------------------------- | ------------------------------------------------------------ |
| 全局公共组件 | `components/ui/`          | 可在项目任何位置使用的组件，如 shadcn-vue 组件、业务公共组件 |
| 页面级组件   | `views/xxx/`              | 仅属于特定页面的组件，不可跨页面复用                         |
| 滚动容器组件 | `ScrollableContainer.vue` | 统一管理页面滚动、返回顶部、刷新按钮的容器组件               |

| 类型         | 存放位置         | 说明                                                         |
| ------------ | ---------------- | ------------------------------------------------------------ |
| 全局公共组件 | `components/ui/` | 可在项目任何位置使用的组件，如 shadcn-vue 组件、业务公共组件 |
| 页面级组件   | `views/xxx/`     | 仅属于特定页面的组件，不可跨页面复用                         |

### 目录组织规则

**规则 1：有子组件的页面必须使用文件夹结构**

```
# 错误：页面与子组件同名且同级
views/
├── MainWindow.vue      # 页面
└── MainWindow.vue      # 子组件（同名，错误！）

# 正确：页面使用文件夹，子组件放入 components
views/
└── MainWindow/
    ├── index.vue           # 页面入口
    └── components/        # 子组件目录
        └── xxx.vue        # 子组件
```

**规则 2：组件命名遵循小驼峰**

```
views/
└── MainWindow/
    ├── index.vue
    └── components/
        ├── filesTab.vue       # 错误： kebab-case
        ├── FilesTab.vue        # 错误： PascalCase（除非是全局组件）
        └── files-tab.vue       # 错误： kebab-case
        └── FilesTab.vue        # 正确： PascalCase（页面级组件）
```

**规则 3：嵌套层级**

页面组件可以继续拆分更小的子组件，遵循相同规则：

```
src/
├── components/                      # 全局组件（可在任何页面复用）
│   ├── PreviewPlayer/
│   │   └── index.vue               # 试听播放器（可能在悬浮窗调用）
│   └── PlayerControls.vue          # 演奏控制（可能在悬浮窗调用）
│
└── views/
    └── MainWindow/                  # 主窗口（页面级）
        ├── index.vue                 # 主窗口布局
        │
        ├── FilesTab/                 # 文件页面
        │   ├── index.vue
        │   └── components/          # 子组件
        │       └── MidiLibrary/      # 继续拆分的子模块
        │           ├── index.vue
        │           └── components/   # 子子组件
        │               └── MidiDetail/
        │                   └── index.vue
        │
        ├── TemplatesTab/
        │   ├── index.vue
        │   └── components/
        │       └── TemplateEditor.vue
        │
        └── LogsTab/
            ├── index.vue
            └── components/
                └── KeyLogPanel.vue
```

**嵌套判定**：当组件是特定页面的子模块，且该子模块还有更小的子组件时，继续使用相同规则（文件夹 + components 子目录）。

### 示例：创建新页面组件

假设需要创建一个新的「设置」页面：

```bash
# 1. 创建目录结构
views/
└── Settings/
    ├── index.vue          # 设置页面入口
    └── components/        # 设置页面的子组件
        ├── GeneralTab.vue
        └── AdvancedTab.vue
```

```vue
<!-- views/Settings/index.vue -->
<script setup lang="ts">
import GeneralTab from './components/GeneralTab.vue'
import AdvancedTab from './components/AdvancedTab.vue'
</script>

<template>
  <div class="settings">
    <GeneralTab />
    <AdvancedTab />
  </div>
</template>
```

### 判定标准：何时应该创建文件夹

满足以下任一条件时，应该创建文件夹：

1. 页面有 2 个或以上的子组件
2. 组件内部需要进一步拆分
3. 组件与其他组件有明显的上下级关系

### 全局公共组件判定

满足以下条件时，应该放在 `components/` 目录：

1. 可在项目任意位置复用
2. 不与特定页面绑定
3. 独立功能，可抽离

**示例**：

- `components/ui/` 下的所有 shadcn-vue 组件（Button、Card 等）
- 工具类组件（Tooltip、Popover 等）
- 业务公共组件（如 `PreviewPlayer`、`PlayerControls` 等可能在悬浮窗等场景调用）

## shadcn-vue 组件结构

```
src/components/ui/
├── button/          # 按钮组件
│   ├── Button.vue
│   └── index.ts
├── card/            # 卡片组件
│   ├── Card.vue
│   ├── CardHeader.vue
│   ├── CardTitle.vue
│   ├── CardContent.vue
│   └── index.ts
├── tabs/            # 标签页组件
│   ├── Tabs.vue
│   ├── TabsList.vue
│   ├── TabsTrigger.vue
│   ├── TabsContent.vue
│   └── index.ts
├── badge/           # 徽章组件
│   ├── Badge.vue
│   └── index.ts
├── input/           # 输入框组件
│   ├── Input.vue
│   └── index.ts
├── slider/          # 滑块组件
│   ├── Slider.vue
│   └── index.ts
├── popover/         # 弹出框组件
│   ├── Popover.vue
│   ├── PopoverTrigger.vue
│   ├── PopoverContent.vue
│   ├── PopoverAnchor.vue
│   └── index.ts
├── drawer/          # 抽屉组件
│   ├── Drawer.vue
│   ├── DrawerTrigger.vue
│   ├── DrawerContent.vue
│   ├── DrawerHeader.vue
│   ├── DrawerTitle.vue
│   ├── DrawerFooter.vue
│   ├── DrawerClose.vue
│   ├── DrawerOverlay.vue
│   ├── DrawerDescription.vue
│   └── index.ts
└── index.ts         # barrel export
```

## 导入方式

推荐从 `@/components/ui` 导入所有组件：

```vue
<script setup lang="ts">
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Badge,
  Input,
  Slider,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Drawer,
  DrawerContent,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'
</script>
```

## Button 按钮

```vue
<template>
  <!-- 默认按钮 -->
  <Button>Default</Button>

  <!-- 变体 -->
  <Button variant="outline">Outline</Button>
  <Button variant="secondary">Secondary</Button>
  <Button variant="destructive">Destructive</Button>
  <Button variant="ghost">Ghost</Button>
  <Button variant="link">Link</Button>

  <!-- 尺寸 -->
  <Button size="sm">Small</Button>
  <Button size="lg">Large</Button>
  <Button size="icon">Icon</Button>
</template>
```

## Tabs 标签页

```vue
<template>
  <Tabs v-model="activeTab">
    <TabsList>
      <TabsTrigger value="tab1">Tab 1</TabsTrigger>
      <TabsTrigger value="tab2">Tab 2</TabsTrigger>
    </TabsList>
    <TabsContent value="tab1">Content 1</TabsContent>
    <TabsContent value="tab2">Content 2</TabsContent>
  </Tabs>
</template>

<script setup>
const activeTab = ref('tab1')
</script>
```

## Card 卡片

```vue
<template>
  <Card>
    <CardHeader>
      <CardTitle>Card Title</CardTitle>
    </CardHeader>
    <CardContent>
      Card content here
    </CardContent>
  </Card>
</template>
```

## Badge 徽章

```vue
<template>
  <Badge>Default</Badge>
  <Badge variant="secondary">Secondary</Badge>
  <Badge variant="destructive">Destructive</Badge>
  <Badge variant="outline">Outline</Badge>
</template>
```

## Input 输入框

```vue
<template>
  <Input type="text" placeholder="Enter text..." />
  <Input type="email" placeholder="email@example.com" />
</template>
```

## Slider 滑块

```vue
<template>
  <Slider
    v-model="[value]"
    :min="0"
    :max="100"
    :step="1"
  />
</template>

<script setup>
const value = ref([50])
</script>
```

## Popover 弹出框

Popover 需要使用 `PopoverTrigger` 和 `PopoverContent` 子组件：

```vue
<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="outline">打开菜单</Button>
    </PopoverTrigger>
    <PopoverContent class="w-40 p-1" align="end">
      <button class="menu-action">删除</button>
    </PopoverContent>
  </Popover>
</template>
```

**注意**：

- 使用 `as-child` 让 Trigger 包裹的按钮保留其原始行为
- `PopoverContent` 的 `w-40` 设置宽度，`p-1` 设置内边距
- `align="end"` 让弹出框右对齐

## Drawer 抽屉

```vue
<template>
  <Drawer :open="isOpen" @close="isOpen = false">
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>标题</DrawerTitle>
        <DrawerDescription>描述文字</DrawerDescription>
      </DrawerHeader>
      <div class="p-4">
        抽屉内容
      </div>
      <DrawerFooter>
        <DrawerClose as-child>
          <Button variant="outline">取消</Button>
        </DrawerClose>
        <Button>确认</Button>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>

<script setup>
const isOpen = ref(false)
</script>
```

## cn 工具函数

用于合并 Tailwind CSS 类名：

```typescript
import { cn } from '@/lib/utils'

// 基础用法
const className = cn('text-red-500', 'bg-blue-500')

// 条件合并
const className = cn('text-red-500', isActive && 'bg-primary')

// 覆盖样式
const className = cn('px-4 py-2', className)
```

## 自定义样式类

项目在 `style.css` 中定义了额外的工具类（在 `@layer components` 中）：

| 类名                | 说明               |
| ------------------- | ------------------ |
| `.bg-gradient-warm` | 温暖的粉色渐变背景 |
| `.glass`            | 玻璃态效果         |
| `.glass-subtle`     | 淡玻璃态效果       |
| `.shadow-soft`      | 柔和粉色阴影       |
| `.shadow-card`      | 卡片阴影           |
| `.border-subtle`    | 柔和粉色边框       |

**注意**: 在 Vue scoped styles 中使用 `@apply` 时，无法引用全局定义的工具类。如需使用，应直接在模板的 class 属性中添加类名：

```vue
<!-- 正确做法：在模板中使用类名 -->
<template>
  <div class="main-window bg-gradient-warm">
    ...
  </div>
</template>

<style scoped>
.main-window {
  @apply h-screen flex flex-col text-foreground overflow-hidden;
}
</style>
```

## 国际化使用

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui'

const { t } = useI18n()
</script>

<template>
  <Button>{{ t('actions.save') }}</Button>
</template>
```

翻译 key 格式：`section.key`，例如 `player.status.playing`

## 设计原则

1. **组件优先**: 优先使用 shadcn-vue 提供的组件，而非自定义
2. **直接修改源码**: shadcn-vue 的组件代码在项目中，可以直接修改
3. **Tailwind 工具类**: 使用 Tailwind CSS 的工具类进行样式定制
4. **CSS 变量**: 使用 `hsl()` 函数的 CSS 变量保持主题一致性

## lucide-vue-next 图标使用

图标库已集成到项目中，使用方式如下：

### 安装新图标

所有图标均为按需导入，无需额外安装：

```bash
# lucide-vue-next 已预装
pnpm add lucide-vue-next
```

### 基本用法

```vue
<script setup lang="ts">
import { Music, Play, Pause, Trash2 } from 'lucide-vue-next'
</script>

<template>
  <!-- 基础图标 -->
  <Music :size="24" />

  <!-- 带样式 -->
  <Play :size="20" class="text-pink-500" />

  <!-- 在按钮中使用 -->
  <Button>
    <Pause :size="16" />
    暂停
  </Button>
</template>
```

### 常用图标映射

| 场景   | 图标 | 导入名         |
| ------ | ---- | -------------- |
| 音乐   | ♪    | `Music`        |
| 播放   | ▶    | `Play`         |
| 暂停   | ⏸    | `Pause`        |
| 停止   | ⏹    | `Square`       |
| 文件   | 📄   | `FileText`     |
| 文件夹 | 📁   | `Folder`       |
| 上传   | ⬆    | `Upload`       |
| 删除   | 🗑   | `Trash2`       |
| 时钟   | 🕐   | `Clock`        |
| 键盘   | ⌨    | `Keyboard`     |
| 警告   | ⚠    | `AlertCircle`  |
| 显示器 | 🖥   | `Monitor`      |
| 布局   | ▦    | `LayoutGrid`   |
| 更多   | ⋮    | `MoreVertical` |
| 右箭头 | →    | `ArrowRight`   |
| 加     | +    | `Plus`         |
| 减     | −    | `Minus`        |

### Props 参数

| 参数                  | 类型      | 默认值       | 说明         |
| --------------------- | --------- | ------------ | ------------ |
| `size`                | `number`  | 24           | 图标尺寸     |
| `color`               | `string`  | currentColor | 图标颜色     |
| `stroke-width`        | `number`  | 2            | 线条粗细     |
| `absoluteStrokeWidth` | `boolean` | false        | 绝对线条粗细 |

### 搜索图标

访问 https://lucide.dev/icons 搜索可用图标。

## Tooltip 文本提示

用于展示超长文本的完整内容。

### 安装

```bash
pnpm dlx shadcn-vue@latest add tooltip
```

### 使用方式

```vue
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger as-child>
      <span class="line-clamp-2">超长的文件名可能会被截断</span>
    </TooltipTrigger>
    <TooltipContent>
      <p>超长的文件名可能会被截断</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

## 文本超长处理规范

**规则**: 当文本可能超出容器宽度或显示行数时，必须同时满足以下条件：

1. 使用 Tailwind CSS 的 `truncate`（单行截断）或 `line-clamp-*`（多行截断）限制显示
2. 外层包裹 `Tooltip` 组件，鼠标悬停时显示完整文本

**示例场景**:

- 文件名列表项（单行截断 + Tooltip）
- 详情页标题（多行截断 + Tooltip）
- 任何用户输入的文本内容

**正确示例**:

```vue
<!-- 单行截断 + Tooltip -->
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger as-child>
      <span class="truncate">{{ filename }}</span>
    </TooltipTrigger>
    <TooltipContent>
      <p>{{ filename }}</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>

<!-- 多行截断 + Tooltip -->
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger as-child>
      <div class="line-clamp-2">{{ title }}</div>
    </TooltipTrigger>
    <TooltipContent>
      <p>{{ title }}</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**错误示例**:

```vue
<!-- 只有截断，没有 Tooltip -->
<span class="truncate">{{ filename }}</span>

<!-- 只有 Tooltip，没有截断 -->
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger as-child>
      <span>{{ filename }}</span>
    </TooltipTrigger>
    <TooltipContent>
      <p>{{ filename }}</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

## Sonner 错误提示

用于向用户展示操作结果和错误信息。

### 安装

```bash
pnpm dlx shadcn-vue@latest add sonner
```

### 全局配置

在 `App.vue` 中添加 Toaster 组件：

```vue
<script setup lang="ts">
import { Toaster } from '@/components/ui'
</script>

<template>
  <YourApp />
  <Toaster rich-colors />
</template>
```

> 注意：`rich-colors` 属性会让 toast 根据类型（success/error/warning/info）显示不同的颜色主题。

### 使用方式

```typescript
import { toast } from 'vue-sonner'

// 成功提示
toast.success('保存成功', { richColors: true })

// 错误提示
toast.error('操作失败', { description: '文件不存在', richColors: true })

// 其他类型
toast.warning('警告', { richColors: true })
toast.info('提示', { richColors: true })
```

> 注意：每次调用 `toast` 时都需要传入 `richColors: true` 才能显示颜色。

## 错误处理规范

### 规则

所有 `try-catch` 中的错误处理必须同时满足：

1. **控制台输出**：`console.error()` 打印完整错误信息便于调试
2. **用户提示**：使用 `toast.error()` 向用户展示错误信息，并添加 `richColors: true`

### 正确示例

```typescript
try {
  await someOperation()
} catch (e) {
  toast.error('操作失败', { description: String(e) })
  console.error('操作失败:', e)
}
```

### 错误示例

```typescript
// 只打印控制台，用户不知道发生了什么
try {
  await someOperation()
} catch (e) {
  console.error('操作失败:', e)
}

// 只弹 toast，控制台没有记录
try {
  await someOperation()
} catch (e) {
  toast.error('操作失败', { description: String(e) })
}
```

## ScrollableContainer 滚动容器组件

### 组件说明

`ScrollableContainer` 是一个统一管理页面滚动、返回顶部按钮和刷新按钮的容器组件。

### 功能特性

1. **接管内部滚动** - 组件内部的 `<slot />` 内容使用独立的滚动区域
2. **返回顶部按钮** - 滚动超过 200px 时自动显示，点击平滑滚动到顶部
3. **刷新按钮** - 固定在右下角，点击刷新整个页面

### 使用规范

**规则**: 所有需要滚动的页面，必须使用 `ScrollableContainer` 包裹内容，禁止在页面根部使用 `overflow: auto`。

### 基本用法

```vue
<script setup lang="ts">
import ScrollableContainer from '@/components/ScrollableContainer.vue'
</script>

<template>
  <ScrollableContainer>
    <div class="page-content">
      <!-- 页面内容 -->
    </div>
  </ScrollableContainer>
</template>
```

### 样式适配

如果父元素是弹性布局，确保父元素不会限制 `ScrollableContainer` 的高度：

```vue
<!-- 错误：flex 父元素可能限制高度 -->
<div class="flex-1 overflow-hidden">
  <ScrollableContainer>
    <!-- 内容无法滚动 -->
  </ScrollableContainer>
</div>

<!-- 正确：父元素需要限制滚动区域 -->
<div class="flex-1 overflow-hidden">
  <ScrollableContainer class="h-full">
    <!-- ScrollableContainer 会填满父元素 -->
  </ScrollableContainer>
</div>
```

### 组件结构

```
ScrollableContainer/
└── index.vue          # 滚动容器组件

浮动按钮组（fixed 定位）:
├── 返回顶部按钮      # 滚动 > 200px 显示
└── 刷新页面按钮     # 始终显示
```

### 技术细节

- 滚动检测使用 `passive` 事件监听优化性能
- 返回顶部使用 `scrollTo({ top: 0, behavior: 'smooth' })` 实现平滑滚动
- 刷新使用 `window.location.reload()`
- 浮动按钮使用 CSS `fixed` 定位，`bottom` 和 `right` 可通过 CSS 变量自定义
