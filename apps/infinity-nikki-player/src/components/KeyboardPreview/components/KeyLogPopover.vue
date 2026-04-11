<script setup lang="ts">
/**
 * @description: 按键日志弹窗组件
 */
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FileText } from 'lucide-vue-next'
import type { KeyLogEntry, KeyLogChapter } from '@/lib/keyboardMapper'

const { t } = useI18n()

const props = defineProps<{
  activeKeys: Set<string> // 当前激活的按键 code 集合
  keyLog: KeyLogEntry[] // 按键日志
  getKeyLogByChapters: () => KeyLogChapter[]
  clearKeyLog: () => void // 清空按键日志
}>()

/** 章节化后的日志（响应式） */
const chaptersLog = computed(() => props.getKeyLogByChapters())

/** Popover 打开状态 */
const isOpen = ref(false)

/** 日志容器引用 */
const logContainer = ref<HTMLElement | null>(null)

/** 格式化时间（毫秒保留3位但显示1位） */
function formatTime(ms: number): string {
  const seconds = ms / 1000
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`
}

/** 当日志变化且 Popover 打开时，滚动到底部 */
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
    <PopoverTrigger as-child>
      <button class="log-btn">
        <FileText :size="14" />
        {{ t('player.keyLog') }}
      </button>
    </PopoverTrigger>
    <PopoverContent class="keylog-content" align="end">
      <div class="flex flex-col max-h-[400px]">
        <!-- 标题 -->
        <div class="px-3 py-2 border-b content-header flex items-center justify-between">
          <h4 class="text-sm font-medium text-primary">
            {{ t('player.keyLog') }}
          </h4>
          <button
            v-if="keyLog.length > 0"
            class="text-xs text-muted hover:text-primary px-1.5 py-0.5 rounded transition-colors"
            @click="clearKeyLog"
          >
            {{ t('actions.clear') }}
          </button>
        </div>

        <!-- 日志内容 -->
        <div ref="logContainer" class="overflow-y-auto flex-1">
          <div v-if="chaptersLog.length === 0" class="text-center text-sm py-8 text-muted">
            {{ t('player.noKeyLog') }}
          </div>
          <div v-else class="p-2">
            <div v-for="chapter in chaptersLog" :key="chapter.name" class="mb-3 last:mb-0">
              <!-- 章节标题 -->
              <div class="flex items-center justify-between px-2 py-1 bg-primary/5 rounded">
                <span class="text-xs font-medium text-primary">{{ chapter.name }}</span>
                <span class="text-xs text-muted">
                  {{ formatTime(chapter.startTime) }} - {{ formatTime(chapter.endTime) }}
                </span>
              </div>
              <!-- 日志条目 -->
              <div class="mt-1 space-y-0.5">
                <div
                  v-for="(entry, index) in chapter.entries"
                  :key="`${entry.time}-${index}`"
                  class="flex items-center gap-2 text-xs px-2 py-0.5 hover:bg-primary/5 rounded"
                >
                  <span class="font-mono text-muted w-16">{{ formatTime(entry.time) }}</span>
                  <span
                    class="font-medium w-8"
                    :class="entry.action === 'press' ? 'text-green-500' : 'text-red-500'"
                  >
                    {{ entry.action === 'press' ? '↓' : '↑' }}
                  </span>
                  <span class="font-medium text-primary w-8">{{ entry.key }}</span>
                  <span
                    class="font-mono w-14"
                    >{{ entry.code.replace('Key', '').replace('Digit', '') }}</span
                  >
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
