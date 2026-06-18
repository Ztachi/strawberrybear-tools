/**
 * @fileOverview Vuetify 主题配置
 * @description 使用 @strawberrybear/nikki-theme 的公共 token 组装当前 Web App 的 Vuetify 主题。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import { createVuetify } from 'vuetify'
import { NIKKI_COLORS, NIKKI_RADII, NIKKI_STATE_COLORS } from '@strawberrybear/nikki-theme'

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
          primary: NIKKI_COLORS.primary,
          secondary: NIKKI_COLORS.secondary,
          background: NIKKI_COLORS.background,
          surface: NIKKI_COLORS.container,
          'surface-variant': NIKKI_COLORS.elevated,
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
