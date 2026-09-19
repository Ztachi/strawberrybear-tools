import { computed, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PianoRollLabels } from '@strawberrybear/piano-roll/browser'

/**
 * @description: 钢琴卷帘本地化文案；详情页与编辑器共用同一套 key。
 * @return {ComputedRef<PianoRollLabels>} 随语言切换的文案
 */
export function usePianoRollLabels(): ComputedRef<PianoRollLabels> {
  const { t } = useI18n()
  return computed(() => ({
    overview: t('midi.pianoRoll.overview'),
    editor: t('midi.pianoRoll.editor'),
    follow: t('midi.pianoRoll.follow'),
    following: t('midi.pianoRoll.following'),
    timeZoom: t('midi.pianoRoll.timeZoom'),
    pitchZoom: t('midi.pianoRoll.pitchZoom'),
    enableTrack: t('midi.clickToEnable'),
    disableTrack: t('midi.clickToDisable'),
    notes: t('midi.pianoRoll.notes'),
    empty: t('midi.pianoRoll.empty'),
    playhead: t('midi.pianoRoll.playhead'),
    fit: t('midi.pianoRoll.fit'),
    close: t('midi.pianoRoll.close'),
  }))
}
