<script setup lang="ts">
import { ref } from 'vue'
import AppLoader from '@/components/AppLoader/AppLoader.vue'

const ready = ref(false)
</script>

<template>
  <AppLoader v-if="!ready" @ready="ready = true" />
  <RouterView v-else />
</template>
