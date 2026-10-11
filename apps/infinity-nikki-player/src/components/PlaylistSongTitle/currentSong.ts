import { computed, inject, provide, type InjectionKey, type Ref } from 'vue'
import { usePlayerStore } from '@/stores/player'
import type { MidiInfo } from '@/types'

type CurrentSong = Pick<MidiInfo, 'filename'> &
  Partial<Pick<MidiInfo, 'online_song_id' | 'online_sha256'>>
type CurrentSongRef = Readonly<Ref<CurrentSong | null>>
const currentSongKey: InjectionKey<CurrentSongRef> = Symbol('playlist-current-song')

/** 独立窗口以主窗口同步的身份覆盖默认来源，避免初始化另一个播放器。 */
export function provideCurrentSong(currentSong: CurrentSongRef): void {
  provide(currentSongKey, currentSong)
}

/** 默认订阅全局当前歌曲；暂停、停止不改变歌曲身份。 */
export function useCurrentSong(): CurrentSongRef {
  return inject(
    currentSongKey,
    () => {
      const player = usePlayerStore()
      return computed(() => player.currentMidi)
    },
    true
  )
}
