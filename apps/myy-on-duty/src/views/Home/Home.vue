<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import BaseModal from '@/components/BaseModal/BaseModal.vue'
import LaborReport from '@/components/LaborReport/LaborReport.vue'
import SettingsPanel from '@/components/SettingsPanel/SettingsPanel.vue'
import { db, loadCurrentGame, loadHistory } from '@/db/database'
import type { GameSession } from '@/game/types'
import { useSettingsStore } from '@/stores/settings'

type ModalName = 'help' | 'settings' | 'about' | 'records' | null

const router = useRouter()
const { t } = useI18n()
const settingsStore = useSettingsStore()
const modal = ref<ModalName>(null)
const savedSession = ref<GameSession>()
const history = ref<GameSession[]>([])
const selectedReport = ref<GameSession>()
const hasSave = computed(() => !!savedSession.value)
const continueSummary = computed(() => {
  const saved = savedSession.value
  if (!saved) return ''
  return t('home.continueSummary', {
    duration: formatDuration(saved.elapsedMs),
    currency: saved.currency.toLocaleString(),
    inventory: saved.inventory.reduce((sum, item) => sum + item.count, 0),
  })
})

/** @description 读取主页需要的存档和历史摘要 @return {Promise<void>} 加载完成 */
async function refresh(): Promise<void> {
  savedSession.value = (await loadCurrentGame())?.session
  history.value = await loadHistory()
}

/** @description 开始新局并按需确认覆盖 @return {Promise<void>} 导航完成 */
async function startNew(): Promise<void> {
  if (hasSave.value && !window.confirm(t('home.overwrite'))) return
  await db.currentGames.delete('current')
  await router.push({ name: 'game', query: { mode: 'new' } })
}

/** @description 格式化主页存档时长 @param {number} elapsedMs 毫秒 @return {string} 分秒文本 */
function formatDuration(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

onMounted(async () => {
  await settingsStore.init()
  await refresh()
})
</script>

<template>
  <main class="home-scene min-h-dvh overflow-hidden px-5 pt-[max(2rem,env(safe-area-inset-top))]">
    <div class="mx-auto flex min-h-[90dvh] w-full max-w-md flex-col items-center justify-center">
      <div class="mascot mb-7" :aria-label="$t('home.mascot')">
        <span>萌</span>
      </div>
      <p class="mb-2 text-sm font-bold tracking-[0.35em] text-[var(--gold)]">
        {{ $t('home.eyebrow') }}
      </p>
      <h1 class="font-display text-center text-5xl font-black tracking-tight">
        {{ $t('home.title') }}
      </h1>
      <p class="mt-3 text-white/60">
        {{ $t('home.subtitle') }}
      </p>

      <div class="mt-10 grid w-full gap-3">
        <button class="primary-button text-lg" @click="startNew">
          {{ $t('home.start') }}
        </button>
        <button
          class="secondary-button text-lg disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!hasSave"
          @click="router.push({ name: 'game', query: { mode: 'continue' } })"
        >
          <span>{{ $t('home.continue') }}</span>
          <small v-if="hasSave" class="mt-1 block text-xs font-normal text-white/60">
            {{ continueSummary }}
          </small>
        </button>
        <p v-if="!hasSave" class="text-center text-xs text-white/45">
          {{ $t('home.noSave') }}
        </p>
      </div>

      <nav class="mt-7 grid w-full grid-cols-5 gap-2" :aria-label="$t('home.nav')">
        <button class="menu-button" :aria-label="$t('home.help')" @click="modal = 'help'">
          {{ $t('home.helpShort') }}
        </button>
        <button
          class="menu-button"
          :aria-label="settingsStore.settings.muted ? $t('home.soundOff') : $t('home.soundOn')"
          @click="settingsStore.toggleMuted"
        >
          {{ $t('home.sound') }}
        </button>
        <button class="menu-button" :aria-label="$t('home.records')" @click="modal = 'records'">
          {{ $t('home.recordsShort') }}
        </button>
        <button class="menu-button" :aria-label="$t('home.settings')" @click="modal = 'settings'">
          {{ $t('home.settingsShort') }}
        </button>
        <button class="menu-button" :aria-label="$t('home.about')" @click="modal = 'about'">
          {{ $t('home.aboutShort') }}
        </button>
      </nav>
    </div>
  </main>

  <BaseModal v-if="modal === 'help'" :title="$t('help.title')" @close="modal = null">
    <p class="leading-8 text-white/75">
      {{ $t('help.body') }}
    </p>
  </BaseModal>

  <BaseModal v-if="modal === 'settings'" :title="$t('settings.title')" @close="modal = null">
    <SettingsPanel />
  </BaseModal>

  <BaseModal v-if="modal === 'about'" :title="$t('about.title')" @close="modal = null">
    <p class="leading-8 text-white/75">
      {{ $t('about.body') }}
    </p>
    <p class="mt-4 text-sm text-white/45">v0.1.0</p>
  </BaseModal>

  <BaseModal v-if="modal === 'records'" :title="$t('records.title')" @close="modal = null">
    <p v-if="!history.length" class="py-10 text-center text-white/50">
      {{ $t('records.empty') }}
    </p>
    <button
      v-for="record in history"
      :key="record.id"
      class="mb-3 flex w-full items-center justify-between rounded-2xl bg-white/5 p-4 text-left hover:bg-white/10"
      @click="selectedReport = record"
    >
      <span>
        <strong>{{ $t(`title.${record.finalTitle}`) }}</strong>
        <small
          class="mt-1 block text-white/50"
          >{{ new Date(record.startedAt).toLocaleString() }}</small
        >
      </span>
      <span class="text-right">
        <b class="block text-[var(--gold)]">{{ record.currency.toLocaleString() }}</b>
        <small class="text-white/45">{{ formatDuration(record.elapsedMs) }}</small>
      </span>
    </button>
  </BaseModal>

  <LaborReport
    v-if="selectedReport"
    :session="selectedReport"
    @close="selectedReport = undefined"
  />
</template>
