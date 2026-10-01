import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

/** 原生测试只发 UI 手势与测试宿主命令，不启动真实预览或按键模拟。 */
export async function runNativeEditorSmoke(): Promise<void> {
  const current = getCurrentWebviewWindow()
  let probe: { song?: string; track?: string } | undefined
  const unlisten = await current.listen<{ song?: string; track?: string }>(
    'piano-native-probe',
    (event) => {
      probe = event.payload
    }
  )
  const wait = async (predicate: () => boolean): Promise<void> => {
    const deadline = Date.now() + 8000
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('Native smoke condition timed out')
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
  }
  try {
    await wait(() => !!document.querySelector('.pr-track[data-track-id="1"] .pr-track-select'))
    document
      .querySelector('.pr-track[data-track-id="1"] .pr-track-select')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await wait(() => !!document.querySelector('[aria-label="在独立窗口中打开"]'))
    ;(document.querySelector('[aria-label="在独立窗口中打开"]') as HTMLElement).click()
    await wait(() => !!document.querySelector('[aria-label="显示音轨独立窗口"]'))
    await invoke('smoke_check_titlebar')
    await invoke('smoke_probe')
    await wait(() => probe?.song === '钢琴卷帘界面验收')
    await invoke('smoke_select_track')
    await wait(() => {
      void invoke('smoke_probe')
      return probe?.track === '低音'
    })
    await window.midiDetailFixture.navigate('second.mid')
    await wait(() => {
      void invoke('smoke_probe')
      return probe?.song === '第二首验收歌曲'
    })
    await invoke('smoke_close_editor')
    await wait(
      () =>
        !!document.querySelector('.detail-piano-editor') &&
        !document.querySelector('[aria-label="显示音轨独立窗口"]')
    )
    await invoke('smoke_finish', { result: 'ok' })
  } catch (error) {
    await invoke('smoke_finish', { result: String(error) })
  } finally {
    unlisten()
  }
}
