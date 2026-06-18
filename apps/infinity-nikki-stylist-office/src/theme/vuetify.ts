/**
 * @fileOverview Vuetify 主题配置
 * @description 使用 @strawberrybear/nikki-theme 的公共 token 组装当前 Web App 的 Vuetify 主题。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import { createVuetify } from 'vuetify'
import { NIKKI_RADII, NIKKI_STATE_COLORS } from '@strawberrybear/nikki-theme'

/** 当前签发处使用更鲜明的粉色主色，保证主按钮可读且更贴近无限暖暖氛围。 */
const OFFICE_THEME_COLORS = {
  primary: '#ef5f8f',
  secondary: '#9b7bff',
  background: '#fff3f8',
  surface: '#fff9fc',
  surfaceVariant: '#ffeaf2',
}

/** 应用 Vuetify 实例。 */
export const vuetify = createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: 'nikkiLight',
    themes: {
      nikkiLight: {
        dark: false,
        colors: {
          primary: OFFICE_THEME_COLORS.primary,
          'on-primary': '#ffffff',
          secondary: OFFICE_THEME_COLORS.secondary,
          'on-secondary': '#ffffff',
          background: OFFICE_THEME_COLORS.background,
          'on-background': '#4a3240',
          surface: OFFICE_THEME_COLORS.surface,
          'on-surface': '#4a3240',
          'surface-variant': OFFICE_THEME_COLORS.surfaceVariant,
          success: NIKKI_STATE_COLORS.success,
          warning: NIKKI_STATE_COLORS.warning,
          error: NIKKI_STATE_COLORS.danger,
        },
        variables: {
          'border-radius-root': NIKKI_RADII.md,
        },
      },
    },
  },
  defaults: {
    VBtn: {
      rounded: 'lg',
    },
    VCard: {
      rounded: 'lg',
    },
  },
})
