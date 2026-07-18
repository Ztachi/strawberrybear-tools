<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { BALANCE } from '@/config/balance'
import BaseModal from '@/components/BaseModal/BaseModal.vue'
import LaborReport from '@/components/LaborReport/LaborReport.vue'
import SettingsPanel from '@/components/SettingsPanel/SettingsPanel.vue'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n()
const game = useGameStore()
const settings = useSettingsStore()
const host = ref<HTMLElement>()
const tutorialOpen = ref(false)
const settingsOpen = ref(false)
const debugOpen = ref(false)
const debugAvailable = import.meta.env.DEV && route.query.debug === '1'
const countdown = ref(0)
let countdownId: number | undefined

watch(locale, () => game.setTranslator((key) => t(key)))

const eventRemaining = computed(() =>
  game.session?.event ? Math.max(0, Math.ceil(game.session.event.remainingMs / 1000)) : 0,
)
const feedbackText = computed(() => {
  if (!game.feedback) return ''
  const params = Object.fromEntries(
    Object.entries(game.feedback.params ?? {}).map(([key, value]) => [
      key.endsWith('Key') ? key.slice(0, -3) : key,
      key.endsWith('Key') ? t(String(value)) : value,
    ]),
  )
  return t(game.feedback.key, params)
})
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
  if (host.value) {
    await game.start(host.value, false, settings.settings.keys, (key) => t(key))
  }
}

onMounted(async () => {
  await settings.init()
  if (!host.value) return
  const resumeSaved = route.query.mode === 'continue'
  await game.start(host.value, resumeSaved, settings.settings.keys, (key) => t(key))
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
  <main
    class="game-page"
    :data-launch-state="game.launchState"
    :data-phase="game.session?.phase"
    :data-ball-x="debugAvailable ? Math.round(game.physicsDiagnostic.x) : undefined"
    :data-ball-y="debugAvailable ? Math.round(game.physicsDiagnostic.y) : undefined"
    :data-ball-speed="debugAvailable ? game.physicsDiagnostic.speed.toFixed(2) : undefined"
    :data-unstick-count="debugAvailable ? game.unstickCount : undefined"
  >
    <header class="game-hud">
      <div class="hud-stat hud-stat--primary">
        <small>{{ $t('game.currency') }}</small>
        <strong>{{ game.session?.currency.toLocaleString() ?? 0 }}</strong>
        <span>{{ $t('game.inventory') }} · {{ game.inventoryCount }}</span>
      </div>
      <div class="hud-timer">
        <small>{{ $t('game.shiftTime') }}</small>
        <strong>{{ formattedTime }}</strong>
        <span v-if="game.session?.combo">{{ $t('game.combo') }} ×{{ game.session.combo }}</span>
        <span v-else>{{ $t('game.shiftStatus') }}</span>
      </div>
      <div class="hud-actions">
        <span class="rescue-status">
          {{ game.session?.rescueAvailable ? $t('game.rescue.ready') : $t('game.rescue.rest') }}
        </span>
        <div class="hud-action-row">
          <button
            class="hud-button"
            :aria-label="settings.settings.muted ? $t('home.soundOff') : $t('home.soundOn')"
            @click="settings.toggleMuted"
          >
            {{ settings.settings.muted ? $t('game.soundOffShort') : $t('game.soundOnShort') }}
          </button>
          <button class="hud-button" :aria-label="$t('game.pause')" @click="game.pause">
            {{ $t('game.pauseShort') }}
          </button>
        </div>
      </div>
    </header>

    <section class="playfield-shell">
      <div ref="host" class="game-canvas" :aria-label="$t('game.board')" />
      <div v-if="game.session?.event" class="event-bar">
        <strong>{{ $t(`game.event.${game.session.event.id}`) }}</strong>
        <span>{{ $t(`game.eventPhase.${game.session.event.phase}`) }}</span>
        <span
          v-if="game.session.event.target"
          >{{ $t(`game.device.${game.session.event.target}`) }}</span
        >
        <b>{{ eventRemaining }}s</b>
      </div>
      <div v-if="game.feedback" class="feedback">
        {{ feedbackText }}
      </div>
    </section>

    <footer class="game-controls">
      <div class="control-legend control-legend--left">
        <kbd>{{ settings.settings.keys.left.replace('Key', '') }}</kbd>
        <span>{{ $t('settings.key.left') }}</span>
      </div>
      <div class="launch-control">
        <p>
          {{
            game.session?.phase === 'launcher'
              ? $t(game.launchState === 'traveling' ? 'game.launching' : 'game.launch')
              : $t('game.controlHint')
          }}
        </p>
        <button
          v-if="game.session?.phase === 'launcher' && game.launchState === 'ready'"
          class="launch-button"
          :aria-label="$t('game.launchButton')"
          @pointerdown.stop.prevent="game.beginCharge"
          @pointerup.stop.prevent="game.releaseCharge"
          @pointercancel.stop.prevent="game.releaseCharge"
          @pointerleave="game.releaseCharge"
        >
          {{ $t('game.launchButton') }}
        </button>
        <span v-else class="play-status">
          {{ game.session?.phase === 'launcher' ? $t('game.launchInProgress') : $t('game.onDuty') }}
        </span>
      </div>
      <div class="control-legend control-legend--right">
        <kbd>{{ settings.settings.keys.right.replace('Key', '') }}</kbd>
        <span>{{ $t('settings.key.right') }}</span>
      </div>
    </footer>

    <button
      v-if="debugAvailable"
      class="debug-toggle"
      :aria-label="$t('game.debug.title')"
      @click="debugOpen = !debugOpen"
    >
      {{ $t('game.debug.short') }}
    </button>
    <aside v-if="debugAvailable && debugOpen" class="debug-panel">
      <strong>{{ $t('game.debug.title') }}</strong>
      <label
        >{{ $t('game.debug.gravity') }}
        <input
          v-model.number="BALANCE.physics.gravity"
          type="number"
          step="1"
          @change="game.syncBalance"
      /></label>
      <label
        >{{ $t('game.debug.maxSpeed') }}
        <input v-model.number="BALANCE.physics.maxSpeed" type="number" step="1"
      /></label>
      <label
        >{{ $t('game.debug.bumperImpulse') }}
        <input v-model.number="BALANCE.physics.bumperImpulse" type="number" step="1"
      /></label>
      <small>{{ $t('game.debug.hint') }}</small>
    </aside>
  </main>

  <BaseModal
    v-if="game.session?.phase === 'paused' && !tutorialOpen && !settingsOpen && !game.reportOpen && !countdown"
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
      <button class="secondary-button" @click="settingsOpen = true">
        {{ $t('settings.title') }}
      </button>
      <button class="secondary-button" @click="backHome">
        {{ $t('pause.home') }}
      </button>
    </div>
  </BaseModal>

  <BaseModal v-if="settingsOpen" :title="$t('settings.title')" @close="settingsOpen = false">
    <SettingsPanel />
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
