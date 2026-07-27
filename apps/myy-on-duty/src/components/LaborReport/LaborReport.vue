<script setup lang="ts">
import { NIKKI_COLORS } from '@strawberrybear/nikki-theme'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/BaseModal/BaseModal.vue'
import type { GameSession } from '@/game/types'

const props = defineProps<{ session: GameSession; allowReplay?: boolean }>()
const emit = defineEmits<{ close: []; replay: [] }>()
const { t, locale } = useI18n()
const shareUrl = ref('')
const titleKey = computed(() => props.session.finalTitle ?? 'escapeHelper')
const harvested = computed(() =>
  props.session.collected.reduce((sum, item) => sum + item.count, 0)
)
const inspectionIncome = computed(() =>
  props.session.sales.reduce((sum, sale) => sum + sale.earned, 0)
)
const leftoverIncome = computed(() => props.session.stats.leftoverValue ?? 0)
const bestMultiplier = computed(() =>
  props.session.sales.reduce((best, sale) => Math.max(best, sale.multiplier), 0)
)
const eventCount = computed(() =>
  Object.entries(props.session.stats)
    .filter(([key]) => key.startsWith('event:'))
    .reduce((sum, [, count]) => sum + count, 0)
)
const materialGroups = computed(() =>
  (['farm', 'pond', 'nest', 'meteor'] as const).map((source) => ({
    source,
    items: props.session.collected.filter((item) => item.source === source && item.count > 0),
    count: props.session.collected
      .filter((item) => item.source === source)
      .reduce((sum, item) => sum + item.count, 0),
  }))
)
const highlights = computed(() =>
  (props.session.highlights ?? []).slice(0, 3).map(formatHighlight)
)

/**
 * @description 格式化毫秒时长
 * @param {number} elapsedMs 时长毫秒
 * @return {string} 时分秒文本
 */
function formatDuration(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/**
 * @description 将持久化亮点代码翻译为当前语言
 * @param {string} encoded 固定亮点代码
 * @return {string} 展示文案
 */
function formatHighlight(encoded: string): string {
  const separator = encoded.lastIndexOf(':')
  if (separator < 0) return encoded
  const key = encoded.slice(0, separator)
  const value = encoded.slice(separator + 1)
  if (key === 'report.highlight.rare') return t(key, { material: t(value) })
  if (key === 'report.highlight.multiplier') return t(key, { value: Number(value).toFixed(1) })
  return t(key, { value: Number(value).toLocaleString() })
}

/**
 * @description 在分享图中居中绘制一行文本
 * @param {CanvasRenderingContext2D} context Canvas 上下文
 * @param {string} text 文本
 * @param {number} y 纵坐标
 * @return {void}
 */
function drawCentered(context: CanvasRenderingContext2D, text: string, y: number): void {
  context.fillText(text, 540, y, 940)
}

/** @description 由固定历史结果生成可保存的分享图 @return {void} */
function generateShare(): void {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const context = canvas.getContext('2d')
  if (!context) return
  const gradient = context.createLinearGradient(0, 0, 1080, 1440)
  gradient.addColorStop(0, NIKKI_COLORS.primaryLight)
  gradient.addColorStop(0.55, NIKKI_COLORS.primary)
  gradient.addColorStop(1, NIKKI_COLORS.primaryHover)
  context.fillStyle = gradient
  context.fillRect(0, 0, 1080, 1440)
  context.fillStyle = 'rgba(255,255,255,0.35)'
  context.beginPath()
  context.arc(170, 180, 120, 0, Math.PI * 2)
  context.arc(925, 1110, 190, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = NIKKI_COLORS.mutedDark
  context.textAlign = 'center'
  context.font = '700 62px sans-serif'
  drawCentered(context, t('home.title'), 155)
  context.font = '900 88px sans-serif'
  context.fillStyle = NIKKI_COLORS.primaryActive
  drawCentered(context, t(`title.${titleKey.value}`), 350)
  context.fillStyle = NIKKI_COLORS.foreground
  context.font = '600 46px sans-serif'
  drawCentered(context, `${t('report.currency')}  ${props.session.currency.toLocaleString()}`, 500)
  drawCentered(context, `${t('report.duration')}  ${formatDuration(props.session.elapsedMs)}`, 585)
  context.fillStyle = 'rgba(255,255,255,0.55)'
  context.fillRect(120, 680, 840, 2)
  context.fillStyle = NIKKI_COLORS.foreground
  context.font = '500 40px sans-serif'
  highlights.value.forEach((highlight, index) => drawCentered(context, highlight, 790 + index * 90))
  context.font = '700 38px sans-serif'
  context.fillStyle = NIKKI_COLORS.primaryActive
  drawCentered(context, t('report.shareCopy'), 1280)
  shareUrl.value = canvas.toDataURL('image/png')
}
</script>

<template>
  <BaseModal :title="$t('report.title')" @close="emit('close')">
    <header class="text-center">
      <p class="mb-1 text-sm text-[var(--color-muted)]">
        {{ $t('report.performance') }}
      </p>
      <h3 class="font-display text-3xl font-black text-[var(--color-primary-active)]">
        {{ $t(`title.${titleKey}`) }}
      </h3>
      <p v-if="highlights.length" class="mt-3 text-sm leading-6 text-[var(--color-muted-dark)]">
        {{ highlights.join(' · ') }}
      </p>
    </header>

    <dl class="my-6 grid grid-cols-2 gap-3">
      <div class="stat-card">
        <dt>{{ $t('report.startedAt') }}</dt>
        <dd class="!text-base">
          {{ new Date(session.startedAt).toLocaleString(locale) }}
        </dd>
      </div>
      <div class="stat-card">
        <dt>{{ $t('report.duration') }}</dt>
        <dd>{{ formatDuration(session.elapsedMs) }}</dd>
      </div>
      <div class="stat-card">
        <dt>{{ $t('report.currency') }}</dt>
        <dd>{{ session.currency.toLocaleString() }}</dd>
      </div>
      <div class="stat-card">
        <dt>{{ $t('report.harvested') }}</dt>
        <dd>{{ harvested }}</dd>
      </div>
    </dl>

    <section class="mb-5 rounded-2xl bg-[var(--color-primary-light)] p-4">
      <h4 class="font-bold text-[var(--gold)]">
        {{ $t('report.incomeTitle') }}
      </h4>
      <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.inspectionIncome') }}
          </dt>
          <dd>{{ inspectionIncome.toLocaleString() }}</dd>
        </div>
        <div>
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.leftoverIncome') }}
          </dt>
          <dd>{{ leftoverIncome.toLocaleString() }}</dd>
        </div>
      </dl>
    </section>

    <section class="mb-5">
      <h4 class="mb-3 font-bold text-[var(--gold)]">
        {{ $t('report.materialTitle') }}
      </h4>
      <details
        v-for="group in materialGroups"
        :key="group.source"
        class="mb-2 rounded-2xl bg-[var(--color-primary-light)] p-4"
      >
        <summary class="cursor-pointer font-bold">
          {{ $t(`game.device.${group.source}`) }} · {{ group.count }}
        </summary>
        <p v-if="!group.items.length" class="mt-3 text-sm text-[var(--color-muted)]">
          {{ $t('report.noMaterial') }}
        </p>
        <div v-for="item in group.items" :key="item.id" class="mt-3 flex justify-between text-sm">
          <span>{{ $t(item.nameKey) }}</span>
          <strong>×{{ item.count }}</strong>
        </div>
      </details>
    </section>

    <section class="mb-5 rounded-2xl bg-[var(--color-primary-light)] p-4">
      <h4 class="font-bold text-[var(--gold)]">
        {{ $t('report.gameplayTitle') }}
      </h4>
      <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.combo') }}
          </dt>
          <dd>×{{ session.maxCombo }}</dd>
        </div>
        <div>
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.inspections') }}
          </dt>
          <dd>{{ session.sales.length }}</dd>
        </div>
        <div>
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.bestMultiplier') }}
          </dt>
          <dd>×{{ bestMultiplier.toFixed(1) }}</dd>
        </div>
        <div>
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.targets') }}
          </dt>
          <dd>{{ session.stats.targetRounds ?? 0 }}</dd>
        </div>
        <div>
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.excuses') }}
          </dt>
          <dd>{{ session.stats.excuses ?? 0 }}</dd>
        </div>
        <div>
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.events') }}
          </dt>
          <dd>{{ eventCount }}</dd>
        </div>
        <div>
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.loops') }}
          </dt>
          <dd>{{ session.stats.loop ?? 0 }}</dd>
        </div>
        <div>
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.rescues') }}
          </dt>
          <dd>{{ session.rescueCount }}</dd>
        </div>
        <div class="col-span-2">
          <dt class="text-[var(--color-muted)]">
            {{ $t('report.endReason') }}
          </dt>
          <dd>{{ $t(`game.end.${session.endReason ?? 'drain'}`) }}</dd>
        </div>
      </dl>
    </section>

    <section v-if="highlights.length" class="mb-5 rounded-2xl bg-[var(--color-primary-light)] p-4">
      <h4 class="font-bold text-[var(--gold)]">
        {{ $t('report.highlightsTitle') }}
      </h4>
      <ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--color-muted-dark)]">
        <li v-for="highlight in highlights" :key="highlight">
          {{ highlight }}
        </li>
      </ul>
    </section>

    <img
      v-if="shareUrl"
      class="mb-4 w-full rounded-2xl"
      :src="shareUrl"
      :alt="$t('report.sharePreview')"
    />
    <div class="grid gap-3">
      <button v-if="allowReplay" class="primary-button" @click="emit('replay')">
        {{ $t('report.again') }}
      </button>
      <button class="secondary-button" @click="generateShare">
        {{ $t('report.share') }}
      </button>
      <a
        v-if="shareUrl"
        class="secondary-button text-center"
        :href="shareUrl"
        download="myy-on-duty.png"
      >
        {{ $t('common.save') }}
      </a>
      <button class="secondary-button" @click="emit('close')">
        {{ allowReplay ? $t('report.home') : $t('common.close') }}
      </button>
    </div>
  </BaseModal>
</template>
