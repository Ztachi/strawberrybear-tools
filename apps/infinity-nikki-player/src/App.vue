<script setup lang="ts">
import { inject } from 'vue'
import MainWindow from './views/MainWindow.vue'
import OverlayWindow from './views/OverlayWindow.vue'

const windowLabel = inject<string>('windowLabel', 'main')
</script>

<template>
  <MainWindow v-if="windowLabel === 'main'" />
  <OverlayWindow v-else-if="windowLabel === 'overlay'" />
</template>
