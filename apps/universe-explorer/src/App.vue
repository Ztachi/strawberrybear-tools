<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:27:57
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:27:58
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/App.vue
 * @Description: 
-->
<script setup lang="ts">
/**
 * @description: App — 根组件
 * @description 根据 gamePhase 状态切换 StartView / GameView，不直接操作 Babylon.js
 */
import { useGameStore } from './stores/game'
import StartView from './views/StartView.vue'
import GameView from './views/GameView.vue'

const gameStore = useGameStore()
</script>

<template>
  <StartView v-if="gameStore.gamePhase === 'idle'" />
  <GameView v-else />
</template>
