<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:27:24
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 18:30:00
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/components/GameHUD.vue
 * @Description: 游戏内 HUD 覆盖层
-->
<script setup lang="ts">
/**
 * @description: GameHUD — 游戏内 HUD 覆盖层
 * @description 操控说明面板（左上角）+ 音乐开关（右下角）+ 返回按钮（右上角）
 * @description pointer-events-none 确保不阻挡 Canvas 鼠标事件
 * @description 音频控制：Vue 层仅修改 store 状态，AudioSystem 监听并响应
 */
import { Volume2, VolumeX } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'

const { t } = useI18n()
const gameStore = useGameStore()
</script>

<template>
  <div class="absolute inset-0 pointer-events-none select-none">
    <!-- 左上角：操控说明 -->
    <div
      class="absolute top-4 left-4 rounded-lg p-3 text-xs text-white/70 space-y-1"
      style="background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px)"
    >
      <p class="text-white/90 font-semibold mb-1">
        {{ t('game.controls.title') }}
      </p>
      <p>{{ t('game.controls.wasd') }}</p>
      <p>{{ t('game.controls.space') }}</p>
      <p>{{ t('game.controls.shift') }}</p>
      <p>{{ t('game.controls.mouse') }}</p>
      <p>{{ t('game.controls.esc') }}</p>
    </div>

    <!-- 右下角：音乐开关（通过 store.musicEnabled 控制，AudioSystem 监听状态变化） -->
    <div class="absolute bottom-4 right-4 pointer-events-auto">
      <button
        class="p-2 rounded-full text-white/70 hover:text-white transition-colors cursor-pointer"
        style="background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px)"
        :title="gameStore.musicEnabled ? t('game.audio.mute') : t('game.audio.play')"
        @click="gameStore.toggleMusic()"
      >
        <Volume2 v-if="gameStore.musicEnabled" :size="20" />
        <VolumeX v-else :size="20" />
      </button>
    </div>

    <!-- 右上角：返回按钮（需要 pointer-events-auto 才可点击） -->
    <div class="absolute top-4 right-4 pointer-events-auto">
      <button
        class="px-3 py-1.5 rounded text-xs text-white/70 hover:text-white transition-colors cursor-pointer"
        style="background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px)"
        @click="gameStore.stopGame()"
      >
        {{ t('game.backButton') }}
      </button>
    </div>
  </div>
</template>
