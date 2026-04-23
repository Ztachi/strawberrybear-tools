<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:27:52
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 20:44:07
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/views/StartView.vue
 * @Description: StartView — 游戏开始界面
-->
<script setup lang="ts">
/**
 * @description: StartView — 游戏开始界面
 * @description CSS 星空动画背景 + 酷炫标题 + 开始按钮 + 语言切换
 * @description 不包含任何 Babylon.js 代码，点击按钮通过 Pinia Store 触发状态切换
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { i18n, setLocale } from '../i18n'
import type { Locale } from '../i18n'

const LOCALE_LABEL_MAP = {
  'zh-CN': 'EN',
  'en-US': '中文',
} as const

const { t } = useI18n()
const gameStore = useGameStore()

const currentLocale = computed(() => i18n.global.locale.value as Locale)
const mounted = ref(false)

onMounted(() => {
  setTimeout(() => { mounted.value = true }, 100)
})

function toggleLocale(): void {
  setLocale(currentLocale.value === 'zh-CN' ? 'en-US' : 'zh-CN')
}

function goToBase(): void {
  // 与主站路径一致：hash 直接拼接
  // zh-CN: '' → https://ztachi.com/games/universexplorer
  // en-US: '/en' → https://ztachi.com/en/games/universexplorer
  const hash = window.location.hash.replace('#/', '')
  const basePath = hash === 'en' ? '/en' : ''
  window.location.href = `https://ztachi.com${basePath}/games/universexplorer`
}
</script>

<template>
  <div class="start-view">
    <!-- 星空层 -->
    <div class="stars-layer">
      <div class="stars stars-tiny" />
      <div class="stars stars-small" />
      <div class="stars stars-medium" />
      <div class="stars stars-large" />
    </div>

    <!-- 星云层 -->
    <div class="nebula" />

    <!-- 流星层 -->
    <div class="meteor meteor-1" />
    <div class="meteor meteor-2" />
    <div class="meteor meteor-3" />

    <!-- 浮动粒子 -->
    <div class="particle particle-1" />
    <div class="particle particle-2" />
    <div class="particle particle-3" />
    <div class="particle particle-4" />
    <div class="particle particle-5" />

    <!-- 边框光效 -->
    <div class="border-glow border-glow-top" />
    <div class="border-glow border-glow-bottom" />

    <!-- 语言切换 -->
    <button class="lang-toggle" :class="{ mounted }" @click="toggleLocale">
      {{ LOCALE_LABEL_MAP[currentLocale] }}
    </button>

    <!-- 主内容 -->
    <div class="content" :class="{ mounted }">
      <!-- 标题容器 -->
      <div class="title-wrapper">
        <!-- 外层光环 -->
        <div class="title-aura" />
        <!-- 内层光环 -->
        <div class="title-aura-inner" />
        <!-- 主标题 -->
        <h1 class="title">
          <span class="title-main">{{ t('game.title') }}</span>
          <!-- 光晕文字 -->
          <span class="title-glow title-glow-1" aria-hidden="true">{{ t('game.title') }}</span>
          <span class="title-glow title-glow-2" aria-hidden="true">{{ t('game.title') }}</span>
          <span class="title-glow title-glow-3" aria-hidden="true">{{ t('game.title') }}</span>
        </h1>
      </div>

      <!-- 副标题 -->
      <p class="subtitle">
        {{ t('game.subtitle') }}
      </p>

      <!-- 装饰线 -->
      <div class="divider">
        <span class="divider-line" />
        <span class="divider-star">✦</span>
        <span class="divider-line" />
      </div>

      <!-- 开始按钮 -->
      <button class="start-btn" @click="gameStore.startGame()">
        <span class="start-btn-text">{{ t('game.startButton') }}</span>
        <span class="start-btn-glow" />
      </button>

      <!-- 返回基地 -->
      <a class="home-btn" :class="{ mounted }" @click.prevent="goToBase">
        {{ t('game.homeButton') }}
      </a>
    </div>
  </div>
</template>

<style scoped>
/* 基础布局 */
.start-view {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at 50% 50%, #0a0e2a 0%, #050510 50%, #000005 100%);
}

/* ==================== 星空层 ==================== */
.stars-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.stars {
  position: absolute;
  inset: -50%;
  background-repeat: repeat;
}

.stars-tiny {
  width: 200%;
  height: 200%;
  background-image:
    radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.9) 0%, transparent 100%),
    radial-gradient(1px 1px at 30% 50%, rgba(200,220,255,0.8) 0%, transparent 100%),
    radial-gradient(1px 1px at 50% 10%, rgba(255,255,255,0.7) 0%, transparent 100%),
    radial-gradient(1px 1px at 70% 60%, rgba(180,210,255,0.9) 0%, transparent 100%),
    radial-gradient(1px 1px at 90% 30%, rgba(255,255,255,0.8) 0%, transparent 100%),
    radial-gradient(1px 1px at 15% 80%, rgba(200,230,255,0.7) 0%, transparent 100%),
    radial-gradient(1px 1px at 45% 70%, rgba(255,255,255,0.6) 0%, transparent 100%),
    radial-gradient(1px 1px at 75% 90%, rgba(180,220,255,0.8) 0%, transparent 100%);
  background-size: 250px 250px;
  animation: starFloat 120s linear infinite, starTwinkle 4s ease-in-out infinite alternate;
}

.stars-small {
  width: 200%;
  height: 200%;
  background-image:
    radial-gradient(1.5px 1.5px at 20% 30%, #fff 0%, transparent 100%),
    radial-gradient(1.5px 1.5px at 40% 70%, rgba(200,220,255,1) 0%, transparent 100%),
    radial-gradient(1.5px 1.5px at 60% 20%, #fff 0%, transparent 100%),
    radial-gradient(1.5px 1.5px at 80% 50%, rgba(180,210,255,1) 0%, transparent 100%),
    radial-gradient(2px 2px at 25% 85%, rgba(255,255,255,0.9) 0%, transparent 100%),
    radial-gradient(1.5px 1.5px at 55% 45%, #fff 0%, transparent 100%),
    radial-gradient(2px 2px at 85% 75%, rgba(200,230,255,0.8) 0%, transparent 100%);
  background-size: 400px 400px;
  animation: starFloat 180s linear infinite reverse, starTwinkle2 6s ease-in-out infinite alternate;
  opacity: 0.85;
}

.stars-medium {
  width: 200%;
  height: 200%;
  background-image:
    radial-gradient(2px 2px at 12% 42%, rgba(100,180,255,1) 0%, transparent 100%),
    radial-gradient(2.5px 2.5px at 38% 18%, #fff 0%, transparent 100%),
    radial-gradient(2px 2px at 62% 78%, rgba(150,200,255,1) 0%, transparent 100%),
    radial-gradient(3px 3px at 88% 32%, rgba(200,220,255,0.9) 0%, transparent 100%),
    radial-gradient(2px 2px at 5% 95%, #fff 0%, transparent 100%),
    radial-gradient(2.5px 2.5px at 48% 58%, rgba(100,180,255,0.8) 0%, transparent 100%);
  background-size: 600px 600px;
  animation: starFloat 240s linear infinite, starTwinkle 8s ease-in-out infinite alternate-reverse;
  opacity: 0.6;
}

.stars-large {
  width: 200%;
  height: 200%;
  background-image:
    radial-gradient(3px 3px at 18% 28%, rgba(80,160,255,1) 0%, transparent 100%),
    radial-gradient(4px 4px at 52% 68%, rgba(200,220,255,1) 0%, transparent 100%),
    radial-gradient(3px 3px at 78% 12%, rgba(100,180,255,1) 0%, transparent 100%),
    radial-gradient(4px 4px at 32% 88%, rgba(150,200,255,0.9) 0%, transparent 100%),
    radial-gradient(5px 5px at 92% 52%, #fff 0%, transparent 100%);
  background-size: 800px 800px;
  animation: starFloat 300s linear infinite reverse, starTwinkle2 10s ease-in-out infinite alternate;
  opacity: 0.4;
}

@keyframes starFloat {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes starTwinkle {
  0% { opacity: 0.3; filter: brightness(0.8); }
  100% { opacity: 0.8; filter: brightness(1.2); }
}

@keyframes starTwinkle2 {
  0% { opacity: 0.2; }
  100% { opacity: 0.7; }
}

/* ==================== 星云层 ==================== */
.nebula {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 20% 30%, rgba(100,60,180,0.15) 0%, transparent 70%),
    radial-gradient(ellipse 60% 40% at 80% 70%, rgba(60,100,200,0.12) 0%, transparent 70%),
    radial-gradient(ellipse 50% 60% at 50% 80%, rgba(80,40,160,0.1) 0%, transparent 70%),
    radial-gradient(ellipse 70% 40% at 70% 20%, rgba(40,120,200,0.08) 0%, transparent 70%);
  animation: nebulaBreath 15s ease-in-out infinite;
  pointer-events: none;
}

@keyframes nebulaBreath {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

/* ==================== 流星 ==================== */
.meteor {
  position: absolute;
  width: 2px;
  height: 2px;
  background: linear-gradient(45deg, #fff 0%, rgba(100,180,255,0) 100%);
  border-radius: 50%;
  animation: meteorFly 3s linear infinite;
  opacity: 0;
}

.meteor::before {
  content: '';
  position: absolute;
  width: 100px;
  height: 1px;
  background: linear-gradient(90deg, rgba(100,180,255,0.8) 0%, transparent 100%);
  transform: rotate(-45deg);
  transform-origin: left center;
}

.meteor-1 {
  top: 10%;
  left: 90%;
  animation-delay: 0s;
}

.meteor-2 {
  top: 30%;
  left: 95%;
  animation-delay: 1.2s;
}

.meteor-3 {
  top: 60%;
  left: 85%;
  animation-delay: 2.4s;
}

@keyframes meteorFly {
  0% {
    opacity: 0;
    transform: translate(0, 0);
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-300px, 300px);
  }
}

/* ==================== 浮动粒子 ==================== */
.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: radial-gradient(circle, rgba(100,180,255,0.8) 0%, transparent 70%);
  border-radius: 50%;
  animation: particleFloat 20s ease-in-out infinite;
}

.particle-1 {
  top: 20%;
  left: 10%;
  animation-delay: 0s;
  animation-duration: 18s;
}

.particle-2 {
  top: 70%;
  left: 85%;
  animation-delay: 3s;
  animation-duration: 22s;
}

.particle-3 {
  top: 40%;
  left: 90%;
  animation-delay: 6s;
  animation-duration: 20s;
}

.particle-4 {
  top: 80%;
  left: 15%;
  animation-delay: 9s;
  animation-duration: 24s;
}

.particle-5 {
  top: 50%;
  left: 5%;
  animation-delay: 12s;
  animation-duration: 19s;
}

@keyframes particleFloat {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    opacity: 0.3;
  }
  25% {
    transform: translate(30px, -50px) scale(1.2);
    opacity: 0.8;
  }
  50% {
    transform: translate(-20px, -100px) scale(0.8);
    opacity: 0.5;
  }
  75% {
    transform: translate(40px, -60px) scale(1.1);
    opacity: 0.7;
  }
}

/* ==================== 边框光效 ==================== */
.border-glow {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(100,180,255,0.3) 20%,
    rgba(100,180,255,0.8) 50%,
    rgba(100,180,255,0.3) 80%,
    transparent 100%);
  animation: borderGlow 8s ease-in-out infinite;
  pointer-events: none;
}

.border-glow-top {
  top: 0;
  animation-delay: 0s;
}

.border-glow-bottom {
  bottom: 0;
  animation-delay: 4s;
}

@keyframes borderGlow {
  0%, 100% {
    opacity: 0.2;
    transform: scaleX(0.8);
  }
  50% {
    opacity: 0.6;
    transform: scaleX(1);
  }
}

/* ==================== 语言切换按钮 ==================== */
.lang-toggle {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  padding: 0.5rem 1rem;
  border-radius: 2rem;
  background: rgba(255,255,255,0.05);
  backdrop-filter: blur(10px);
  color: rgba(255,255,255,0.7);
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  border: 1px solid rgba(100,180,255,0.3);
  cursor: pointer;
  transition: all 0.4s ease;
  opacity: 0;
  transform: translateY(-20px);
}

.lang-toggle.mounted {
  opacity: 1;
  transform: translateY(0);
}

.lang-toggle:hover {
  background: rgba(100,180,255,0.15);
  color: #fff;
  border-color: rgba(100,180,255,0.6);
  box-shadow: 0 0 20px rgba(100,180,255,0.3);
}

/* ==================== 返回基地按钮 ==================== */
.home-btn {
  display: block;
  width: fit-content;
  padding: 0.5rem 1.2rem;
  border-radius: 2rem;
  background: rgba(255,255,255,0.05);
  backdrop-filter: blur(10px);
  color: rgba(255,255,255,0.7);
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  border: 1px solid rgba(100,180,255,0.3);
  cursor: pointer;
  transition: all 0.4s ease;
  opacity: 0;
  transform: translateY(20px);
  text-decoration: none;
}

.home-btn.mounted {
  opacity: 1;
  transform: translateY(0);
}

.home-btn:hover {
  background: rgba(100,180,255,0.15);
  color: #fff;
  border-color: rgba(100,180,255,0.6);
  box-shadow: 0 0 20px rgba(100,180,255,0.3);
}

/* ==================== 主内容 ==================== */
.content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  text-align: center;
  opacity: 0;
  transform: translateY(30px);
  transition: all 1s cubic-bezier(0.16, 1, 0.3, 1);
}

.content.mounted {
  opacity: 1;
  transform: translateY(0);
}

/* ==================== 标题特效 ==================== */
.title-wrapper {
  position: relative;
  padding: 2rem 4rem;
}

.title-aura {
  position: absolute;
  inset: -30%;
  background: radial-gradient(ellipse at center,
    rgba(100,180,255,0.2) 0%,
    rgba(80,140,255,0.1) 40%,
    transparent 70%);
  filter: blur(30px);
  animation: auraPulse 4s ease-in-out infinite;
  pointer-events: none;
}

.title-aura-inner {
  position: absolute;
  inset: -15%;
  background: radial-gradient(ellipse at center,
    rgba(60,120,255,0.15) 0%,
    transparent 60%);
  animation: auraPulse 4s ease-in-out infinite reverse;
  pointer-events: none;
}

@keyframes auraPulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

.title {
  position: relative;
  font-size: clamp(3rem, 10vw, 6rem);
  font-weight: 900;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.title-main {
  position: relative;
  background: linear-gradient(135deg,
    #ffffff 0%,
    #e0f0ff 20%,
    #80c0ff 40%,
    #4080ff 60%,
    #80c0ff 80%,
    #ffffff 100%);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: titleShine 4s ease-in-out infinite, titleFloat 6s ease-in-out infinite;
  filter: drop-shadow(0 0 30px rgba(100,180,255,0.5));
}

.title-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(135deg,
    #ffffff 0%,
    #80c0ff 50%,
    #ffffff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  pointer-events: none;
}

.title-glow-1 {
  font-size: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  filter: blur(8px);
  opacity: 0.6;
  animation: titleGlow1 3s ease-in-out infinite;
}

.title-glow-2 {
  font-size: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  filter: blur(20px);
  opacity: 0.4;
  animation: titleGlow2 4s ease-in-out infinite;
}

.title-glow-3 {
  font-size: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  filter: blur(40px);
  opacity: 0.3;
  animation: titleGlow3 5s ease-in-out infinite;
}

@keyframes titleShine {
  0%, 100% {
    background-position: 0% 50%;
    filter: drop-shadow(0 0 30px rgba(100,180,255,0.5));
  }
  50% {
    background-position: 100% 50%;
    filter: drop-shadow(0 0 50px rgba(100,180,255,0.8));
  }
}

@keyframes titleFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes titleGlow1 {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.02); }
}

@keyframes titleGlow2 {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.05); }
}

@keyframes titleGlow3 {
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.08); }
}

/* ==================== 副标题 ==================== */
.subtitle {
  font-size: clamp(1rem, 3vw, 1.5rem);
  color: rgba(180, 210, 255, 0.8);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  animation: subtitleFade 2s ease-out 0.5s both;
}

@keyframes subtitleFade {
  from { opacity: 0; letter-spacing: 0.5em; }
  to { opacity: 1; letter-spacing: 0.3em; }
}

/* ==================== 装饰线 ==================== */
.divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  animation: dividerFade 2s ease-out 0.8s both;
}

.divider-line {
  width: 60px;
  height: 1px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(100,180,255,0.6) 50%,
    transparent 100%);
}

.divider-star {
  color: rgba(100,180,255,0.8);
  font-size: 0.8rem;
  animation: starRotate 4s linear infinite;
}

@keyframes dividerFade {
  from { opacity: 0; transform: scaleX(0); }
  to { opacity: 1; transform: scaleX(1); }
}

@keyframes starRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ==================== 开始按钮 ==================== */
.start-btn {
  position: relative;
  margin-top: 1rem;
  padding: 1.2rem 4rem;
  border-radius: 3rem;
  background: linear-gradient(135deg,
    rgba(60,120,220,0.8) 0%,
    rgba(30,80,180,0.9) 100%);
  border: 1px solid rgba(100,180,255,0.5);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.4s ease;
  animation: btnFade 2s ease-out 1s both;
}

.start-btn::before {
  content: '';
  position: absolute;
  inset: -2px;
  background: linear-gradient(135deg,
    rgba(100,180,255,0.3) 0%,
    rgba(60,140,255,0.1) 50%,
    rgba(100,180,255,0.3) 100%);
  filter: blur(15px);
  opacity: 0;
  transition: opacity 0.4s ease;
  z-index: -1;
}

.start-btn:hover::before {
  opacity: 1;
}

.start-btn:hover {
  transform: scale(1.05);
  border-color: rgba(100,180,255,0.8);
  box-shadow:
    0 0 30px rgba(60,120,220,0.5),
    0 0 60px rgba(60,120,220,0.3),
    inset 0 0 30px rgba(100,180,255,0.1);
}

.start-btn:active {
  transform: scale(0.98);
}

.start-btn-text {
  position: relative;
  z-index: 1;
  color: #fff;
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  text-shadow: 0 0 20px rgba(100,180,255,0.8);
}

.start-btn-glow {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255,255,255,0.2) 50%,
    transparent 100%);
  animation: btnGlowSweep 3s ease-in-out infinite;
}

@keyframes btnFade {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes btnGlowSweep {
  0% { left: -100%; }
  50%, 100% { left: 100%; }
}
</style>
