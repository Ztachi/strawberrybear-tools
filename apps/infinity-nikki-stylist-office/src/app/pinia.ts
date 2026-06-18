/**
 * @fileOverview Pinia 初始化
 * @description 注册 pinia-plugin-persistedstate，并约束仅轻量 UI 偏好使用 Pinia 持久化。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

/** 应用共享 Pinia 实例。 */
export const pinia = createPinia()

// 持久化插件只用于 UI 语言、最近 tab 等小型偏好；业务草稿和 Blob 继续由 Dexie 管理。
pinia.use(piniaPluginPersistedstate)
