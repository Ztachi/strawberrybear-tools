<script setup lang="ts">
/**
 * @description: HomeCtaButton - 首页主办理按钮
 * @description 同一个按钮实例通过响应式宽度适配桌面和移动端，始终保留在文档流内。
 */

defineProps<{
  label: string
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <div class="w-full min-[901px]:w-[250px]">
    <v-btn
      color="primary"
      variant="flat"
      size="x-large"
      class="home-cta-button min-h-[64px] w-full rounded-full border border-[#ffd782]/90 shadow-[0_18px_36px_rgba(239,95,143,0.30),0_0_0_7px_rgba(255,223,236,0.90)] min-[901px]:min-h-[68px] min-[901px]:min-w-[250px]"
      data-sound="primary"
      @click="emit('click')"
    >
      <span class="relative z-[1] text-[18px] font-[850]">
        {{ label }}
      </span>
      <span class="relative z-[1] ml-2.5 text-[18px] text-[#fff6c9]" aria-hidden="true">✦</span>
    </v-btn>
  </div>
</template>

<style scoped>
.home-cta-button {
  overflow: hidden;
  animation: home-cta-breathe 2.8s ease-in-out infinite;
}

.home-cta-button::before {
  position: absolute;
  top: -40%;
  bottom: -40%;
  left: -45%;
  width: 34%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.72), transparent);
  content: '';
  transform: rotate(18deg);
  animation: home-cta-shine 3.2s ease-in-out infinite;
}

@keyframes home-cta-breathe {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-2px);
  }
}

@keyframes home-cta-shine {
  0%,
  38% {
    left: -45%;
  }

  62%,
  100% {
    left: 118%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-cta-button,
  .home-cta-button::before {
    animation: none;
  }
}
</style>
