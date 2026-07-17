<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseModal from '@/components/BaseModal/BaseModal.vue'
import LaborReport from '@/components/LaborReport/LaborReport.vue'
import { db } from '@/db/database'
import type { GameSession } from '@/game/types'
import { useSettingsStore } from '@/stores/settings'

type ModalName = 'help' | 'settings' | 'about' | 'records' | null

const router = useRouter()
const settingsStore = useSettingsStore()
const modal = ref<ModalName>(null)
const hasSave = ref(false)
const history = ref<GameSession[]>([])
const selectedReport = ref<GameSession>()

/** @description 读取主页需要的存档和历史摘要 @return {Promise<void>} 加载完成 */
async function refresh(): Promise<void> {
  hasSave.value = !!(await db.currentGames.get('current'))
  history.value = (await db.history.orderBy('session.startedAt').reverse().toArray()).map(
    (record) => record.session,
  )
}

/** @description 开始新局并按需确认覆盖 @return {Promise<void>} 导航完成 */
async function startNew(): Promise<void> {
  if (hasSave.value && !window.confirm('当前存在未结束的上班记录，开始新游戏将覆盖当前进度。')) return
  await db.currentGames.delete('current')
  await router.push({ name: 'game', query: { mode: 'new' } })
}

onMounted(async () => {
  await settingsStore.init()
  await refresh()
})
</script>

<template>
  <main class="home-scene min-h-dvh overflow-hidden px-5 pt-[max(2rem,env(safe-area-inset-top))]">
    <div class="mx-auto flex min-h-[90dvh] w-full max-w-md flex-col items-center justify-center">
      <div class="mascot mb-7" aria-label="萌园园占位形象">
        <span>萌</span>
      </div>
      <p class="mb-2 text-sm font-bold tracking-[0.35em] text-[var(--gold)]">
        INFINITY NIKKI FAN GAME
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
          {{ $t('home.continue') }}
        </button>
      </div>

      <nav class="mt-7 grid w-full grid-cols-5 gap-2" aria-label="主页功能">
        <button class="menu-button" :aria-label="$t('home.help')" @click="modal = 'help'">?</button>
        <button class="menu-button" aria-label="声音开关" @click="settingsStore.toggleMuted">
          {{ settingsStore.settings.muted ? '静' : '声' }}
        </button>
        <button class="menu-button" :aria-label="$t('home.records')" @click="modal = 'records'">
          录
        </button>
        <button class="menu-button" :aria-label="$t('home.settings')" @click="modal = 'settings'">
          设
        </button>
        <button class="menu-button" :aria-label="$t('home.about')" @click="modal = 'about'">
          关
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
    <label class="mb-6 block">
      <span class="mb-2 block">{{ $t('settings.volume') }}</span>
      <input
        v-model.number="settingsStore.settings.volume"
        class="w-full"
        type="range"
        min="0"
        max="1"
        step="0.05"
      />
    </label>
    <label class="flex items-center justify-between rounded-xl bg-white/5 p-4">
      <span>{{ $t('settings.muted') }}</span>
      <input v-model="settingsStore.settings.muted" type="checkbox" />
    </label>
    <div class="mt-5 rounded-xl bg-white/5 p-4">
      <p>{{ $t('settings.language') }}：{{ $t('settings.languageValue') }}</p>
      <p class="mt-3 text-sm text-white/60">{{ $t('settings.keys') }}：A / L / Space</p>
    </div>
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
      <b class="text-[var(--gold)]">{{ record.currency.toLocaleString() }}</b>
    </button>
  </BaseModal>

  <LaborReport
    v-if="selectedReport"
    :session="selectedReport"
    @close="selectedReport = undefined"
  />
</template>
