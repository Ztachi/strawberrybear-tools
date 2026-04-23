<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-23 17:27:52
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-23 17:27:53
 * @FilePath: /strawberrybear-tools/apps/universe-explorer/src/views/StartView.vue
 * @Description: 
-->
<script setup lang="ts">
/**
 * @description: StartView — 游戏开始界面
 * @description CSS 星空动画背景 + 标题 + 开始按钮 + 语言切换
 * @description 不包含任何 Babylon.js 代码，点击按钮通过 Pinia Store 触发状态切换
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { i18n, setLocale } from '../i18n'
import type { Locale } from '../i18n'

const { t } = useI18n()
const gameStore = useGameStore()

const currentLocale = computed(() => i18n.global.locale.value as Locale)

function toggleLocale(): void {
  setLocale(currentLocale.value === 'zh-CN' ? 'en-US' : 'zh-CN')
}
</script>

<template>
  <div class="start-view">
    <!-- 纯 CSS 星空背景粒子 -->
    <div class="stars stars-1" />
    <div class="stars stars-2" />
    <div class="stars stars-3" />

    <!-- 语言切换 -->
    <button class="lang-toggle" @click="toggleLocale">
      {{ currentLocale === 'zh-CN' ? 'EN' : '中文' }}
    </button>

    <!-- 主内容 -->
    <div class="content">
      <h1 class="title">
        <span class="title-text">{{ t('game.title') }}</span>
        <span class="title-glow" aria-hidden="true">{{ t('game.title') }}</span>
      </h1>
      <p class="subtitle">
        {{ t('game.subtitle') }}
      </p>
      <button class="start-btn" @click="gameStore.startGame()">
        {{ t('game.startButton') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.start-view {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, #0a0e2a 0%, #000008 100%);
}

/* CSS 星空粒子（三层不同速度/尺寸） */
.stars {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(1px 1px at var(--x1, 10%) var(--y1, 20%), #fff 0, transparent 0),
    radial-gradient(1px 1px at var(--x2, 30%) var(--y2, 50%), rgba(255,255,255,0.7) 0, transparent 0),
    radial-gradient(1.5px 1.5px at var(--x3, 55%) var(--y3, 15%), #fff 0, transparent 0),
    radial-gradient(1px 1px at var(--x4, 75%) var(--y4, 65%), rgba(200,220,255,0.8) 0, transparent 0),
    radial-gradient(1px 1px at var(--x5, 90%) var(--y5, 35%), #fff 0, transparent 0);
}
.stars-1 {
  background-size: 300px 300px;
  animation: twinkle1 4s ease-in-out infinite alternate;
  opacity: 0.8;
}
.stars-2 {
  background-size: 500px 500px;
  animation: twinkle2 6s ease-in-out infinite alternate;
  opacity: 0.5;
  background-image:
    radial-gradient(1px 1px at 15% 25%, #fff 0, transparent 0),
    radial-gradient(1.5px 1.5px at 42% 68%, rgba(200,220,255,0.9) 0, transparent 0),
    radial-gradient(1px 1px at 63% 10%, #fff 0, transparent 0),
    radial-gradient(2px 2px at 80% 80%, rgba(255,255,255,0.6) 0, transparent 0),
    radial-gradient(1px 1px at 95% 45%, #fff 0, transparent 0);
}
.stars-3 {
  background-size: 800px 800px;
  animation: twinkle1 8s ease-in-out infinite alternate-reverse;
  opacity: 0.4;
  background-image:
    radial-gradient(2px 2px at 5% 5%, rgba(255,255,255,0.7) 0, transparent 0),
    radial-gradient(1px 1px at 22% 90%, #fff 0, transparent 0),
    radial-gradient(1.5px 1.5px at 48% 48%, rgba(180,210,255,0.8) 0, transparent 0),
    radial-gradient(1px 1px at 70% 15%, #fff 0, transparent 0),
    radial-gradient(2px 2px at 88% 60%, rgba(255,255,255,0.5) 0, transparent 0);
}

@keyframes twinkle1 {
  from { opacity: 0.4; }
  to   { opacity: 1; }
}
@keyframes twinkle2 {
  from { opacity: 0.2; }
  to   { opacity: 0.8; }
}

/* 语言切换按钮 */
.lang-toggle {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  padding: 0.375rem 0.875rem;
  border-radius: 0.375rem;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.65);
  font-size: 0.75rem;
  border: 1px solid rgba(255,255,255,0.15);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.lang-toggle:hover {
  background: rgba(255,255,255,0.15);
  color: #fff;
}

/* 主内容 */
.content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  text-align: center;
}

.title {
  position: relative;
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.title-text {
  position: relative;
  color: #fff;
  background: linear-gradient(135deg, #e0f0ff 0%, #80c0ff 40%, #4080ff 70%, #80c0ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: titleShine 3s ease-in-out infinite;
}

.title-glow {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  color: #60a0ff;
  background: linear-gradient(135deg, #e0f0ff 0%, #80c0ff 40%, #4080ff 70%, #80c0ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: blur(20px);
  opacity: 0.6;
  animation: titlePulse 3s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}

@keyframes titleShine {
  0%, 100% {
    background-position: 0% 50%;
    filter: brightness(1);
  }
  50% {
    background-position: 100% 50%;
    filter: brightness(1.2);
  }
}

@keyframes titlePulse {
  0%, 100% {
    opacity: 0.4;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.02);
  }
}

.title:hover .title-text {
  animation: titleShine 1.5s ease-in-out infinite;
}

.title:hover .title-glow {
  animation: titlePulse 1.5s ease-in-out infinite;
  opacity: 0.9;
}

.subtitle {
  font-size: clamp(0.9rem, 2vw, 1.25rem);
  color: rgba(180, 210, 255, 0.75);
  letter-spacing: 0.15em;
}

.start-btn {
  margin-top: 0.5rem;
  padding: 0.875rem 3rem;
  border-radius: 2rem;
  background: linear-gradient(135deg, rgba(60, 120, 220, 0.7), rgba(30, 70, 160, 0.7));
  color: #fff;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  border: 1px solid rgba(120, 180, 255, 0.4);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 0 20px rgba(80, 140, 255, 0.25);
}
.start-btn:hover {
  transform: scale(1.04);
  box-shadow: 0 0 36px rgba(80, 160, 255, 0.5);
}
.start-btn:active {
  transform: scale(0.98);
}
</style>
