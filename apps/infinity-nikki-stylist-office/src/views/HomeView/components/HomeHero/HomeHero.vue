<script setup lang="ts">
/**
 * @description: HomeHero - 首页签发处主视觉
 * @description 组合机构介绍、流程提示、主按钮和证书样例。
 */
import HomeCertificateShowcase from './components/HomeCertificateShowcase/HomeCertificateShowcase.vue'
import HomeCtaButton from './components/HomeCtaButton/HomeCtaButton.vue'

defineProps<{
  assurance: string
  ctaLabel: string
  demoAlt: string
  demoCaption: string
  demoSrc: string
  flowLabel: string
  intro: string
  kicker: string
  office: string
  steps: string[]
}>()

const emit = defineEmits<{
  start: []
}>()
</script>

<template>
  <section
    class="home-hero relative isolate overflow-hidden rounded-[28px] border border-[#c48a2c]/35 px-[clamp(22px,5vw,70px)] py-[clamp(26px,5vw,70px)] shadow-[0_26px_70px_rgba(201,85,126,0.18),inset_0_1px_0_rgba(255,255,255,0.86)] max-[760px]:rounded-[22px] max-[760px]:px-[18px] max-[760px]:pt-6 max-[760px]:pb-7"
    aria-labelledby="home-office-title"
  >
    <div class="home-hero__ornament home-hero__ornament--left" />
    <div class="home-hero__ornament home-hero__ornament--right" />

    <div
      class="relative z-[2] grid gap-8 min-[1120px]:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.88fr)] min-[1120px]:items-center"
    >
      <div class="home-hero__content min-w-0 max-w-[620px]">
        <p
          class="mb-[18px] inline-flex min-h-9 max-w-full items-center rounded-full border border-[#c48a2c]/30 bg-white/70 px-[18px] text-[13px] font-[750] text-[#c48a2c] shadow-[0_10px_24px_rgba(196,138,44,0.12)] max-[760px]:min-h-8 max-[760px]:px-[13px] max-[760px]:text-[12px]"
        >
          <span class="truncate">{{ kicker }}</span>
        </p>
        <h2
          id="home-office-title"
          class="m-0 text-[clamp(40px,7vw,86px)] font-black leading-[1.04] text-[#3d527e] [text-shadow:0_2px_0_rgba(255,255,255,0.92),0_18px_36px_rgba(85,135,232,0.16)] max-[760px]:text-[clamp(38px,11vw,54px)]"
        >
          {{ office }}
        </h2>
        <p
          class="mt-[22px] max-w-[560px] text-[clamp(16px,2vw,20px)] font-medium leading-[1.85] text-[var(--color-muted-dark)] max-[760px]:text-[15px]"
        >
          {{ intro }}
        </p>

        <div class="mt-7 flex flex-wrap gap-2.5 max-[760px]:gap-2" :aria-label="flowLabel">
          <span
            v-for="step in steps"
            :key="step"
            class="inline-flex min-h-[34px] items-center rounded-full border border-[#5587e8]/20 bg-white/60 px-3.5 text-[13px] font-bold text-[#4b6597] shadow-[0_8px_22px_rgba(85,135,232,0.10)] max-[760px]:min-h-[31px] max-[760px]:px-2.5 max-[760px]:text-[12px]"
          >
            {{ step }}
          </span>
        </div>

        <div class="mt-[34px] flex flex-wrap items-center gap-4">
          <HomeCtaButton :label="ctaLabel" @click="emit('start')" />
          <p
            class="m-0 max-w-[250px] text-[13px] leading-[1.7] text-[var(--color-muted-dark)] max-[900px]:hidden"
          >
            {{ assurance }}
          </p>
        </div>
      </div>

      <HomeCertificateShowcase :image-src="demoSrc" :alt="demoAlt" :caption="demoCaption" />
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  background:
    radial-gradient(circle at 83% 18%, rgba(155, 123, 255, 0.24), transparent 28%),
    radial-gradient(circle at 82% 76%, rgba(85, 188, 169, 0.18), transparent 26%),
    linear-gradient(
      118deg,
      rgba(255, 255, 255, 0.96) 0%,
      rgba(255, 238, 246, 0.92) 48%,
      rgba(248, 252, 255, 0.88) 100%
    ),
    repeating-linear-gradient(
      135deg,
      rgba(239, 95, 143, 0.06) 0,
      rgba(239, 95, 143, 0.06) 1px,
      transparent 2px,
      transparent 20px
    );
}

.home-hero::before {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 10px;
  background: linear-gradient(
    90deg,
    var(--color-primary),
    var(--color-lemon),
    var(--color-mint),
    var(--color-lavender)
  );
  content: '';
}

.home-hero::after {
  position: absolute;
  inset: 16px;
  z-index: -1;
  border: 1px solid rgba(196, 138, 44, 0.2);
  border-radius: 22px;
  content: '';
}

.home-hero__content {
  animation: home-fade-up 680ms ease-out both;
}

.home-hero__ornament {
  position: absolute;
  width: 170px;
  height: 170px;
  border: 1px solid rgba(196, 138, 44, 0.24);
  border-radius: 50%;
  opacity: 0.68;
}

.home-hero__ornament::before,
.home-hero__ornament::after {
  position: absolute;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: rgba(239, 95, 143, 0.2);
  box-shadow: 0 0 18px rgba(239, 95, 143, 0.28);
  content: '';
}

.home-hero__ornament::before {
  top: 28px;
  left: 28px;
}

.home-hero__ornament::after {
  right: 32px;
  bottom: 24px;
}

.home-hero__ornament--left {
  top: -78px;
  left: -76px;
}

.home-hero__ornament--right {
  right: -70px;
  bottom: 82px;
}

@keyframes home-fade-up {
  from {
    opacity: 0;
    transform: translateY(18px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 760px) {
  .home-hero::after {
    inset: 10px;
    border-radius: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-hero__content {
    animation: none;
  }
}
</style>
