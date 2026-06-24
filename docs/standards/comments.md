# 注释与 JSDoc 规范

新增或修改代码时，注释必须使用中文，并贴近被解释的代码行。注释要解释「为什么这样做」或「这一步影响什么状态」，不要重复代码字面意思。

## 函数 / 方法注释

函数注释必须包含所有参数和返回值；简要函数可写单行说明 + `@param` / `@return`。

### TypeScript / JavaScript（JSDoc）

```typescript
/**
 * @description: 加载 MIDI 库列表
 * @description 从应用数据目录读取所有已导入的 MIDI 文件信息
 * @return {Promise<MidiInfo[]>} MIDI 文件信息列表
 */
export async function loadMidiLibrary(): Promise<MidiInfo[]> {
  // ...
}

/**
 * @description: 获取缓存的 MIDI 信息
 * @param {string} filename - 文件名
 * @return {MidiInfo | null} MIDI 信息或 null
 */
export function getCachedMidi(filename: string): MidiInfo | null {
  // ...
}
```

### Rust

```rust
/// @description: 加载 MIDI 库列表
///
/// 从应用数据目录读取所有已导入的 MIDI 文件信息
///
/// # Returns
/// MIDI 文件信息列表
pub async fn load_midi_library() -> Result<Vec<MidiInfo>, Error> {
    // ...
}
```

## 类型 / 接口 / 类注释

公共类型必须有简要说明；字段使用行内 `/** ... */` 注释其业务含义。

```typescript
/**
 * @description: MIDI 文件信息
 * @description 描述一个已导入的 MIDI 文件及其元数据
 */
interface MidiInfo {
  /** 文件名（不含扩展名） */
  name: string
  /** MIDI 轨道数 */
  trackCount: number
  /** 持续时间（毫秒） */
  durationMs: number
}
```

## 行内注释

行内注释用于解释复杂逻辑、特殊处理或非显而易见的代码。位置规则：

| 情况         | 注释位置           |
| ------------ | ------------------ |
| 行末注释     | 与代码同行，空格后 |
| 块级注释     | 代码块上方         |
| 行内复杂逻辑 | 上方或同行         |

避免：

- 重复代码字面意思（`let x = 10 // 赋值`）
- 用注释取消代码（应直接删除并依赖 git 历史）
- 机械标注显而易见的过程

## 函数内部关键逻辑注释

函数头注释只说明「这个函数做什么」；函数内部关键逻辑必须说明「为什么这样做」和「这一步保证什么」。以下情况需要在函数内部逐行或逐段添加注释：

- 状态切换：编辑/预览模式、捕获状态进入/退出、播放状态变化
- 安全校验：路径、ID、权限、白名单、重复数据校验
- 数据清洗：trim、大小写归一化、去重、排序、冲突覆盖规则
- 坐标/算法换算：Canvas 坐标、滚动偏移、音高到琴键位置
- 异常分支：提前 return、兜底值、错误提示和失败恢复
- 跨模块契约：前端白名单需要和 Rust 键盘模拟器支持范围保持一致

示例：

```typescript
function normalizeMappings(mappings: KeyMapping[]): KeyMapping[] {
  // 按音高索引最终映射，保证同一音高只会保留一条记录。
  const byPitch = new Map<number, KeyMapping>()
  // 按物理键索引已占用音高，保证同一按键不会同时映射多个音。
  const usedKeys = new Map<string, number>()

  for (const mapping of mappings) {
    // 先把用户输入归一化，避免 a/A 被当成两个不同按键。
    const key = mapping.key.trim().toUpperCase()

    // 非法音高或当前模拟器不支持的按键不能进入模板文件。
    if (!isValidPitch(mapping.pitch) || !isSupportedKey(key)) {
      continue
    }

    // 新映射占用同一按键时，移除旧音高，保持「一键一音」。
    const previousPitch = usedKeys.get(key)
    if (previousPitch !== undefined) {
      byPitch.delete(previousPitch)
    }

    usedKeys.set(key, mapping.pitch)
    byPitch.set(mapping.pitch, { pitch: mapping.pitch, key })
  }

  // 保存前排序，保证导出的 JSON 稳定、可读。
  return Array.from(byPitch.values()).sort((a, b) => a.pitch - b.pitch)
}
```

## 注释同步规则

- 代码变更时必须更新注释；改函数逻辑改函数注释，改参数改 `@param`，改返回值改 `@return`。
- 禁止注释与代码不一致；如果改实现无法同步注释，宁可删除错误注释。
- PR / 代码审查时检查注释的完整性和准确性。
- TODO / FIXME / HACK / NOTE 等标记必须简短说明目的，并在 issue / 任务系统记录归属。

## 快速检查清单

- [ ] 函数有 `@description`，参数和返回值有 `@param` / `@return`
- [ ] 关键状态切换、平台分支、持久化读写有行内注释
- [ ] 注释与代码一致，没有过时或废话注释
- [ ] 公共类型 / 接口有简要说明和字段注释
