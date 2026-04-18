<script setup lang="ts">
/**
 * @description: MIDI 文件 Tab 页
 * @description 显示 MIDI 文件库列表
 */
import MidiLibrary from './components/MidiLibrary/index.vue'
</script>

<template>
  <!-- MIDI 库组件，占用全部可用空间 -->
  <MidiLibrary class="flex-1" />
</template>
