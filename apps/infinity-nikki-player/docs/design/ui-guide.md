# UI 组件使用指南

## 安装组件

使用 CLI 添加 shadcn-vue 组件：

```bash
npx shadcn-vue@latest add button
npx shadcn-vue@latest add tabs
npx shadcn-vue@latest add card
```

## Button 按钮

```vue
<script setup lang="ts">
import { Button } from '@/components/ui'
</script>

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
<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui'
</script>

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
```

## Card 卡片

```vue
<script setup lang="ts">
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
</script>

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

## Input 输入框

```vue
<script setup lang="ts">
import { Input } from '@/components/ui'
</script>

<template>
  <Input type="text" placeholder="Enter text..." />
</template>
```

## Badge 徽章

```vue
<script setup lang="ts">
import { Badge } from '@/components/ui'
</script>

<template>
  <Badge>Default</Badge>
  <Badge variant="secondary">Secondary</Badge>
  <Badge variant="destructive">Destructive</Badge>
  <Badge variant="outline">Outline</Badge>
</template>
```

## cn 工具函数

用于合并 Tailwind CSS 类名：

```typescript
import { cn } from '@/lib/utils'

const className = cn('text-red-500', isActive && 'bg-primary')
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
