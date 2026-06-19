<script setup lang="ts">
/**
 * @description: HomeCertificateShowcase - 首页成品证书展示
 * @description 展示正式证书样例，移动端保持居中和完整可见。
 */

defineProps<{
  alt: string
  caption: string
  imageSrc: string
}>()
</script>

<template>
  <figure
    class="home-certificate relative z-[1] mx-auto m-0 w-[min(88vw,640px)] max-w-full min-[1120px]:w-full"
  >
    <div
      class="absolute inset-[12%_6%_0] translate-y-5 rounded-[34px] bg-[radial-gradient(circle_at_70%_30%,rgba(155,123,255,0.34),transparent_42%),radial-gradient(circle_at_34%_76%,rgba(255,214,109,0.22),transparent_36%)] blur-2xl"
    />
    <img
      :src="imageSrc"
      :alt="alt"
      class="home-certificate__preview relative block w-full rounded-[18px] border border-[#c48a2c]/35 shadow-[0_22px_58px_rgba(61,82,126,0.22),0_7px_20px_rgba(201,85,126,0.18)] max-[760px]:rounded-[14px]"
    />
    <figcaption
      class="relative mx-auto -mt-2 w-fit max-w-[82%] rounded-full border border-[#c48a2c]/25 bg-white/80 px-3.5 py-2 text-center text-[12px] font-bold text-[#5e6691] shadow-[0_10px_24px_rgba(61,82,126,0.12)] max-[760px]:max-w-[92%] max-[760px]:text-[11px]"
    >
      {{ caption }}
    </figcaption>
  </figure>
</template>

<style scoped>
.home-certificate {
  animation: home-certificate-enter 820ms 120ms ease-out both;
}

.home-certificate__preview {
  transform: rotate(-4deg);
  transform-origin: 55% 70%;
  animation: home-certificate-float 5.6s ease-in-out infinite;
}

@media (max-width: 760px) {
  .home-certificate__preview {
    transform: rotate(-2deg);
  }
}

@keyframes home-certificate-enter {
  from {
    opacity: 0;
    scale: 0.96;
  }

  to {
    opacity: 1;
    scale: 1;
  }
}

@keyframes home-certificate-float {
  0%,
  100% {
    transform: rotate(-4deg) translateY(0);
  }

  50% {
    transform: rotate(-3deg) translateY(-10px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-certificate,
  .home-certificate__preview {
    animation: none;
  }
}
</style>
