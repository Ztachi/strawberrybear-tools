<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { db } from '@/db/database'
import { router } from '@/router'

const emit = defineEmits<{ ready: [] }>()
const progress = ref(0)
const failed = ref(false)

onMounted(() => void loadResources())

/** @description 打开首屏依赖并在失败时保留可重试状态 @return {Promise<void>} 加载完成 */
async function loadResources(): Promise<void> {
  failed.value = false
  progress.value = 8
  try {
    const minimumVisibleTime = new Promise((resolve) => window.setTimeout(resolve, 1000))
    await db.open()
    progress.value = 45
    await router.isReady()
    progress.value = 72
    await document.fonts?.ready
    progress.value = 92
    await minimumVisibleTime
    progress.value = 100
    emit('ready')
  } catch {
    failed.value = true
  }
}
</script>

<template>
  <main class="home-scene grid min-h-dvh place-items-center px-6 text-center">
    <section class="w-full max-w-sm">
      <div class="mascot mx-auto mb-8 !w-32 !text-5xl" aria-hidden="true">萌</div>
      <h1 class="font-display text-4xl font-black">
        {{ $t('loading.title') }}
      </h1>
      <template v-if="!failed">
        <div
          class="mt-8 h-3 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          :aria-valuenow="progress"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="h-full rounded-full bg-gradient-to-r from-[var(--gold)] to-[var(--pink)] transition-[width] duration-300"
            :style="{ width: `${progress}%` }"
          />
        </div>
        <p class="mt-4 text-white/65">
          {{ $t('loading.progress', { progress }) }}
        </p>
      </template>
      <template v-else>
        <h2 class="mt-8 text-xl font-bold text-[var(--gold)]">
          {{ $t('loading.failed') }}
        </h2>
        <p class="mt-3 text-white/65">
          {{ $t('loading.failedDetail') }}
        </p>
        <button class="primary-button mt-6 w-full" @click="loadResources">
          {{ $t('common.retry') }}
        </button>
      </template>
    </section>
  </main>
</template>
