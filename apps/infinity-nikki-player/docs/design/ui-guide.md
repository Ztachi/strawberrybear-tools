# UI 组件使用指南

## 技术栈

- **UI 框架**: shadcn-vue (基于 Vue 3 + Tailwind CSS)
- **组件库**: 组件代码直接复制到项目中，可自由定制
- **构建工具**: Vite
- **图标库**: lucide-vue-next (基于 Lucide Icons)

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
├── components/
│   ├── ui/               # shadcn-vue 组件
│   │   ├── button/
│   │   ├── card/
│   │   ├── tabs/
│   │   ├── badge/
│   │   ├── input/
│   │   ├── slider/
│   │   ├── popover/
│   │   ├── drawer/
│   │   └── index.ts
│   ├── MidiLibrary.vue   # MIDI 文件列表
│   ├── MidiDetail.vue    # MIDI 详情面板
│   ├── PlayerControls.vue # 播放控制组件
│   ├── KeyLogPanel.vue   # 按键日志面板
│   └── TemplateEditor.vue # 模板编辑器
├── views/
│   ├── MainWindow.vue    # 主窗口
│   └── OverlayWindow.vue # 悬浮模式窗口
├── stores/
│   └── player.ts         # 播放器状态管理
├── i18n/
│   └── locales/
│       ├── en-US.ts
│       └── zh-CN.ts
└── lib/
    └── utils.ts          # 工具函数
```

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
