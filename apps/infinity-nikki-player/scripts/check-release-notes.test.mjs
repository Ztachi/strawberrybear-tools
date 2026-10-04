/** 验证发版遗漏、缺译、乱序与非法日期会被阻止；不调用发布接口。 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkReleaseNotes, validateReleaseNotes } from './check-release-notes.mjs'

const releases = [{ version: '1.3.0', id: 'v1_3_0', date: '2026-10-02' }]
const translations = {
  'zh-CN': { v1_3_0: { title: '改编 MIDI', highlights: ['可修改音符并导出 MIDI。'] } },
  'en-US': { v1_3_0: { title: 'Arrange MIDI', highlights: ['Edit notes and export MIDI.'] } },
}

test('本次应用与所有历史日志都有完整中英文内容', () => checkReleaseNotes())
test('升版忘记维护用户日志时阻止打包', () => {
  assert.throws(() => validateReleaseNotes('1.3.1', releases, translations), /缺少 1.3.1/)
})
test('英文缺失或正文为空时不能通过', () => {
  assert.throws(
    () => validateReleaseNotes('1.3.0', releases, { ...translations, 'en-US': {} }),
    /en-US/
  )
  assert.throws(
    () =>
      validateReleaseNotes('1.3.0', releases, {
        ...translations,
        'zh-CN': { v1_3_0: { title: '改编', highlights: [] } },
      }),
    /zh-CN/
  )
})
test('重复标识、错误排序与不存在的日历日均拒绝', () => {
  assert.throws(
    () => validateReleaseNotes('1.3.0', [...releases, ...releases], translations),
    /重复/
  )
  assert.throws(
    () =>
      validateReleaseNotes(
        '1.3.0',
        [...releases, { version: '1.10.0', id: 'v1_10_0', date: '2026-10-03' }],
        translations
      ),
    /排序/
  )
  assert.throws(
    () => validateReleaseNotes('1.3.0', [{ ...releases[0], date: '2026-02-30' }], translations),
    /日期/
  )
  assert.throws(
    () => validateReleaseNotes('1.3.0', [{ ...releases[0], date: '2026-13-01' }], translations),
    /日期/
  )
})
