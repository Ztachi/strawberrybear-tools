# 主题和样式规范

## 品牌色彩

项目主色调为 `#F7C0C1`（淡粉色），源自游戏《无限暖暖》的清新可爱风格。

## CSS 变量

在 `src/style.css` 中定义的主题变量：

```css
:root {
  /* 主色调 */
  --primary: 350 89% 80%;        /* #F7C0C1 */

  /* 背景色（暗色主题） */
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;

  /* 卡片 */
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;

  /* 次要色 */
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;

  /* 强调色 */
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;

  /* 状态色 */
  --destructive: 0 62.8% 30.6%;

  /* 边框 */
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  --ring: 350 89% 80%;

  /* 圆角 */
  --radius: 0.5rem;
}
```

## Tailwind CSS 使用

### 基础类名

```html
<!-- 背景 -->
<div class="bg-background text-foreground">

<!-- 卡片 -->
<div class="bg-card text-card-foreground">

<!-- 主色调 -->
<button class="bg-primary text-primary-foreground">

<!-- 边框 -->
<div class="border">
```

### 自定义色彩

在 `tailwind.config.js` 中配置了 HSL 变量映射：

```js
colors: {
  primary: {
    DEFAULT: 'hsl(var(--primary))',
    foreground: 'hsl(var(--primary-foreground))',
  },
  background: 'hsl(var(--background))',
  // ...
}
```

## 暗色主题

项目默认使用暗色主题，所有组件自动适配。背景色为深灰蓝色系，文字为高对比度白色。

## 响应式设计

使用 Tailwind 的响应式前缀：

```html
<div class="flex flex-col sm:flex-row">
  <!-- 移动端垂直排列，桌面端水平排列 -->
</div>
```
