# DQ7 对对碰洗牌记录工具

> Dragon Quest VII 珍爱之物对对碰卡牌顺序记录工具

## 项目概述

纯模块化 JS/TS 开发，使用 Vite 8 构建，全部打包进单个 HTML 文件。适配现有 pnpm monorepo 架构。

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建所有项目
pnpm build

# 开发单个项目
cd apps/dq7-shuffle && pnpm dev
```

## 难度配置

| 难度 | 中文 | 英文 | 列数 | 行数 | 总格数 |
|------|------|------|------|------|--------|
| Easy | 简单 | Easy | 4 | 3 | 12 |
| Normal | 普通 | Normal | 4 | 4 | 16 |
| Hard | 困难 | Hard | 5 | 4 | 20 |
| Expert | 超难 | Expert | 6 | 4 | 24 |

## 游戏阶段

### 定义阶段（Define Phase）

**目的**：记录玩家当前 DQ7 珍爱之物对对碰的卡牌顺序。

**行为规则**：

1. 网格初始显示空白背面占位格
2. 用户依次点击空格子，程序自动循环分配普通图案
   - 第 1、2 格：相同图案（数字 `1`）
   - 第 3、4 格：相同图案（数字 `2`）
   - 依此类推...
3. 最后两格自动填充特殊卡：
   - **倒数第2格**：五角星 ⭐（黄色背景 `#FFD700` 高亮）
   - **倒数第1格**：小丑 🃏（红色背景 `#FF4757` 高亮）
4. 点击已填充格子 → 无反应
5. 顶部显示「已点击格子数 / 总格子数」
6. **全部格子填满后** → 自动进入交换阶段，并保存初始布局快照

### 交换阶段（Exchange Phase）

**目的**：用户在游戏中完成洗牌后，在此工具中实时交换卡牌位置，复原成洗牌后的最终顺序。

## 三套独立交互模式

> 三种交互模式共享同一份卡片数组和交换逻辑，但选择状态完全独立，互不影响。

### 交互A：拖拽交换（Drag & Drop）

- 任意卡片均可拖动
- 拖动时该卡片 `scale(1.1) rotate(2deg)` + 阴影加深
- 悬停目标卡片时，目标卡片轻微放大 `scale(1.08)` 提示可放置
- 释放瞬间完成交换，动画过渡（80ms ease-out）

### 交互B：点击交换（Click Swap）

- 点击第一张卡片 → 该卡蓝色边框高亮（`#3498DB`），进入已选中状态
- 点击第二张卡片 → 两卡立即交换，选中态清除
- 点击已选中的同一张卡 → 取消选中

### 交互C：键盘悬停交换（Keyboard Hover Swap）

- 用户通过鼠标悬停（hover）在卡片上移动焦点
- 按下 `Space` 或 `Enter` → 对「当前悬停的卡片」执行选中/交换
  - 当前无键盘选中 → 悬停卡进入键盘选中态（白色边框 `#FFFFFF` 高亮）
  - 当前已有键盘选中 → 将已选中卡与悬停卡交换，然后清除键盘选中态
  - 若两次按 Space 的是同一张卡 → 取消键盘选中态

## 选中态视觉区分

| 交互方式 | 选中边框色 | 边框样式 |
|----------|-----------|----------|
| 点击选中 | `#3498DB`（蓝色） | `2px solid` |
| 键盘悬停选中 | `#FFFFFF`（白色） | `2px solid` |
| 拖拽中 | - | 旋转 + 阴影加深 |

## 阶段切换

| 触发条件 | 行为 |
|----------|------|
| 定义阶段：全部格子填满 | 自动进入交换阶段，保存初始快照 |
| 任意阶段：点击「重置」 | 清空网格，回到定义阶段，难度不变 |
| 任意阶段：切换难度 Tab | 清空网格，回到定义阶段，新难度生效 |

## 国际化

**检测规则**：`window.location.pathname` 包含 `/en` → 英文（en-US），否则默认中文（zh-CN）。

## SEO

### 中文页面（根路径 `/`）

- title: DQ7 对对碰洗牌记录工具 - 珍爱之物卡牌顺序记录
- keywords: DQ7,DQ7对对碰,珍爱之物对对碰,洗牌记录,卡牌顺序,龙之勇士,游戏工具,对对碰,DQ7珍爱之物,卡牌交换,DQ7记忆卡片,DQ7卡牌工具

### 英文页面（`/en` 路径）

- title: DQ7 Memory Match Shuffle Recorder - Card Sequence Tracker
- keywords: DQ7,DQ7 memory match,Fragments of a Dream,shuffle recorder,card sequence,Dragon Quest VII,memory game tool,card swap tracker,DQ7 card game,DQ7 fragment

## 项目结构

```
apps/dq7-shuffle/
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.ts         # 入口
    ├── game.ts         # 游戏核心状态
    ├── dom.ts          # DOM 渲染与事件
    ├── drag.ts         # 拖拽交互
    ├── i18n.ts         # 国际化
    ├── constants.ts    # 难度配置
    └── style.css       # 样式与动画
```

## 模块职责

| 模块 | 职责 |
|------|------|
| `constants.ts` | 难度配置常量、卡片图案常量 |
| `i18n.ts` | 语言包对象（zh-CN / en-US）、当前语言检测 |
| `game.ts` | 核心状态（phase/cards/三套选择态）、交换逻辑 |
| `dom.ts` | DOM 渲染、点击事件、键盘事件（Space/Enter） |
| `drag.ts` | 原生拖拽 API 封装、拖拽状态管理 |
| `style.css` | 全局样式、动画 |
| `main.ts` | 入口，初始化游戏 |
