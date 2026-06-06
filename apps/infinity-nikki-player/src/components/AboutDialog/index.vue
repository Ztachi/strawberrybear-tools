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
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { DiscordFilled, QqOutlined } from '@antdv-next/icons'
import { Download, ExternalLink, Loader2, RefreshCw } from 'lucide-vue-next'
import { useAppUpdater } from '@/composables/useAppUpdater'
import appLogo from '@/assets/images/logo.png'
import { Modal, TypographyParagraph } from 'antdv-next'

const { t } = useI18n()
const updater = useAppUpdater()

/** 对话框打开状态 @return {boolean} */
const isOpen = ref(false)

/** 应用版本号 @return {string} */
const version = ref('')

/** 事件监听取消函数 */
let unlisten: (() => void) | undefined

const updaterButtonText = computed(() => {
  if (updater.isChecking.value) return t('updater.checking')
  if (updater.isInstalling.value) return t('updater.installing')
  if (updater.isDownloading.value) {
    return updater.progress.value === null
      ? t('updater.downloading')
      : t('updater.downloadingProgress', { progress: updater.progress.value })
  }
  if (updater.hasUpdate.value) return t('updater.updateNow')
  return t('updater.checkNow')
})

const updaterButtonIcon = computed(() => {
  if (updater.isChecking.value || updater.isDownloading.value || updater.isInstalling.value) {
    return Loader2
  }
  if (updater.hasUpdate.value) return Download
  return RefreshCw
})

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

async function handleUpdaterClick() {
  if (updater.hasUpdate.value) {
    await updater.downloadAndInstallUpdate()
    return
  }

  await updater.checkUpdate({ notifyNoUpdate: true, silent: false })
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
  <Modal v-model:open="isOpen" :footer="null" width="auto" centered root-class="about-modal-root">
    <!-- 自定义样式对话框内容 -->
    <div class="about-card">
      <!-- 头部区域：图标、名称、版本 -->
      <div class="about-header">
        <div class="about-icon">
          <img :src="appLogo" class="about-icon-img" alt="app icon" />
        </div>
        <h2 class="about-app-name">
          {{ t('app.title') }}
        </h2>
        <div class="about-version-row">
          <span class="about-version-badge">v{{ version }}</span>
          <button
            class="about-update-btn"
            :disabled="updater.isBusy.value"
            @click="handleUpdaterClick"
          >
            <component
              :is="updaterButtonIcon"
              :size="12"
              :class="{ spinning: updater.isBusy.value }"
            />
            {{ updaterButtonText }}
          </button>
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="about-divider" />

      <!-- 描述文本 -->
      <p class="about-description">
        {{ t('about.description') }}
      </p>

      <div class="about-contact">
        <span class="about-contact-title">{{ t('about.contact') }}</span>
        <div class="about-contact-list">
          <div class="about-contact-row">
            <span class="about-contact-platform">
              <QqOutlined class="about-contact-icon" />
              {{ t('about.qqLabel') }}
            </span>
            <TypographyParagraph
              class="about-contact-account"
              :copyable="{ text: t('about.qqAccount') }"
            >
              {{ t('about.qqAccount') }}
            </TypographyParagraph>
          </div>
          <div class="about-contact-row">
            <span class="about-contact-platform">
              <DiscordFilled class="about-contact-icon" />
              {{ t('about.discordLabel') }}
            </span>
            <TypographyParagraph
              class="about-contact-account"
              :copyable="{ text: t('about.discordAccount') }"
            >
              {{ t('about.discordAccount') }}
            </TypographyParagraph>
          </div>
        </div>
      </div>

      <!-- 外部链接按钮 -->
      <button class="about-link-btn" @click="openLink">
        <ExternalLink :size="14" />
        {{ t('about.learnMore') }}
      </button>
    </div>
  </Modal>
</template>

<style scoped>
.about-card {
  width: 340px;
  max-width: 340px;
  padding: 32px 28px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

:deep(.about-modal-root .ant-modal-content) {
  padding: 0;
}

:deep(.about-modal-root .ant-modal-body) {
  padding: 0;
}

:deep(.about-modal-root .ant-modal-close) {
  color: var(--color-primary);
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
  font-size: 18px;
  font-weight: 700;
  color: var(--color-foreground);
  margin: 0;
  letter-spacing: 0.01em;
  text-align: center;
}

.about-version-badge {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-foreground);
  background: var(--bg-primary-10);
  border: 1px solid var(--border-primary-20);
  border-radius: 999px;
  padding: 2px 10px;
}

.about-version-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.about-update-btn {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  color: var(--color-primary);
  background: var(--bg-white-80);
  border: 1px solid var(--border-primary-20);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.about-update-btn:hover:not(:disabled) {
  color: white;
  border-color: transparent;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  box-shadow: var(--shadow-pink-sm);
}

.about-update-btn:disabled {
  cursor: progress;
  opacity: 0.8;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

.about-divider {
  width: 100%;
  height: 1px;
  background: var(--border-primary-15);
  margin-bottom: 18px;
}

.about-description {
  font-size: 13.5px;
  color: var(--color-foreground);
  line-height: 1.65;
  text-align: center;
  margin: 0 0 14px;
  width: 100%;
}

.about-contact {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 18px;
  border-radius: 10px;
  background: var(--bg-primary-10);
  color: var(--color-foreground);
  font-size: 12px;
}

.about-contact-title {
  font-weight: 600;
  color: var(--color-foreground);
  text-align: center;
}

.about-contact-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.about-contact-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.about-contact-platform {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.about-contact-icon {
  font-size: 17px;
  color: var(--color-primary);
}

.about-contact-account {
  margin: 0;
  min-width: 0;
  color: var(--color-foreground);
  font-weight: 600;
}

:deep(.about-contact-account.ant-typography) {
  margin-bottom: 0;
}

:deep(.about-contact-account .ant-typography-copy) {
  color: var(--color-primary);
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

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
