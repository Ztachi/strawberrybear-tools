<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-18 18:23:18
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-18 18:23:20
 * @FilePath: /strawberrybear-tools/apps/sensitive-word-checker/src/components/ResultPanel.vue
 * @Description: 
-->
<script setup lang="ts">
/**
 * @description: ResultPanel - 扫描结果展示面板，高亮显示敏感词并提供风险统计和复制功能
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatchPosition, ScanResult, RiskLevel } from '../types'

const props = defineProps<{
  result: ScanResult | null
}>()

const { t } = useI18n()
const copied = ref(false)
const riskFilter = ref<Record<RiskLevel, boolean>>({
  high: true,
  medium: true,
  low: true,
})

interface RenderSegment {
  text: string
  match?: MatchPosition
  highlighted: boolean
}

function toggleRisk(level: RiskLevel) {
  riskFilter.value[level] = !riskFilter.value[level]
}

const renderSegments = computed<RenderSegment[]>(() => {
  if (!props.result) return []

  const { originalText, matches } = props.result
  if (matches.length === 0) {
    return [{ text: originalText, highlighted: false }]
  }

  const segments: RenderSegment[] = []
  let cursor = 0

  for (const match of matches) {
    if (match.start < cursor) continue

    if (match.start > cursor) {
      segments.push({
        text: originalText.slice(cursor, match.start),
        highlighted: false,
      })
    }

    segments.push({
      text: originalText.slice(match.start, match.end),
      match,
      highlighted: riskFilter.value[match.category],
    })

    cursor = match.end
  }

  if (cursor < originalText.length) {
    segments.push({ text: originalText.slice(cursor), highlighted: false })
  }

  return segments
})

const totalMatches = computed(() => {
  if (!props.result) return 0
  return props.result.matches.length
})

const isEmpty = computed(() => !props.result)
const isNoMatch = computed(() => props.result !== null && totalMatches.value === 0)

function getRiskTooltipText(match: MatchPosition): string {
  return `${t(`risk.${match.category}`)} | ${t('risk.typeLabel')}: ${match.riskType ?? t('risk.typeOther')}`
}

async function copyResult() {
  if (!props.result) return

  const { originalText, matches, summary } = props.result

  let report = t('risk.copyReport') + '\n'

  if (matches.length === 0) {
    report += t('risk.copyNoMatch') + '\n'
  } else {
    // 按风险等级分组列出命中词（去重）
    const levels: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low']
    for (const level of levels) {
      const words = [...new Set(matches.filter((m) => m.category === level).map((m) => m.word))]
      if (words.length > 0) {
        report += `${t(`risk.${level}`)}(${summary[level]}): ${words.join('、')}\n`
      }
    }
  }

  report += '\n' + t('risk.copyOriginal') + originalText

  await navigator.clipboard.writeText(report)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <v-card variant="outlined" rounded="xl" class="border-primary-20 h-full">
    <v-card-text class="pa-4 flex flex-col h-full">
      <!-- 头部：标题 + 统计 + 复制按钮 -->
      <div class="flex items-start justify-between mb-3 gap-2 flex-wrap">
        <p class="text-sm font-semibold">
          {{ t('page.home.resultLabel') }}
        </p>

        <div class="flex items-center gap-2 flex-wrap">
          <!-- 风险统计 chips -->
          <template v-if="result && totalMatches > 0">
            <v-chip
              v-if="result.summary.high > 0"
              size="small"
              color="error"
              :variant="riskFilter.high ? 'tonal' : 'outlined'"
              :class="{ 'chip-off': !riskFilter.high }"
              class="cursor-pointer"
              @click="toggleRisk('high')"
            >
              {{ t('risk.high') }} {{ result.summary.high }}
            </v-chip>
            <v-chip
              v-if="result.summary.medium > 0"
              size="small"
              color="warning"
              :variant="riskFilter.medium ? 'tonal' : 'outlined'"
              :class="{ 'chip-off': !riskFilter.medium }"
              class="cursor-pointer"
              @click="toggleRisk('medium')"
            >
              {{ t('risk.medium') }} {{ result.summary.medium }}
            </v-chip>
            <v-chip
              v-if="result.summary.low > 0"
              size="small"
              color="success"
              :variant="riskFilter.low ? 'tonal' : 'outlined'"
              :class="{ 'chip-off': !riskFilter.low }"
              class="cursor-pointer"
              @click="toggleRisk('low')"
            >
              {{ t('risk.low') }} {{ result.summary.low }}
            </v-chip>
          </template>

          <!-- 复制按钮 -->
          <v-btn
            v-if="result"
            :prepend-icon="copied ? 'mdi-check' : 'mdi-content-copy'"
            :color="copied ? 'success' : undefined"
            variant="text"
            size="small"
            rounded="lg"
            @click="copyResult"
          >
            {{ copied ? t('common.button.copied') : t('common.button.copy') }}
          </v-btn>
        </div>
      </div>

      <!-- 总命中数 -->
      <p v-if="result && totalMatches > 0" class="text-xs text-medium-emphasis mb-3">
        {{ t('risk.summary', { total: totalMatches }) }} —
        {{
          t('risk.summaryDetail', {
            high: result.summary.high,
            medium: result.summary.medium,
            low: result.summary.low,
          })
        }}
      </p>

      <!-- 空状态 -->
      <div
        v-if="isEmpty"
        class="flex flex-col items-center justify-center flex-1 gap-2 py-12 text-center"
      >
        <v-icon icon="mdi-text-search" size="48" color="primary" class="opacity-40" />
        <p class="text-sm text-medium-emphasis">
          {{ t('page.home.resultEmpty') }}
        </p>
        <p class="text-xs text-disabled">
          {{ t('page.home.resultEmptyHint') }}
        </p>
      </div>

      <!-- 无命中 -->
      <div
        v-else-if="isNoMatch"
        class="flex flex-col items-center justify-center flex-1 gap-2 py-12 text-center"
      >
        <v-icon icon="mdi-check-circle-outline" size="48" color="success" class="opacity-70" />
        <p class="text-sm font-medium text-success">
          {{ t('risk.noResult') }}
        </p>
      </div>

      <!-- 高亮结果：使用真实节点 + tooltip，不使用 title 属性 -->
      <div
        v-else-if="result"
        class="result-content result-surface flex-1 overflow-auto text-sm leading-relaxed rounded-lg p-3"
      >
        <template v-for="(segment, idx) in renderSegments" :key="idx">
          <v-tooltip
            v-if="segment.match && segment.highlighted"
            location="top"
            content-class="risk-tooltip"
          >
            <template #activator="{ props: tooltipProps }">
              <mark
                v-bind="tooltipProps"
                :class="`risk-${segment.match.category}`"
                >{{ segment.text }}</mark
              >
            </template>
            <span>{{ getRiskTooltipText(segment.match) }}</span>
          </v-tooltip>

          <span v-else>{{ segment.text }}</span>
        </template>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.result-content {
  color: rgba(var(--v-theme-on-surface), 0.87);
  white-space: pre-wrap;
  word-break: break-word;
}

.result-surface {
  background-color: rgb(var(--v-theme-surface-variant));
}

.result-content :deep(mark) {
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 500;
}

.result-content :deep(.risk-high) {
  background-color: #ef4444;
  color: #ffffff;
}

.result-content :deep(.risk-medium) {
  background-color: #f59e0b;
  color: #1a1a1a;
}

.result-content :deep(.risk-low) {
  background-color: #22c55e;
  color: #ffffff;
}

.chip-off {
  opacity: 0.55;
}
</style>
