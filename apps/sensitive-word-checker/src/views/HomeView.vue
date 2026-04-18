<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:23:26
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:23:27
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/views/HomeView.vue
 * @Description: 
-->
<script setup lang="ts">
/**
 * @description: HomeView - 主视图，响应式双列（PC）/ 单列（移动端）布局
 */
import { ref } from 'vue'
import TextInputPanel from '../components/TextInputPanel.vue'
import ResultPanel from '../components/ResultPanel.vue'
import LexiconManager from '../components/LexiconManager.vue'
import type { ScanResult } from '../types'

const scanResult = ref<ScanResult | null>(null)

function onScanResult(result: ScanResult) {
  scanResult.value = result
}
</script>

<template>
  <v-container fluid class="pa-4 h-full">
    <v-row class="h-full" align="stretch">
      <!-- 左列（PC）/ 上方（移动端）：输入 + 词库管理 -->
      <v-col cols="12" md="6" class="flex flex-col gap-4">
        <TextInputPanel @result="onScanResult" />
        <LexiconManager />
      </v-col>

      <!-- 右列（PC）/ 下方（移动端）：结果展示 -->
      <v-col cols="12" md="6" class="flex flex-col">
        <ResultPanel :result="scanResult" class="flex-1" />
      </v-col>
    </v-row>
  </v-container>
</template>
