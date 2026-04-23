<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:27:29
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:27:30
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/views/GameView.vue
 * @Description: 
-->
<script setup lang="ts">
/**
 * @description: GameView — 游戏视图
 * @description 包含全屏 GameCanvas 和叠加的 HUD 层
 */
import GameCanvas from '../components/GameCanvas.vue'
import GameHUD from '../components/GameHUD.vue'
</script>

<template>
  <div class="relative w-screen h-screen overflow-hidden bg-black">
    <!-- 全屏游戏画布 -->
    <div class="absolute inset-0">
      <GameCanvas />
    </div>
    <!-- HUD 叠加层（pointer-events-none 在 GameHUD 内部管理） -->
    <GameHUD />
  </div>
</template>
