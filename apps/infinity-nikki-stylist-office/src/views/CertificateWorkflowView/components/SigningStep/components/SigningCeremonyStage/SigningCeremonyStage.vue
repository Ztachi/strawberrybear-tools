<script setup lang="ts">
/**
 * @description: SigningCeremonyStage - 正本签发仪式舞台
 * @description 使用 GSAP timeline 编排六阶段动画，并在减少动态时降级为轻量过渡。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import gsap from 'gsap'
import { playCeremonySound } from '@/plugins/ceremonySound'
import type { SigningProgressItem } from '../../types'

const props = defineProps<{
  /** 舞台状态 */
  ceremonyStatus: 'idle' | 'running' | 'complete' | 'failed'
  /** 六阶段配置 */
  progressItems: SigningProgressItem[]
  /** 当前显示姓名 */
  stylistName: string
  /** 当前称号 */
  titleName: string
  /** 正式编号，生成前展示占位 */
  certificateNo: string
}>()

const emit = defineEmits<{
  /** 当前动画阶段变化 */
  phase: [phaseIndex: number]
  /** 动画完整结束 */
  complete: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const timeline = ref<gsap.core.Timeline | null>(null)
const gsapContext = ref<gsap.Context | null>(null)
const reducedMotionTimeouts: number[] = []
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 右侧见证视觉素材。 */
const witnessSrc = computed(() => `${import.meta.env.BASE_URL || '/'}ui/nikki/signing-witness.png`)
/** 舞台底层纹理。 */
const backgroundSrc = computed(() => `${import.meta.env.BASE_URL || '/'}ui/nikki/signing-bg.png`)

/**
 * @description: 停止当前动画
 * @return {void} 无返回值
 */
function stopTimeline(): void {
  timeline.value?.kill()
  timeline.value = null
  gsapContext.value?.revert()
  gsapContext.value = null
  reducedMotionTimeouts.splice(0).forEach((timeoutId) => window.clearTimeout(timeoutId))
}

/**
 * @description: 设置当前动画阶段
 * @param {number} phaseIndex - 阶段索引
 * @return {void} 无返回值
 */
function setPhase(phaseIndex: number): void {
  emit('phase', phaseIndex)
  playCeremonySound(phaseIndex === 3 ? 'seal' : 'phase')
}

/**
 * @description: 播放减少动态版本
 * @description 系统减少动态时不播放复杂位移，只保留阶段推进和短音提示。
 * @return {void} 无返回值
 */
function playReducedMotionCeremony(): void {
  playCeremonySound('start')
  props.progressItems.forEach((_, index) => {
    reducedMotionTimeouts.push(window.setTimeout(() => setPhase(index), 220 + index * 520))
  })
  reducedMotionTimeouts.push(
    window.setTimeout(() => {
      playCeremonySound('complete')
      emit('complete')
    }, 3600)
  )
}

/**
 * @description: 播放完整 GSAP 仪式动画
 * @description 动画只操作 transform、opacity 和滤镜类视觉属性，避免布局抖动。
 * @return {Promise<void>} 无返回值
 */
async function playCeremony(): Promise<void> {
  await nextTick()
  stopTimeline()

  if (!rootRef.value) {
    return
  }

  if (reduceMotion) {
    playReducedMotionCeremony()
    return
  }

  gsapContext.value = gsap.context(() => {
    playCeremonySound('start')
    const revealNumberCharacters = (): void => {
      void nextTick().then(() => {
        const numberCharacters = Array.from(
          rootRef.value?.querySelectorAll<HTMLElement>('.ceremony-stage__number span') ?? []
        )

        gsap.fromTo(
          numberCharacters,
          { autoAlpha: 0, y: 18, filter: 'blur(8px)' },
          {
            y: 0,
            autoAlpha: 1,
            filter: 'blur(0px)',
            stagger: 0.1,
            duration: 0.34,
            ease: 'back.out(1.4)',
          }
        )
      })
    }

    gsap.set('.ceremony-stage__dossier', { transformOrigin: '50% 50%' })
    gsap.set('.ceremony-stage__seal', { scale: 1.9, autoAlpha: 0, rotate: -22, y: -92 })
    gsap.set('.ceremony-stage__signature-line', { scaleX: 0, transformOrigin: '0% 50%' })
    gsap.set('.ceremony-stage__signature-name', { autoAlpha: 0, y: 12 })
    gsap.set('.ceremony-stage__certificate-light', { scaleY: 0, autoAlpha: 0, transformOrigin: '50% 100%' })
    gsap.set('.ceremony-stage__spark', { autoAlpha: 0, y: 8, scale: 0.5 })
    gsap.set('.ceremony-stage__number span', { autoAlpha: 0, y: 18, filter: 'blur(8px)' })

    const nextTimeline = gsap.timeline({
      defaults: { ease: 'power2.out' },
      onComplete: () => {
        playCeremonySound('complete')
        emit('complete')
      },
    })

    nextTimeline
      .call(() => setPhase(0))
      .fromTo(
        '.ceremony-stage__dossier',
        { y: 34, rotateX: 10, autoAlpha: 0.78 },
        { y: 0, rotateX: 0, autoAlpha: 1, duration: 0.9 }
      )
      .to('.ceremony-stage__dossier-fold', { scaleY: 0.34, duration: 1.05, ease: 'power1.inOut' }, '<0.26')
      .to('.ceremony-stage__sweep', { xPercent: 142, duration: 1.25, ease: 'sine.inOut' }, '<0.08')
      .to('.ceremony-stage__dossier', { boxShadow: '0 30px 70px rgba(122,78,98,0.2)', duration: 0.5 }, '<0.45')
      .call(() => setPhase(1), undefined, '+=0.55')
      .fromTo(
        '.ceremony-stage__title-badge',
        { scale: 0.9, autoAlpha: 0.66, y: 8 },
        { scale: 1.08, autoAlpha: 1, y: 0, duration: 0.82, ease: 'back.out(1.45)' }
      )
      .to('.ceremony-stage__title-glow', { autoAlpha: 1, scale: 1.18, duration: 0.78 }, '<0.08')
      .to('.ceremony-stage__title-glow', { autoAlpha: 0.12, scale: 1.34, duration: 0.72 }, '>')
      .to('.ceremony-stage__title-badge', { scale: 1, duration: 0.36 }, '<0.15')
      .call(() => setPhase(2), undefined, '+=0.55')
      .call(revealNumberCharacters, undefined, '+=0.16')
      .to({}, { duration: 1.28 })
      .to('.ceremony-stage__number', { color: '#b58a45', duration: 0.28, yoyo: true, repeat: 1 }, '>-0.1')
      .call(() => setPhase(3), undefined, '+=0.65')
      .to('.ceremony-stage__seal', {
        scale: 1.08,
        autoAlpha: 1,
        rotate: 0,
        y: 0,
        ease: 'back.out(1.15)',
        duration: 0.82,
      })
      .to('.ceremony-stage__seal', { scale: 0.98, duration: 0.16, ease: 'power2.in' })
      .to('.ceremony-stage__seal', { scale: 1.04, duration: 0.28, ease: 'power2.out' })
      .to('.ceremony-stage__seal-ring', { scale: 2.05, autoAlpha: 0, duration: 1.05 }, '<0.02')
      .to(
        '.ceremony-stage__spark',
        {
          autoAlpha: 1,
          y: -34,
          scale: 1.2,
          stagger: 0.055,
          duration: 0.54,
          yoyo: true,
          repeat: 1,
        },
        '<0.12'
      )
      .call(() => setPhase(4), undefined, '+=0.72')
      .to('.ceremony-stage__signature-line', { scaleX: 1, duration: 1.25, ease: 'sine.inOut' })
      .fromTo(
        '.ceremony-stage__signature-name',
        { autoAlpha: 0, y: 14, filter: 'blur(5px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.72 },
        '<0.65'
      )
      .to('.ceremony-stage__signature-line', { filter: 'drop-shadow(0 0 8px rgba(196,138,44,0.5))', duration: 0.45 }, '>-0.12')
      .call(() => setPhase(5), undefined, '+=0.62')
      .to('.ceremony-stage__certificate-light', { scaleY: 1, autoAlpha: 1, duration: 1.22, ease: 'sine.inOut' })
      .to('.ceremony-stage__dossier', { y: -10, scale: 1.018, duration: 0.82 }, '<0.18')
      .to('.ceremony-stage__witness', { y: -14, duration: 1.05, yoyo: true, repeat: 1 }, '<0.1')
      .to('.ceremony-stage__sweep', { xPercent: 260, duration: 1.1, ease: 'sine.inOut' }, '<0.18')

    nextTimeline.timeScale(1.28)
    timeline.value = nextTimeline
  }, rootRef.value)

  timeline.value?.eventCallback('onInterrupt', () => {
    gsapContext.value?.revert()
    gsapContext.value = null
  })
}

watch(
  () => props.ceremonyStatus,
  (status) => {
    if (status === 'running') {
      void playCeremony()
      return
    }

    if (status === 'failed') {
      stopTimeline()
      playCeremonySound('failed')
      return
    }

    if (status === 'idle') {
      stopTimeline()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopTimeline()
})
</script>

<template>
  <section
    ref="rootRef"
    :class="['ceremony-stage', `ceremony-stage--${ceremonyStatus}`]"
    :style="{ '--ceremony-bg': `url(${backgroundSrc})` }"
  >
    <div class="ceremony-stage__ambient" aria-hidden="true" />
    <div class="ceremony-stage__content">
      <div class="ceremony-stage__left">
        <div class="ceremony-stage__dossier">
          <div class="ceremony-stage__dossier-fold" aria-hidden="true" />
          <div class="ceremony-stage__sweep" aria-hidden="true" />
          <div class="ceremony-stage__certificate-light" aria-hidden="true" />
          <div class="ceremony-stage__dossier-header">
            <span>{{ $t('signing.stageDossier') }}</span>
            <v-icon icon="mdi-auto-fix" size="20" />
          </div>
          <div class="ceremony-stage__name">
            <small>{{ $t('registration.stylistName') }}</small>
            <strong>{{ stylistName }}</strong>
          </div>
          <div class="ceremony-stage__title-badge">
            <span class="ceremony-stage__title-glow" aria-hidden="true" />
            <small>{{ $t('registration.titleOption') }}</small>
            <strong>{{ titleName }}</strong>
          </div>
          <div class="ceremony-stage__number" aria-live="polite">
            <small>{{ $t('signing.formalNumber') }}</small>
            <strong>
              <span v-for="(char, index) in certificateNo.split('')" :key="`${char}-${index}`">
                {{ char }}
              </span>
            </strong>
          </div>
          <div class="ceremony-stage__seal" aria-hidden="true">
            <span class="ceremony-stage__seal-ring" />
            <v-icon icon="mdi-seal-variant" size="58" />
          </div>
          <div class="ceremony-stage__signature">
            <span class="ceremony-stage__signature-line" aria-hidden="true" />
            <span
              class="ceremony-stage__signature-name"
              >{{ $t('signing.presidentSignature') }}</span
            >
          </div>
          <span
            v-for="index in 18"
            :key="index"
            class="ceremony-stage__spark"
            :style="{
              '--spark-left': `${18 + index * 4}%`,
              '--spark-top': `${22 + (index % 5) * 13}%`,
            }"
            aria-hidden="true"
          />
        </div>
      </div>

      <div class="ceremony-stage__right" aria-hidden="true">
        <img :src="witnessSrc" alt="" class="ceremony-stage__witness" draggable="false" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.ceremony-stage {
  position: relative;
  overflow: hidden;
  min-height: min(640px, calc(100dvh - 112px));
  border: 1px solid rgba(239, 95, 143, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(105deg, rgba(255, 249, 252, 0.96) 0%, rgba(242, 255, 251, 0.9) 44%, rgba(246, 241, 255, 0.88) 100%),
    var(--ceremony-bg) center / cover;
  box-shadow: 0 22px 60px rgba(122, 78, 98, 0.18);
}

.ceremony-stage__ambient {
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(90deg, rgba(196, 138, 44, 0.08) 0 1px, transparent 1px 44px),
    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0));
  pointer-events: none;
}

.ceremony-stage__content {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: inherit;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  padding: clamp(16px, 3vw, 38px);
}

.ceremony-stage__left {
  position: relative;
  z-index: 2;
  display: grid;
  justify-items: start;
  align-items: center;
  min-width: 0;
}

.ceremony-stage__dossier {
  position: relative;
  width: min(100%, 720px);
  min-height: clamp(430px, 55dvh, 500px);
  padding: clamp(22px, 4vw, 42px);
  overflow: hidden;
  border: 1px solid rgba(196, 138, 44, 0.28);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 248, 238, 0.9)),
    repeating-linear-gradient(0deg, rgba(196, 138, 44, 0.06) 0 1px, transparent 1px 34px);
  box-shadow:
    0 24px 56px rgba(122, 78, 98, 0.18),
    inset 0 0 0 1px rgba(255, 255, 255, 0.7);
}

.ceremony-stage__dossier-fold {
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 0 58%, rgba(255, 231, 170, 0.34) 58% 100%);
  transform-origin: 100% 0;
  pointer-events: none;
}

.ceremony-stage__sweep {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -36%;
  width: 32%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.72), transparent);
  transform: skewX(-14deg);
  pointer-events: none;
}

.ceremony-stage__certificate-light {
  position: absolute;
  inset: auto 14% 0;
  height: 78%;
  border-radius: 8px 8px 0 0;
  background: linear-gradient(180deg, rgba(255, 245, 190, 0.42), rgba(255, 255, 255, 0));
  pointer-events: none;
}

.ceremony-stage__dossier-header,
.ceremony-stage__name,
.ceremony-stage__title-badge,
.ceremony-stage__number,
.ceremony-stage__signature {
  position: relative;
  z-index: 2;
}

.ceremony-stage__dossier-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-gold);
  font-size: 12px;
  font-weight: 840;
}

.ceremony-stage__name,
.ceremony-stage__number {
  display: grid;
  gap: 6px;
  margin-top: 36px;
}

.ceremony-stage__name small,
.ceremony-stage__title-badge small,
.ceremony-stage__number small {
  color: var(--color-muted-dark);
  font-size: 13px;
  font-weight: 740;
}

.ceremony-stage__name strong {
  color: var(--color-certificate-blue);
  font-size: clamp(30px, 5vw, 58px);
  font-weight: 860;
  line-height: 1.1;
}

.ceremony-stage__title-badge {
  display: grid;
  gap: 6px;
  width: min(100%, 500px);
  margin-top: 28px;
  padding: 18px 20px;
  border: 1px solid rgba(196, 138, 44, 0.32);
  border-radius: 8px;
  background: rgba(255, 250, 236, 0.82);
}

.ceremony-stage__title-glow {
  position: absolute;
  inset: -18px;
  border: 1px solid rgba(255, 214, 109, 0.54);
  border-radius: 8px;
  opacity: 0;
  pointer-events: none;
}

.ceremony-stage__title-badge strong {
  color: #7a5135;
  font-size: clamp(18px, 3vw, 30px);
  font-weight: 820;
}

.ceremony-stage__number strong {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1px;
  color: var(--color-foreground);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(22px, 3.4vw, 38px);
  font-variant-numeric: lining-nums tabular-nums;
  font-weight: 780;
  letter-spacing: 0;
  line-height: 1.08;
}

.ceremony-stage__number strong span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1em;
  line-height: 1.08;
  will-change: transform, opacity, filter;
}

.ceremony-stage__seal {
  position: absolute;
  right: clamp(22px, 5vw, 70px);
  bottom: clamp(84px, 12vw, 126px);
  z-index: 3;
  display: grid;
  width: 112px;
  height: 112px;
  place-items: center;
  border: 2px solid rgba(196, 138, 44, 0.74);
  border-radius: 999px;
  color: var(--color-gold);
  background: radial-gradient(circle, rgba(255, 250, 236, 0.95), rgba(255, 231, 170, 0.82));
  box-shadow: 0 16px 34px rgba(122, 78, 98, 0.16);
}

.ceremony-stage__seal-ring {
  position: absolute;
  inset: -8px;
  border: 2px solid rgba(255, 214, 109, 0.62);
  border-radius: inherit;
}

.ceremony-stage__signature {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 54px;
  color: var(--color-gold);
  font-weight: 820;
}

.ceremony-stage__signature-line {
  width: min(220px, 42vw);
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--color-gold), transparent);
}

.ceremony-stage__signature-name {
  color: var(--color-primary-active);
}

.ceremony-stage__spark {
  position: absolute;
  z-index: 4;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #ffd66d;
  box-shadow: 0 0 16px rgba(255, 214, 109, 0.72);
  left: var(--spark-left);
  top: var(--spark-top);
}

.ceremony-stage__right {
  position: absolute;
  right: clamp(-96px, -6vw, -28px);
  bottom: clamp(8px, 3vw, 34px);
  z-index: 1;
  width: clamp(260px, 35vw, 460px);
  min-width: 0;
  pointer-events: none;
}

.ceremony-stage__witness {
  display: block;
  width: 100%;
  max-height: min(650px, calc(100dvh - 130px));
  object-fit: contain;
  opacity: 0.86;
  filter: drop-shadow(0 24px 36px rgba(122, 78, 98, 0.2));
  user-select: none;
  will-change: transform;
}

@media (max-width: 860px) {
  .ceremony-stage {
    min-height: auto;
  }

  .ceremony-stage__content {
    padding: 16px;
  }

  .ceremony-stage__right {
    right: -92px;
    width: clamp(220px, 46vw, 320px);
    opacity: 0.74;
  }

  .ceremony-stage__dossier {
    min-height: 430px;
  }
}

@media (max-width: 560px) {
  .ceremony-stage__right {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ceremony-stage__sweep,
  .ceremony-stage__spark {
    display: none;
  }
}
</style>
