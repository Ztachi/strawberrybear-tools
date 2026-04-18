<script setup lang="ts">
/**
 * @description: 按键日志弹窗组件
 * @description 显示按键日志的历史记录，支持按章节分组展示
 */
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FileText } from 'lucide-vue-next'
import type { KeyLogEntry, KeyLogChapter } from '@/lib/keyboardMapper'

const { t } = useI18n()

/**
 * @description: 组件属性
 * @param {Set<string>} activeKeys - 当前激活的按键 code 集合
 * @param {KeyLogEntry[]} keyLog - 按键日志数组
 * @param {() => KeyLogChapter[]} getKeyLogByChapters - 获取按章节分组的按键日志
 * @param {() => void} clearKeyLog - 清空按键日志的回调
 */
const props = defineProps<{
  activeKeys: Set<string>
  keyLog: KeyLogEntry[]
  getKeyLogByChapters: () => KeyLogChapter[]
  clearKeyLog: () => void
}>()

/** 章节化后的日志（响应式计算） @return {KeyLogChapter[]} */
const chaptersLog = computed(() => props.getKeyLogByChapters())

/** Popover 打开状态 @return {boolean} */
const isOpen = ref(false)

/** 日志容器 DOM 引用 */
const logContainer = ref<HTMLElement | null>(null)

/**
 * @description: 格式化时间显示
 * @param {number} ms - 毫秒时间戳
 * @return {string} 格式化后的时间字符串 (MM:SS.fff)
 *
 * @example
 * formatTime(65000) // "01:05.000"
 */
function formatTime(ms: number): string {
  const seconds = ms / 1000
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`
}

/**
 * @description: 监听日志变化，自动滚动到底部
 * 当 Popover 打开且有新的日志时，滚动到容器底部
 */
watch(
  () => props.keyLog.length,
  async () => {
    if (isOpen.value) {
      await nextTick()
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight
      }
    }
  }
)
</script>

<template>
  <Popover v-model:open="isOpen">
    <!-- 触发器按钮 -->
    <PopoverTrigger as-child>
      <button class="log-btn">
        <FileText :size="14" />
        {{ t('player.keyLog') }}
      </button>
    </PopoverTrigger>

    <!-- 弹窗内容 -->
    <PopoverContent class="keylog-content" align="end">
      <div class="flex flex-col max-h-[400px]">
        <!-- 标题栏 -->
        <div class="px-3 py-2 border-b content-header flex items-center justify-between">
          <h4 class="text-sm font-medium text-primary">
            {{ t('player.keyLog') }}
          </h4>
          <!-- 清空按钮 -->
          <button
            v-if="keyLog.length > 0"
            class="text-xs text-muted hover:text-primary px-1.5 py-0.5 rounded transition-colors"
            @click="clearKeyLog"
          >
            {{ t('actions.clear') }}
          </button>
        </div>

        <!-- 日志内容区域 -->
        <div ref="logContainer" class="overflow-y-auto flex-1">
          <!-- 空状态 -->
          <div v-if="chaptersLog.length === 0" class="text-center text-sm py-8 text-muted">
            {{ t('player.noKeyLog') }}
          </div>

          <!-- 章节化日志 -->
          <div v-else class="p-2">
            <!-- 遍历每个章节 -->
            <div v-for="chapter in chaptersLog" :key="chapter.name" class="mb-3 last:mb-0">
              <!-- 章节标题栏 -->
              <div class="flex items-center justify-between px-2 py-1 bg-primary/5 rounded">
                <span class="text-xs font-medium text-primary">{{ chapter.name }}</span>
                <span class="text-xs text-muted">
                  {{ formatTime(chapter.startTime) }} - {{ formatTime(chapter.endTime) }}
                </span>
              </div>

              <!-- 章节内的日志条目 -->
              <div class="mt-1 space-y-0.5">
                <div
                  v-for="(entry, index) in chapter.entries"
                  :key="`${entry.time}-${index}`"
                  class="flex items-center gap-2 text-xs px-2 py-0.5 hover:bg-primary/5 rounded"
                >
                  <!-- 时间戳 -->
                  <span class="font-mono text-muted w-16">{{ formatTime(entry.time) }}</span>
                  <!-- 动作图标 -->
                  <span
                    class="font-medium w-8"
                    :class="entry.action === 'press' ? 'text-green-500' : 'text-red-500'"
                  >
                    {{ entry.action === 'press' ? '↓' : '↑' }}
                  </span>
                  <!-- 按键名称 -->
                  <span class="font-medium text-primary w-8">{{ entry.key }}</span>
                  <!-- 按键代码 -->
                  <span
                    class="font-mono w-14"
                    >{{ entry.code.replace('Key', '').replace('Digit', '') }}</span
                  >
                  <!-- 音高映射 -->
                  <span class="text-muted">{{ entry.originalPitch }}→{{ entry.pitch }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
.log-btn {
  @apply flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all;
  background: var(--bg-primary-10);
  border: 1px solid var(--border-primary-20);
  color: var(--color-primary);
}

.log-btn:hover {
  background: var(--bg-primary-20);
}

.keylog-content {
  background: var(--bg-white-95);
  border: 1px solid var(--border-primary-20);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.content-header {
  border-color: var(--border-primary-15);
}
</style>
