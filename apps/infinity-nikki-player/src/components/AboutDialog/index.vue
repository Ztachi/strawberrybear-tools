<!--
 * @Author: ztachi(legendryztachi@gmail.com)
 * @Date: 2026-04-17 10:55:52
 * @LastEditors: ztachi(legendryztachi@gmail.com)
 * @LastEditTime: 2026-06-06 22:06:45
 * @FilePath: \strawberrybear-tools\apps\infinity-nikki-player\src\components\AboutDialog\index.vue
 * @Description: 关于对话框组件
-->
<script setup lang="ts">
/**
 * @description: 关于对话框组件
 * @description 监听 Tauri 菜单的 show_about 事件显示，包含应用图标、版本号和描述信息
 */
import { computed, ref, onMounted, onUnmounted, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { listen } from '@tauri-apps/api/event'
import { DiscordFilled, QqOutlined } from '@antdv-next/icons'
import { ExternalLink, FileDown } from 'lucide-vue-next'
import appLogo from '@/assets/images/logo.png'
import { Button, Modal, TypographyParagraph } from 'antdv-next'
import AppUpdateStatus from '@/components/AppUpdateStatus.vue'
import { useAppUpdater } from '@/composables/useAppUpdater'
import { useMainWindowUiStore, type FloatingActionRegistration } from '@/stores/mainWindowUi'

const { t, tm } = useI18n()
const ui = useMainWindowUiStore()
const updater = useAppUpdater()
const aboutBody = ref<HTMLElement | null>(null)
let backToTop: FloatingActionRegistration | undefined

/**
 * @description: 关于页联系方式配置项
 * @description 文案来自 i18n 数组，组件只按 type 选择图标，避免每新增一种联系方式都改模板结构
 */
interface AboutContact {
  type: string
  label: string
  account: string
}

/** 联系方式类型到图标组件的注册表；新增品牌图标时只扩展这里，不新增重复 DOM。 */
const contactIconMap: Record<string, Component> = {
  qq: QqOutlined,
  discord: DiscordFilled,
}

/** 对话框打开状态 @return {boolean} */
const isOpen = ref(false)
watch(isOpen, (open) => {
  backToTop?.()
  backToTop = open ? ui.registerBackToTop(() => aboutBody.value?.scrollTo({ top: 0, behavior: 'smooth' })) : undefined
})

/** 应用版本号 @return {string} */
const version = ref('')

/** 事件监听取消函数 */
let unlisten: (() => void) | undefined

/** 当前语言下的联系方式列表，直接由 i18n 的 about.contacts 数组驱动。 */
const contacts = computed<AboutContact[]>(() => {
  const rawContacts = tm('about.contacts')
  if (!Array.isArray(rawContacts)) return []

  return rawContacts.filter(
    (contact): contact is AboutContact =>
      typeof contact === 'object' &&
      contact !== null &&
      'type' in contact &&
      'label' in contact &&
      'account' in contact &&
      typeof contact.type === 'string' &&
      typeof contact.label === 'string' &&
      typeof contact.account === 'string'
  )
})

/**
 * @description: 显示关于对话框
 * 首次打开时获取应用版本号
 */
async function show() {
  if (!version.value) {
    version.value = await getVersion()
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
  backToTop?.()
})
</script>

<template>
  <Modal
    v-model:open="isOpen"
    :footer="null"
    width="min(440px, calc(100vw - 32px))"
    centered
    root-class="about-modal-root"
    :styles="{ body: { padding: 0 }, container: { padding: 0 } }"
  >
    <!-- 自定义样式对话框内容 -->
    <div data-text-selectable class="about-card">
      <!-- 头部区域：图标、名称、版本 -->
      <div class="about-header">
        <div class="about-icon">
          <img :src="appLogo" class="about-icon-img" alt="app icon" />
        </div>
        <h2 class="about-app-name">
          {{ t('app.title') }}
        </h2>
        <div class="about-version-row">
          <AppUpdateStatus :version="version" />
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="about-divider" />

      <div
        ref="aboutBody"
        class="about-body min-h-0 w-full overflow-y-auto text-center"
        @scroll="backToTop?.setVisible((aboutBody?.scrollTop ?? 0) > 200)"
      >
        <!-- 描述文本 -->
        <p class="about-description">
          {{ t('about.description') }}
        </p>

        <div class="about-contact">
          <span class="about-contact-title">{{ t('about.contact') }}</span>
          <div class="about-contact-list">
            <div v-for="contact in contacts" :key="contact.type" class="about-contact-row">
              <span class="about-contact-platform">
                <component
                  :is="contactIconMap[contact.type]"
                  v-if="contactIconMap[contact.type]"
                  class="about-contact-icon"
                />
                {{ contact.label }}
              </span>
              <TypographyParagraph
                class="about-contact-account"
                :copyable="{ text: contact.account }"
                underline
              >
                {{ contact.account }}
              </TypographyParagraph>
            </div>
          </div>
        </div>

        <!-- 次要操作并列，版本区只保留更新入口。 -->
        <div class="about-actions">
          <Button type="link" @click="openLink">
            <template #icon>
              <ExternalLink class="size-3.5" :stroke-width="2" />
            </template>
            {{ t('about.learnMore') }}
          </Button>
          <Button type="link" @click="updater.exportDiagnostics">
            <template #icon>
              <FileDown class="size-3.5" :stroke-width="2" />
            </template>
            {{ t('updater.exportDiagnostics') }}
          </Button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.about-card {
  max-height: calc(100dvh - 64px);
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.about-header {
  flex-shrink: 0;
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

.about-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.about-version-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.about-divider {
  flex-shrink: 0;
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

:deep(.about-contact-account.ant-typography) {
  margin-bottom: 0;
  min-width: 0;
  color: var(--color-foreground);
  font-weight: 600;
}
</style>
