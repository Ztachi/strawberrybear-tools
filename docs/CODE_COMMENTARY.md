# 代码注释规范

本规范定义了所有代码注释的标准格式和要求，以确保代码的可读性、可维护性和团队协作效率。

---

## 1. 规范目的

- **提高可读性**：让其他开发者（包括未来的自己）能快速理解代码意图
- **便于维护**：减少因理解代码而花费的时间，降低引入 bug 的风险
- **文档同步**：注释与代码保持一致，避免误导
- **知识沉淀**：记录设计决策、业务逻辑和特殊处理

---

## 2. 文件级注释

每个源代码文件开头应包含文件级注释，说明文件的用途、作者、创建时间等基本信息。

### 2.1 TypeScript / JavaScript 文件

```typescript
/**
 * @fileOverview 文件功能简述
 * @description 文件详细描述（可选）
 * @author 作者名 <邮箱>
 * @date YYYY-MM-DD
 * @lastModified 最后修改日期
 * @module 模块名（可选）
 */
```

### 2.2 Vue 单文件组件

```vue
<script setup lang="ts">
/**
 * @description: 组件名称 - 功能简述
 * @description 组件详细描述（可选）
 */
</script>
```

### 2.3 Rust 文件

```rust
//! @fileOverview 文件功能简述
//!
//! 文件详细描述（可选）
//!
//! @author 作者名
//! @date YYYY-MM-DD

mod module_name; // 模块简述
```

---

## 3. 函数/方法注释

函数注释是最重要的注释类型，必须完整包含所有参数和返回值信息。

### 3.1 TypeScript / JavaScript / Vue（JSDoc 格式）

```typescript
/**
 * @description: 函数功能简述（必填，一行描述）
 * @description 函数详细描述（可选，多行详细说明）
 * @param {参数类型} 参数名 - 参数说明（必填，每个参数都要）
 * @param {Object} options - 配置对象
 * @param {string} options.name - 名称
 * @param {number} [options.age] - 年龄（可选参数用 [参数名] 标记）
 * @return {返回值类型} 返回值说明（必填）
 * @return {Promise<void>} 无返回值时写 void
 * @example
 * // 示例（可选）
 * myFunction('input', { name: 'test' })
 */
function myFunction(param1: string, options: { name: string; age?: number }): Promise<boolean> {
  // ...
}
```

### 3.2 简化的函数头注释（适用于简单函数）

```typescript
/** 简单的功能描述 */
/** 获取用户信息 @param {string} userId - 用户ID @return {User | null} 用户信息或null */
function getUser(userId: string): User | null { ... }
```

### 3.3 Rust 函数

````rust
/// @description: 函数功能简述
///
/// 详细描述（可选）
///
/// # Arguments
///
/// * `param1` - 参数1说明
/// * `options` - 配置选项
///
/// # Returns
///
/// 返回值说明
///
/// # Examples
///
/// ```rust
/// let result = my_function("input");
/// ```
pub fn my_function(param1: &str, options: Config) -> Result<bool, Error> {
    // ...
}
````

### 3.4 React / Vue 组件 Props

```typescript
/**
 * @description: 组件属性说明
 * @param {string} title - 弹窗标题
 * @param {boolean} [open] - 是否显示（可选）
 * @param {() => void} onClose - 关闭回调
 */
defineProps<{
  title: string
  open?: boolean
  onClose: () => void
}>()
```

---

## 4. 类型/接口/类注释

### 4.1 TypeScript 类型定义

```typescript
/**
 * @description: 接口/类型名称简述
 * @description 详细描述（可选）
 */
interface UserInfo {
  /** 用户ID */
  id: string
  /** 用户名 */
  name: string
  /** 年龄（可选） */
  age?: number
}

/**
 * @description: 枚举说明
 */
enum Status {
  /** 空闲状态 */
  Idle = 'idle',
  /** 播放中 */
  Playing = 'playing',
  /** 已暂停 */
  Paused = 'paused',
}
```

### 4.2 Rust 结构体

```rust
/// @description: 结构体简述
///
/// 详细描述
pub struct Config {
    /// 配置名称
    pub name: String,
    /// 超时时间（毫秒）
    pub timeout_ms: u64,
}
```

---

## 5. 行内注释

行内注释用于解释复杂逻辑、特殊处理或非显而易见的代码。

### 5.1 基本格式

```typescript
// 这是单行注释（用于解释下一行或当前行）

// 复杂的条件判断应注释
if (user.isActive && user.permissions.includes('admin')) {
  // 如果用户激活且拥有管理员权限，则...
}

// 重要变量应注释
const MAX_RETRY_COUNT = 3 // 最大重试次数

// 算法步骤应分步注释
const steps = [
  1, // 步骤1：解析输入
  2, // 步骤2：验证数据
  3, // 步骤3：保存结果
]
```

### 5.2 注释位置规则

| 情况         | 注释位置           | 示例                         |
| ------------ | ------------------ | ---------------------------- |
| 行末注释     | 与代码同行，空格后 | `const max = 100 // 最大值`  |
| 块级注释     | 代码块上方         | `// 处理用户数据` + 代码块   |
| 行内复杂逻辑 | 上方或同行         | `// 超时时间需要转换` + 代码 |

### 5.3 禁止的注释方式

```typescript
// ❌ 不要写无意义的注释
let x = 10 // 赋值

// ❌ 不要用注释取消代码，使用 git
// if (disabled) {
//   doSomething()
// }

// ❌ 不要写废话注释
// 循环处理每个元素
for (const item of items) { ... }

// ✅ 应该直接写
items.forEach(item => { ... })

// ❌ 避免过度注释
// 定义变量 i，初始值为 0
// i 小于 10 时继续循环
// 每次循环结束后 i 加 1
for (let i = 0; i < 10; i++) { ... }
```

---

## 6. 关键逻辑注释

对于复杂算法、业务逻辑或容易出错的地方，必须添加详细注释。

### 6.1 算法注释

```typescript
/**
 * @description: 二分查找算法
 * @param {number[]} sortedArray - 已排序数组
 * @param {number} target - 目标值
 * @return {number} 目标值的索引，未找到返回 -1
 */
function binarySearch(sortedArray: number[], target: number): number {
  let left = 0
  let right = sortedArray.length - 1

  while (left <= right) {
    // 中间位置，避免溢出的写法
    const mid = Math.floor(left + (right - left) / 2)

    if (sortedArray[mid] === target) {
      return mid
    } else if (sortedArray[mid] < target) {
      // 中间值小于目标，搜索右半部分
      left = mid + 1
    } else {
      // 中间值大于目标，搜索左半部分
      right = mid - 1
    }
  }

  return -1 // 未找到
}
```

### 6.2 业务逻辑注释

```typescript
/**
 * @description: 处理支付逻辑
 * @param {Order} order - 订单信息
 * @return {Promise<PaymentResult>} 支付结果
 */
async function processPayment(order: Order): Promise<PaymentResult> {
  // 1. 验证订单状态（只有待支付才能继续）
  if (order.status !== 'pending') {
    throw new Error('订单状态不允许支付')
  }

  // 2. 检查库存（避免超卖）
  const available = await checkInventory(order.items)
  if (!available) {
    return { success: false, reason: '库存不足' }
  }

  // 3. 冻结库存（分布式锁保证原子性）
  await freezeInventory(order.id)

  try {
    // 4. 调用支付网关
    const result = await paymentGateway.charge(order)

    // 5. 支付成功，扣减库存并更新订单
    await deductInventory(order.items)
    await updateOrderStatus(order.id, 'paid')

    return { success: true, transactionId: result.id }
  } catch (error) {
    // 6. 失败时释放冻结的库存
    await releaseInventory(order.id)
    throw error
  }
}
```

---

## 7. 常量和配置注释

```typescript
/** 支持的 MIDI 文件扩展名 */
const MIDI_EXTENSIONS = new Set(['mid', 'midi'])

/**
 * C 大调白键相对于 C 的半音偏移量
 * C=0, D=2, E=4, F=5, G=7, A=9, B=11
 */
const WHITE_KEY_SEMITONE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]

/** 默认播放速度 */
const DEFAULT_SPEED = 1.0

/** 最大日志条目数（超过后自动清理旧条目） */
const MAX_LOG_ENTRIES = 50
```

---

## 8. TODO 和标记注释

```typescript
// TODO: 优化性能 - 考虑使用 Web Worker
// FIXME: 当前实现在高并发下有竞态条件
// HACK: 临时解决方案，后续需要重构
// NOTE: 这里的实现依赖于第三方库的内部行为
```

---

## 9. 注释同步规则

1. **代码变更时必须更新注释**
   - 修改了函数逻辑 → 更新函数注释
   - 修改了参数 → 更新 @param
   - 修改了返回值 → 更新 @return

2. **禁止注释与代码不一致**
   - 如果修改了实现而无法同步注释，宁可删除错误注释

3. **代码审查时检查注释**
   - PR/代码审查时应检查注释的完整性和准确性

---

## 10. 工具和自动化

### 10.1 TypeScript 配置

在 `tsconfig.json` 中启用严格模式，帮助 IDE 生成更好的注释提示：

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  }
}
```

### 10.2 ESLint 规则

可使用以下 ESLint 插件帮助规范注释：

- `eslint-plugin-jsdoc` - JSDoc 注释检查
- `eslint-plugin-tsdoc` - TypeScript 注释检查

---

## 11. 快速检查清单

提交代码前检查：

- [ ] 所有函数都有 JSDoc 注释
- [ ] 所有 @param 都有类型和说明
- [ ] 所有 @return 都有类型和说明
- [ ] 复杂的行内逻辑有注释解释
- [ ] 注释与代码保持一致
- [ ] 没有无意义或过时的注释
- [ ] TODO/FIXME 注释的 issue 已记录

---

## 12. 示例

### 完整文件示例

```typescript
/**
 * @fileOverview MIDI 库管理模块
 * @description 负责 MIDI 文件的导入、存储、删除等操作
 * @module midiLibrary
 */
import { invoke } from '@tauri-apps/api/core'
import type { MidiInfo, MelodyEvent } from '@/types'

/** 缓存的有效期（毫秒），1 小时 */
const CACHE_TTL_MS = 60 * 60 * 1000

/** 缓存的数据结构 */
interface MidiCache {
  /** 缓存的 MIDI 信息 */
  info: MidiInfo
  /** 缓存时间戳 */
  timestamp: number
}

// 内存缓存
const cache = new Map<string, MidiCache>()

/**
 * @description: 加载 MIDI 库列表
 * @description 从应用数据目录读取所有已导入的 MIDI 文件信息
 * @return {Promise<MidiInfo[]>} MIDI 文件信息列表
 */
export async function loadMidiLibrary(): Promise<MidiInfo[]> {
  try {
    const files = await invoke<MidiInfo[]>('get_midi_library')
    return files
  } catch (e) {
    console.error('加载 MIDI 库失败:', e)
    return []
  }
}

/**
 * @description: 获取缓存的 MIDI 信息
 * @param {string} filename - 文件名
 * @return {MidiInfo | null} MIDI 信息或 null
 */
export function getCachedMidi(filename: string): MidiInfo | null {
  const cached = cache.get(filename)
  if (!cached) return null

  // 检查缓存是否过期
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    cache.delete(filename)
    return null
  }

  return cached.info
}

/**
 * @description: 设置 MIDI 缓存
 * @param {string} filename - 文件名
 * @param {MidiInfo} info - MIDI 信息
 * @return {void}
 */
export function setMidiCache(filename: string, info: MidiInfo): void {
  cache.set(filename, {
    info,
    timestamp: Date.now(),
  })
}
```

---

## 附录：JSDoc 标签速查表

| 标签           | 说明           | 示例                               |
| -------------- | -------------- | ---------------------------------- |
| `@description` | 描述函数或类型 | `@description: 这是一个计算函数`   |
| `@param`       | 参数说明       | `@param {string} name - 用户名`    |
| `@return`      | 返回值说明     | `@return {Promise<User>} 用户信息` |
| `@type`        | 类型定义       | `@type {Map<string, number>}`      |
| `@example`     | 使用示例       | `@example myFunc('test')`          |
| `@see`         | 参考链接       | `@see https://docs.example.com`    |
| `@throws`      | 可能抛出的异常 | `@throws {Error} 参数错误时`       |
| `@deprecated`  | 标记已废弃     | `@deprecated 请使用 newFunc`       |
| `@todo`        | 待办事项       | `@TODO 实现性能优化`               |
| `@internal`    | 内部实现细节   | `@internal 仅供内部使用`           |
