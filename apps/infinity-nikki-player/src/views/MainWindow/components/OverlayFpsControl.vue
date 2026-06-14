<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { InputNumber, Switch, Tooltip } from 'antdv-next'
import {
  getFrameRateCaptureCapability,
  getFrameRateSnapshot,
  startFrameRateCapture,
  stopFrameRateCapture,
  type FrameRateCaptureCapability,
  type FrameRateSnapshot,
} from '@/lib/frameRateCapture'
import { normalizePlaybackFps } from '@/lib/keyboardTiming'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const settingsStore = useSettingsStore()

/** FPS 自动采集能力，初始化后决定自动开关是否真的可用。 */
const capability = ref<FrameRateCaptureCapability | null>(null)
/** 当前 FPS 快照。 */
const snapshot = ref<FrameRateSnapshot | null>(null)
/** 手动输入临时值，失焦后才持久化。 */
const manualInput = ref(settingsStore.manualFps)
/** 轮询定时器句柄。 */
let pollTimer: number | null = null
/** 最近已经持久化的稳定 FPS，避免轮询期间频繁写 settings。 */
let persistedDetectedFps: number | null = settingsStore.lastDetectedFps

const autoCaptureAvailable = computed(() => capability.value?.auto_capture_available === true)
const autoCaptureBlocked = computed(() =>
  ['unsupported_platform', 'present_mon_missing', 'permission_denied', 'error'].includes(
    snapshot.value?.status ?? ''
  )
)
const inputDisabled = computed(
  () => settingsStore.autoFpsEnabled && autoCaptureAvailable.value && !autoCaptureBlocked.value
)

const autoDisplayFps = computed(() => {
  const stable = snapshot.value?.stable_fps?.fps
  if (typeof stable === 'number') return stable
  const current = snapshot.value?.current_fps
  if (typeof current === 'number') return Math.round(current)
  return settingsStore.lastDetectedFps ?? settingsStore.manualFps
})

const inputValue = computed(() => {
  if (inputDisabled.value) return autoDisplayFps.value
  return manualInput.value
})

const statusMessage = computed(() => {
  if (!settingsStore.autoFpsEnabled) return t('overlay.fpsManualTip')
  if (!autoCaptureAvailable.value) return t('overlay.fpsUnsupported')

  switch (snapshot.value?.status) {
    case 'target_not_found':
      return t('overlay.fpsWaiting')
    case 'present_mon_missing':
      return t('overlay.fpsMissing')
    case 'permission_denied':
      return t('overlay.fpsPermissionDenied')
    case 'error':
      return t('overlay.fpsError')
    default:
      return t('overlay.fpsAutoTip')
  }
})

/**
 * @description: 刷新 FPS 快照并保存稳定检测值
 * @return Promise
 */
async function refreshSnapshot() {
  try {
    snapshot.value = await getFrameRateSnapshot()
    const detected = snapshot.value.stable_fps?.fps
    if (typeof detected === 'number' && detected !== persistedDetectedFps) {
      persistedDetectedFps = detected
      await settingsStore.setLastDetectedFps(detected)
    }
  } catch (error) {
    console.error('刷新 FPS 快照失败:', error)
  }
}

/**
 * @description: 开始轮询 FPS 快照
 */
function startPolling() {
  if (pollTimer !== null) return
  pollTimer = window.setInterval(() => {
    void refreshSnapshot()
  }, 500)
}

/**
 * @description: 停止轮询 FPS 快照
 */
function stopPolling() {
  if (pollTimer === null) return
  clearInterval(pollTimer)
  pollTimer = null
}

/**
 * @description: 尝试启动自动采集
 * @return Promise
 */
async function startAutoCapture() {
  if (!settingsStore.autoFpsEnabled) return
  if (!autoCaptureAvailable.value) return
  try {
    snapshot.value = await startFrameRateCapture()
    if (snapshot.value.status === 'capturing' || snapshot.value.status === 'target_not_found') {
      startPolling()
    } else {
      stopPolling()
    }
  } catch (error) {
    console.error('启动 FPS 自动采集失败:', error)
  }
}

/**
 * @description: 自动 FPS 开关变化
 * @param {boolean} checked - 是否启用自动 FPS
 */
async function handleAutoChange(checked: boolean) {
  await settingsStore.setAutoFpsEnabled(checked)
  if (checked) {
    await startAutoCapture()
  } else {
    stopPolling()
    await stopFrameRateCapture()
  }
}

/**
 * @description: 输入框变化仅更新本地草稿，失焦时再持久化
 * @param {number | string | null} value - 输入框值
 */
function handleManualInput(value: number | string | null) {
  manualInput.value = normalizePlaybackFps(Number(value))
}

/**
 * @description: 持久化手动 FPS
 */
async function commitManualFps() {
  await settingsStore.setManualFps(manualInput.value)
  manualInput.value = settingsStore.manualFps
}

/**
 * @description: 播放倒计时开始时调用，确保倒计时期间采样在刷新
 * @return Promise
 */
async function startCountdownSampling() {
  if (settingsStore.autoFpsEnabled) {
    await startAutoCapture()
  }
  await refreshSnapshot()
}

/**
 * @description: 倒计时结束时选择本次播放 FPS
 * @return {Promise<number>} 本次播放锁定 FPS
 */
async function resolvePlaybackFps(): Promise<number> {
  if (settingsStore.autoFpsEnabled && autoCaptureAvailable.value) {
    await refreshSnapshot()
    const stable = snapshot.value?.stable_fps?.fps
    if (typeof stable === 'number') {
      return normalizePlaybackFps(stable)
    }
  }
  return normalizePlaybackFps(settingsStore.manualFps)
}

watch(
  () => settingsStore.manualFps,
  (fps) => {
    if (!inputDisabled.value) {
      manualInput.value = fps
    }
  }
)

onMounted(async () => {
  capability.value = await getFrameRateCaptureCapability()
  if (settingsStore.autoFpsEnabled) {
    await startAutoCapture()
  }
})

onUnmounted(() => {
  stopPolling()
  void stopFrameRateCapture()
})

defineExpose({
  startCountdownSampling,
  resolvePlaybackFps,
})
</script>

<template>
  <Tooltip :title="statusMessage" placement="top">
    <div class="overlay-fps-control">
      <label class="fps-row">
        <span class="fps-label">{{ t('overlay.fpsLabel') }}</span>
        <InputNumber
          class="fps-input"
          size="small"
          :controls="false"
          :min="15"
          :max="360"
          :precision="0"
          allow-clear
          :value="inputValue"
          :disabled="inputDisabled"
          @update:value="handleManualInput"
          @blur="commitManualFps"
          @press-enter="commitManualFps"
        />
      </label>
      <Switch
        class="fps-auto-switch ml-2"
        size="small"
        :checked="settingsStore.autoFpsEnabled"
        @change="handleAutoChange"
      />
      <span class="auto-label">{{ t('overlay.fpsAuto') }}</span>
    </div>
  </Tooltip>
</template>

<style scoped>
.overlay-fps-control {
  @apply flex items-center gap-1 text-white/90;
  cursor: default;
}

.fps-row {
  @apply flex min-w-0 items-center gap-1;
}

.fps-label {
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}

.auto-label {
  @apply whitespace-nowrap text-[10px] leading-none;
}

.fps-input {
  width: 38px;
}

.fps-input :deep(.ant-input-number-input) {
  height: 18px;
  padding: 0 4px;
  font-size: 11px;
  text-align: center;
}

.fps-input :deep(.ant-input-number) {
  height: 20px;
}

.fps-auto-switch {
  min-width: 24px;
  height: 14px;
}

.fps-auto-switch :deep(.ant-switch-handle) {
  width: 10px;
  height: 10px;
}
</style>
