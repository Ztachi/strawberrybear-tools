<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/BaseModal/BaseModal.vue'
import type { GameSession } from '@/game/types'

const props = defineProps<{ session: GameSession; allowReplay?: boolean }>()
const emit = defineEmits<{ close: []; replay: [] }>()
const { t } = useI18n()
const shareUrl = ref('')
const harvested = computed(() =>
  props.session.collected.reduce((sum, item) => sum + item.count, 0),
)

/**
 * @description 由固定结果生成可保存的分享图
 * @return {void}
 */
function generateShare(): void {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const context = canvas.getContext('2d')
  if (!context) return
  const gradient = context.createLinearGradient(0, 0, 1080, 1440)
  gradient.addColorStop(0, '#3c2851')
  gradient.addColorStop(1, '#d87899')
  context.fillStyle = gradient
  context.fillRect(0, 0, 1080, 1440)
  context.fillStyle = '#fff8ed'
  context.textAlign = 'center'
  context.font = 'bold 72px sans-serif'
  context.fillText('萌园园上岗日', 540, 180)
  context.font = 'bold 96px sans-serif'
  context.fillText(t(`title.${props.session.finalTitle}`), 540, 420)
  context.font = '52px sans-serif'
  context.fillText(`万象星实 ${props.session.currency.toLocaleString()}`, 540, 620)
  context.fillText(`有效上班 ${Math.floor(props.session.elapsedMs / 1000)} 秒`, 540, 730)
  context.fillText(`最高连续劳动 ×${props.session.maxCombo}`, 540, 840)
  context.font = '42px sans-serif'
  context.fillText('暖暖：今天也有好好监督萌园园！', 540, 1210)
  shareUrl.value = canvas.toDataURL('image/png')
}
</script>

<template>
  <BaseModal :title="$t('report.title')" @close="emit('close')">
    <div class="text-center">
      <p class="mb-1 text-sm text-white/60">
        {{ $t('report.title') }}
      </p>
      <h3 class="font-display text-3xl font-black text-[var(--gold)]">
        {{ $t(`title.${session.finalTitle}`) }}
      </h3>
    </div>
    <dl class="my-6 grid grid-cols-2 gap-3">
      <div class="stat-card">
        <dt>{{ $t('report.duration') }}</dt>
        <dd>{{ Math.floor(session.elapsedMs / 1000) }}s</dd>
      </div>
      <div class="stat-card">
        <dt>{{ $t('report.currency') }}</dt>
        <dd>{{ session.currency.toLocaleString() }}</dd>
      </div>
      <div class="stat-card">
        <dt>{{ $t('report.harvested') }}</dt>
        <dd>{{ harvested }}</dd>
      </div>
      <div class="stat-card">
        <dt>{{ $t('report.combo') }}</dt>
        <dd>×{{ session.maxCombo }}</dd>
      </div>
    </dl>
    <div class="mb-6 space-y-2 rounded-2xl bg-white/5 p-4">
      <div v-for="item in session.collected" :key="item.id" class="flex justify-between">
        <span>{{ $t(item.nameKey) }}</span
        ><strong>×{{ item.count }}</strong>
      </div>
    </div>
    <img v-if="shareUrl" class="mb-4 w-full rounded-2xl" :src="shareUrl" alt="分享图预览" />
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
        download="萌园园上岗日.png"
      >
        {{ $t('common.save') }}
      </a>
    </div>
  </BaseModal>
</template>
