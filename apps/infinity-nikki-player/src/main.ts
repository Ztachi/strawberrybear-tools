/**
 * @fileOverview 应用入口文件
 * @description 负责创建 Vue 应用、初始化插件（Pinia、i18n）和挂载点配置
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n, initI18n } from './i18n'
import { router } from './router'
import { getAppContext } from './bootstrap/createAppContext'
import { bindAppContextStores } from './bootstrap/bindAppContextStores'
import { configureAntdvStaticContext } from './theme/infinityNikkiTheme'
import { applyPendingTemplateDrafts } from './lib/dataManagementBrowser'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { message } from '@tauri-apps/plugin-dialog'
import 'antdv-next/dist/reset.css'
import './style.css'

/** 创建 Vue 应用实例 */
const app = createApp(App)

/** 注册 Pinia 状态管理插件 */
const pinia = createPinia()
app.use(pinia)

/** 绑定应用级播放器运行时，确保 store 只桥接公共 Player 状态 */
bindAppContextStores(pinia, getAppContext())

/** 注册 i18n 国际化插件 */
app.use(i18n)

/** 注册 Vue Router，仅用于主窗口文件/模板页签 URL 状态同步 */
app.use(router)

/**
 * @description: 获取窗口标签
 * @description 从 URL 查询参数中读取 windowLabel，用于支持多窗口
 * @return {string} 窗口标签，默认为 'main'
 */
const params = new URLSearchParams(window.location.search)
const windowLabel = params.get('windowLabel') || 'main'

/** 将窗口标签注入到 Vue provide 供子组件使用 */
app.provide('windowLabel', windowLabel)

/** 配置 Antdv Next 静态反馈弹层，保证 notification/message 继承无限暖暖主题 */
configureAntdvStaticContext()

/**
 * @description: 初始化 i18n
 * @description 从 Rust 后端获取系统语言设置，然后初始化国际化配置
 * @return Promise
 */
/** 模板草稿恢复先于任何编辑器挂载，确认成功后才清理原生待恢复记录。 */
async function start(): Promise<void> {
  try {
    await applyPendingTemplateDrafts()
    void initI18n()
    app.mount('#app')
  } catch (error) {
    await getCurrentWindow().show()
    await message(`无法恢复模板草稿，请检查磁盘空间或权限后重新启动。\n${String(error)}`, {
      title: '资料恢复未完成',
      kind: 'error',
    })
  }
}
void start()
