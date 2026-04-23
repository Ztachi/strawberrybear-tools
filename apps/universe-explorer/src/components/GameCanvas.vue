<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:27:16
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:27:17
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/components/GameCanvas.vue
 * @Description: 
-->
<script setup lang="ts">
/**
 * @description: GameCanvas — 游戏画布组件
 * @description 挂载时初始化 GameManager 并启动渲染循环，卸载时销毁释放资源
 * @description 是 Vue 层与 Babylon.js 引擎交互的唯一入口
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { GameManager } from '../game/GameManager'

const canvasRef = ref<HTMLCanvasElement | null>(null)

onMounted(async () => {
  if (!canvasRef.value) return
  await GameManager.instance.init(canvasRef.value)
  GameManager.instance.start()
})

onUnmounted(() => {
  GameManager.instance.dispose()
})
</script>

<template>
  <canvas ref="canvasRef" class="block w-full h-full" />
</template>
