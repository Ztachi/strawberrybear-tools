<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BALANCE } from '@/config/balance'
import BaseModal from '@/components/BaseModal/BaseModal.vue'
import LaborReport from '@/components/LaborReport/LaborReport.vue'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const router = useRouter()
const game = useGameStore()
const settings = useSettingsStore()
const host = ref<HTMLElement>()
const tutorialOpen = ref(false)
const debugOpen = ref(false)
const countdown = ref(0)
let countdownId: number | undefined

const eventRemaining = computed(() =>
  game.session?.event ? Math.max(0, Math.ceil((game.session.event.endsAt - Date.now()) / 1000)) : 0,
)
const formattedTime = computed(() => {
  const seconds = Math.floor((game.session?.elapsedMs ?? 0) / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})

/** @description 页面失焦时立即暂停，防止后台继续模拟 @return {void} */
function handleVisibility(): void {
  if (document.hidden || !document.hasFocus()) void game.pause()
}

/** @description 执行恢复倒计时并恢复游戏 @return {void} */
function resume(): void {
  countdown.value = BALANCE.rules.resumeCountdownSeconds
  window.clearInterval(countdownId)
  countdownId = window.setInterval(() => {
    countdown.value -= 1
    if (countdown.value > 0) return
    window.clearInterval(countdownId)
    void game.resume()
  }, 1000)
}

/** @description 保存后返回主页 @return {Promise<void>} 导航完成 */
async function backHome(): Promise<void> {
  await game.save()
  await router.push({ name: 'home' })
}

/** @description 结束报告中直接开始下一局 @return {Promise<void>} 重启完成 */
async function replay(): Promise<void> {
  game.reportOpen = false
  game.dispose()
  await nextTick()
  if (host.value) await game.start(host.value, false)
}

onMounted(async () => {
  await settings.init()
  if (!host.value) return
  const resumeSaved = route.query.mode === 'continue'
  await game.start(host.value, resumeSaved)
  tutorialOpen.value = !settings.settings.tutorialCompleted && !resumeSaved
  if (tutorialOpen.value) await game.pause()
  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('blur', handleVisibility)
  window.addEventListener('beforeunload', game.save)
})

onBeforeUnmount(() => {
  window.clearInterval(countdownId)
  document.removeEventListener('visibilitychange', handleVisibility)
  window.removeEventListener('blur', handleVisibility)
  window.removeEventListener('beforeunload', game.save)
  game.dispose()
})
</script>

<template>
  <main class="game-page">
    <div ref="host" class="game-canvas" aria-label="萌园园弹珠台" />
    <header class="hud">
      <div>
        <b>{{ $t('game.currency') }} {{ game.session?.currency.toLocaleString() ?? 0 }}</b>
        <small>{{ $t('game.inventory') }} {{ game.inventoryCount }}</small>
      </div>
      <div class="text-center">
        <b>{{ formattedTime }}</b>
        <small v-if="game.session?.combo">{{ $t('game.combo') }} ×{{ game.session.combo }}</small>
      </div>
      <div class="items-end">
        <small
          >{{ game.session?.rescueAvailable ? $t('game.rescue.ready') : $t('game.rescue.rest') }}</small
        >
        <div class="flex gap-2">
          <button class="hud-button" aria-label="声音开关" @click="settings.toggleMuted">
            {{ settings.settings.muted ? '静' : '声' }}
          </button>
          <button class="hud-button" :aria-label="$t('game.pause')" @click="game.pause">Ⅱ</button>
        </div>
      </div>
    </header>

    <div v-if="game.session?.event" class="event-bar">
      {{ $t(`game.event.${game.session.event.id}`) }}
      <span v-if="game.session.event.target"
        >· {{ $t(`game.device.${game.session.event.target}`) }}</span
      >
      · {{ eventRemaining }}s
    </div>

    <div v-if="game.feedback" class="feedback">
      {{ game.feedback.includes('.') ? $t(game.feedback) : game.feedback }}
    </div>
    <p v-if="game.session?.phase === 'launcher'" class="launch-hint">
      {{ $t('game.launch') }}
    </p>
    <button class="debug-toggle" aria-label="物理参数调试" @click="debugOpen = !debugOpen">
      调
    </button>
    <aside v-if="debugOpen" class="debug-panel">
      <strong>Balance 调试</strong>
      <label>重力 <input v-model.number="BALANCE.physics.gravity" type="number" step="1" /></label>
      <label
        >最大速度 <input v-model.number="BALANCE.physics.maxSpeed" type="number" step="1"
      /></label>
      <label
        >机关弹力 <input v-model.number="BALANCE.physics.bumperImpulse" type="number" step="1"
      /></label>
      <small>运行时预览；确认值后回写 balance.ts。</small>
    </aside>
  </main>

  <BaseModal
    v-if="game.session?.phase === 'paused' && !tutorialOpen && !game.reportOpen && !countdown"
    :title="$t('pause.title')"
    @close="resume"
  >
    <div class="mb-6 rounded-2xl bg-white/5 p-5">
      <p>{{ $t('game.inventory') }}：{{ game.inventoryCount }}</p>
      <p class="mt-2">{{ $t('pause.estimate') }}：{{ game.inventoryEstimate }}</p>
    </div>
    <div class="grid gap-3">
      <button class="primary-button" @click="resume">
        {{ $t('pause.resume') }}
      </button>
      <button class="secondary-button" @click="backHome">
        {{ $t('pause.home') }}
      </button>
    </div>
  </BaseModal>

  <BaseModal v-if="tutorialOpen" :title="$t('tutorial.title')" @close="tutorialOpen = false">
    <ol class="mb-6 list-decimal space-y-3 pl-6 text-white/75">
      <li v-for="step in $tm('tutorial.steps')" :key="String(step)">
        {{ step }}
      </li>
    </ol>
    <button
      class="primary-button w-full"
      @click="settings.settings.tutorialCompleted = true; tutorialOpen = false; resume()"
    >
      {{ $t('tutorial.start') }}
    </button>
  </BaseModal>

  <div v-if="countdown" class="countdown">
    {{ countdown }}
  </div>

  <LaborReport
    v-if="game.reportOpen && game.session"
    :session="game.session"
    allow-replay
    @close="backHome"
    @replay="replay"
  />
</template>
