/** @fileOverview 更新日志的启动提示与完整历史入口；平台读取和落盘在适配器边界。 */
import { computed, ref, shallowRef } from 'vue'

/** 原生层用 SemVer 和已读记录计算范围，前端不维护第二套版本比较。 */
export interface ReleaseNotesLaunch {
  currentVersion: string
  historyVersions: string[]
  updateVersions: string[]
}

/** 日志不依赖网络；读取安装身份及已读记录，显式确认后持久化。 */
export interface ReleaseNotesAdapter {
  load(): Promise<ReleaseNotesLaunch>
  acknowledge(): Promise<void>
}

/**
 * @description: 同一主窗口共享自动提示与手动入口，避免迟到的初始化覆盖用户选择。
 * @param {ReleaseNotesAdapter} adapter - 原生持久化接口或测试端口
 * @return 更新日志弹窗的状态和动作
 */
export function createReleaseNotesController(adapter: ReleaseNotesAdapter) {
  const open = ref(false)
  const mode = ref<'update' | 'history'>('update')
  const launch = shallowRef<ReleaseNotesLaunch | null>(null)
  let loading: Promise<void> | undefined
  let starting: Promise<void> | undefined
  let historyRequested = false
  const versions = computed(() =>
    mode.value === 'history'
      ? (launch.value?.historyVersions ?? [])
      : (launch.value?.updateVersions ?? [])
  )
  const currentVersion = computed(() => launch.value?.currentVersion ?? '')

  /** @return 数据加载任务；并发入口复用一次读取，读取失败允许用户再次打开重试。 */
  function load(): Promise<void> {
    loading ??= adapter
      .load()
      .then((value) => {
        launch.value = value
      })
      .catch((error: unknown) => {
        loading = undefined
        throw error
      })
    return loading
  }

  /** @return 启动提示任务；保存基线失败不会阻止使用，下一次启动仍可补读日志。 */
  function start(): Promise<void> {
    starting ??= (async () => {
      await load()
      if (!historyRequested && launch.value?.updateVersions.length) open.value = true
      await adapter.acknowledge()
    })()
    return starting
  }

  /** @return 打开完整日志；不会提供再次打开升级区间的入口。 */
  async function showHistory(): Promise<void> {
    historyRequested = true
    await load()
    mode.value = 'history'
    open.value = true
  }

  /** @return 关闭弹窗，本次运行不重新自动提示。 */
  function close(): void {
    open.value = false
  }

  return { open, mode, versions, currentVersion, start, showHistory, close }
}

export type ReleaseNotesController = ReturnType<typeof createReleaseNotesController>
