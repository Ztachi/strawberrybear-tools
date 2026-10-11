import { describe, expect, it } from 'vitest'
import { useEditorChoice } from './useEditorChoice'

describe('共用编辑器选择状态', () => {
  it('新问题取消旧等待，关闭完成当前问题且重复关闭无副作用', async () => {
    const { ask, choice, resolveChoice } = useEditorChoice()
    const old = ask('Old', '', [])
    const current = ask('New', '', [{ key: 'apply', label: 'Apply' }])
    expect(await old).toBe('cancel')
    expect(choice.value.title).toBe('New')
    resolveChoice('apply')
    expect(await current).toBe('apply')
    expect(choice.value.open).toBe(false)
    resolveChoice('cancel')
    expect(choice.value.open).toBe(false)
  })
})
