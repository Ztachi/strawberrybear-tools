import { watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useMainWindowUiStore } from '@/stores/mainWindowUi'
import { storeToRefs } from 'pinia'

/**
 * 自动切换只改变当前详情路由，不选曲、不修改播放队列；暂停仍保留当前播放歌曲身份。
 * @param filename 当前详情路由歌曲。
 * @returns 全局 UI 偏好，首次默认关闭。
 */
export function useAutoSwitchDetail(filename: Readonly<Ref<string>>) {
  const router = useRouter()
  const player = usePlayerStore()
  const { autoSwitchDetail } = storeToRefs(useMainWindowUiStore())
  watch(
    () => [
      autoSwitchDetail.value,
      player.currentMidi?.filename,
      player.isPreviewPlaying,
      player.isPreviewPaused,
      filename.value,
    ],
    () => {
      const target = player.currentMidi?.filename
      if (
        !autoSwitchDetail.value ||
        !target ||
        target === filename.value ||
        (!player.isPreviewPlaying && !player.isPreviewPaused)
      )
        return
      // 删除或刷新媒体库时不跳转到不存在的文件。replace 避免每次自动下一曲累积历史。
      if (player.midiLibrary.some((midi) => midi.filename === target))
        void router.replace({ name: 'files-midi-detail', params: { filename: target } })
    },
    { immediate: true }
  )
  return autoSwitchDetail
}
