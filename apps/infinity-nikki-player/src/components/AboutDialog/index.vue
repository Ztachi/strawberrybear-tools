<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-17 10:55:52
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-04-17 10:55:59
 * @FilePath: \strawberrybear-tools\apps\infinity-nikki-player\src\components\AboutDialog\index.vue
 * @Description: 关于对话框组件
-->
<script setup lang="ts">
/**
 * @description: 关于对话框组件
 * @description 监听 Tauri 菜单的 show_about 事件显示，包含应用图标、版本号和描述信息
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ExternalLink } from 'lucide-vue-next'
import appLogo from '@/assets/images/logo.png'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const { t } = useI18n()

/** 对话框打开状态 @return {boolean} */
const isOpen = ref(false)

/** 应用版本号 @return {string} */
const version = ref('')

/** 事件监听取消函数 */
let unlisten: (() => void) | undefined

/**
 * @description: 显示关于对话框
 * 首次打开时获取应用版本号
 */
async function show() {
  if (!version.value) {
    version.value = await invoke<string>('get_app_version')
  }
  isOpen.value = true
}

/**
 * @description: 打开外部链接
 * 跳转到应用官网
 */
async function openLink() {
  await invoke('open_url', { url: 'https://ztachi.com/tools/infinity-nikki-player' })
}

/** 组件挂载时监听 show_about 事件 */
onMounted(async () => {
  unlisten = await listen('show_about', () => show())
})

/** 组件卸载时取消事件监听 */
onUnmounted(() => {
  unlisten?.()
})
</script>

<template>
  <Dialog v-model:open="isOpen">
    <!-- 自定义样式对话框内容 -->
    <DialogContent class="!w-auto !max-w-none !bg-transparent !border-none !shadow-none !p-0">
      <div class="about-card">
        <!-- 头部区域：图标、名称、版本 -->
        <div class="about-header">
          <div class="about-icon">
            <img :src="appLogo" class="about-icon-img" alt="app icon" />
          </div>
          <DialogTitle class="about-app-name">
            {{ t('app.title') }}
          </DialogTitle>
          <span class="about-version-badge">v{{ version }}</span>
        </div>

        <!-- 分隔线 -->
        <div class="about-divider" />

        <!-- 描述文本 -->
        <DialogDescription class="about-description">
          {{ t('about.description') }}
        </DialogDescription>

        <!-- 外部链接按钮 -->
        <button class="about-link-btn" @click="openLink">
          <ExternalLink :size="14" />
          {{ t('about.learnMore') }}
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.about-card {
  width: 340px !important;
  max-width: 340px !important;
  background: var(--bg-white-95);
  border: 1.5px solid var(--border-primary-30);
  border-radius: 20px;
  box-shadow: var(--shadow-pink), 0 2px 24px rgba(247, 192, 193, 0.18);
  padding: 32px 28px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.about-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  width: 100%;
}

.about-icon {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(247, 192, 193, 0.35);
}

.about-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.about-app-name {
  font-size: 18px !important;
  font-weight: 700 !important;
  color: var(--color-foreground) !important;
  margin: 0;
  letter-spacing: 0.01em;
  text-align: center;
}

.about-version-badge {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-muted-dark);
  background: var(--bg-primary-10);
  border: 1px solid var(--border-primary-20);
  border-radius: 999px;
  padding: 2px 10px;
}

.about-divider {
  width: 100%;
  height: 1px;
  background: var(--border-primary-15);
  margin-bottom: 18px;
}

.about-description {
  font-size: 13.5px !important;
  color: var(--color-muted-dark) !important;
  line-height: 1.65;
  text-align: center;
  margin: 0 0 20px;
  width: 100%;
}

.about-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-primary) 100%);
  color: var(--color-foreground);
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(247, 192, 193, 0.35);
  transition: opacity 0.15s, box-shadow 0.15s;
}

.about-link-btn:hover {
  opacity: 0.88;
  box-shadow: 0 4px 16px rgba(247, 192, 193, 0.45);
}
</style>
