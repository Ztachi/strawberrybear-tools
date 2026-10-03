/**
 * @fileOverview Infinity Nikki antdv-next theme configuration
 * @description Centralizes Antdv Next theme tokens, static feedback context, and popup container rules.
 */
import type { CSSProperties, VNodeChild } from 'vue'
import { h } from 'vue'
import { App as AntApp, ConfigProvider } from 'antdv-next'
import type { ConfigProviderProps, ThemeConfig } from 'antdv-next'
import type { PianoRollThemeInput } from '@strawberrybear/piano-roll/browser'
import { getAntdvLocale, i18n } from '@/i18n'

/** 主品牌粉色，源自无限暖暖当前项目视觉基准。 */
export const NIKKI_PRIMARY_COLOR = '#F7B7BE'
/** 主品牌粉色悬停态，必须比常态更深，确保 hover 是增强反馈。 */
export const NIKKI_PRIMARY_HOVER_COLOR = '#EE8FA1'
/** 主品牌粉色按下态，比 hover 再深一级，形成明确按压层级。 */
export const NIKKI_PRIMARY_ACTIVE_COLOR = '#E36F86'
/** MIDI 音轨未自定义时的统一颜色；菜单、总览和详情共用。 */
export const MIDI_EDITOR_DEFAULT_TRACK_COLOR = NIKKI_PRIMARY_ACTIVE_COLOR
/** 编辑器两种视图共用缺省音符色，不向工程数据写入主题颜色。 */
export const midiEditorPianoRollTheme: PianoRollThemeInput = {
  colors: {
    overviewNote: MIDI_EDITOR_DEFAULT_TRACK_COLOR,
    editorNote: MIDI_EDITOR_DEFAULT_TRACK_COLOR,
  },
}
/** 框架种子使用具体颜色；按钮运行时状态读取 style.css 中的同义变量。 */
export const NIKKI_PRIMARY_DISABLED_BG = '#F5F3F3'
/** 中性禁用描边，用于 disabled 按钮和输入控件边框。 */
export const NIKKI_PRIMARY_DISABLED_BORDER = '#E2DCDC'
/** 中性禁用文字，与可用的品牌色操作明确区分。 */
export const NIKKI_PRIMARY_DISABLED_TEXT = '#A89A9A'
/** 顶部菜单高度，抽屉挂载到内容区时不能越过这条布局边界。 */
export const MAIN_WINDOW_HEADER_HEIGHT = 46

/**
 * @description: Antdv Next 全局主题
 * @description 只描述 UI 框架视觉 token，不承载任何业务状态或运行时逻辑。
 */
export const infinityNikkiTheme: ThemeConfig = {
  token: {
    colorPrimary: NIKKI_PRIMARY_COLOR,
    colorPrimaryHover: NIKKI_PRIMARY_HOVER_COLOR,
    colorPrimaryActive: NIKKI_PRIMARY_ACTIVE_COLOR,
    colorPrimaryBg: '#FFF5F7',
    colorPrimaryBgHover: '#FFE8EE',
    colorPrimaryBorder: '#F5AAB8',
    colorPrimaryBorderHover: NIKKI_PRIMARY_HOVER_COLOR,
    colorPrimaryTextHover: NIKKI_PRIMARY_HOVER_COLOR,
    colorPrimaryText: NIKKI_PRIMARY_ACTIVE_COLOR,
    colorPrimaryTextActive: '#D95A75',
    colorInfo: NIKKI_PRIMARY_COLOR,
    colorSuccess: '#4ADE80',
    colorWarning: '#F5C542',
    colorError: '#EF4444',
    colorTextBase: '#4A3F3F',
    colorText: '#4A3F3F',
    colorTextSecondary: '#6B5A5A',
    colorTextTertiary: '#A89A9A',
    colorBgBase: '#FFF7FA',
    colorBgLayout: '#FFF7FA',
    colorBgContainer: '#FFFFFF',
    colorBgContainerDisabled: NIKKI_PRIMARY_DISABLED_BG,
    colorBgElevated: '#FFF9FC',
    colorBorder: '#F3CAD0',
    colorBorderDisabled: NIKKI_PRIMARY_DISABLED_BORDER,
    colorBorderSecondary: '#F8DCE2',
    colorTextDisabled: NIKKI_PRIMARY_DISABLED_TEXT,
    colorFillQuaternary: 'rgba(247, 192, 193, 0.08)',
    colorFillTertiary: 'rgba(247, 192, 193, 0.12)',
    colorFillSecondary: 'rgba(247, 192, 193, 0.16)',
    colorLink: NIKKI_PRIMARY_ACTIVE_COLOR,
    colorLinkHover: NIKKI_PRIMARY_HOVER_COLOR,
    borderRadius: 12,
    borderRadiusLG: 16,
    controlHeight: 34,
    controlHeightSM: 30,
    controlHeightLG: 40,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    FloatButton: {
      controlHeightLG: 30,
      borderRadiusLG: 8,
    },
    Typography: {
      colorLink: 'var(--icon-color)',
      colorLinkHover: 'var(--icon-hover-color)',
      colorLinkActive: 'var(--icon-active-color)',
      colorTextDisabled: 'var(--icon-disabled-color)',
      algorithm: false,
    },
    Slider: {
      railBg: '#EEC6CF',
      railHoverBg: '#E5AAB9',
      trackBg: NIKKI_PRIMARY_ACTIVE_COLOR,
      trackHoverBg: NIKKI_PRIMARY_HOVER_COLOR,
    },
    Button: {
      // CSS 变量必须作为最终组件 token，不能再参与品牌色算法；默认/text/link/solid 共用一组状态。
      colorPrimary: 'var(--control-selected-bg)',
      colorPrimaryHover: 'var(--icon-hover-color)',
      colorPrimaryActive: 'var(--icon-active-color)',
      colorPrimaryBg: 'var(--control-light-bg)',
      colorPrimaryBgHover: 'var(--control-hover-bg)',
      colorPrimaryBorder: 'var(--control-active-bg)',
      colorPrimaryBorderHover: 'var(--icon-hover-color)',
      colorBgContainerDisabled: 'var(--color-disabled-bg)',
      borderColorDisabled: 'var(--color-disabled-border)',
      colorTextDisabled: 'var(--icon-disabled-color)',
      colorLink: 'var(--icon-color)',
      colorLinkHover: 'var(--icon-hover-color)',
      colorLinkActive: 'var(--icon-active-color)',
      colorError: 'var(--color-danger)',
      colorErrorHover: 'var(--color-danger-hover)',
      colorErrorActive: 'var(--color-danger-active)',
      colorErrorBg: 'var(--bg-danger-hover)',
      colorErrorBgFilledHover: 'var(--bg-danger-hover)',
      colorErrorBgActive: 'var(--bg-danger-active)',
      borderRadius: 12,
      fontWeight: 500,
      defaultBg: 'var(--bg-white-80)',
      defaultBorderColor: 'var(--icon-color)',
      defaultColor: 'var(--icon-color)',
      defaultHoverBg: 'var(--control-hover-bg)',
      defaultHoverBorderColor: 'var(--icon-hover-color)',
      defaultHoverColor: 'var(--icon-hover-color)',
      defaultActiveBg: 'var(--control-active-bg)',
      defaultActiveBorderColor: 'var(--icon-active-color)',
      defaultActiveColor: 'var(--icon-active-color)',
      textTextColor: 'var(--icon-color)',
      textTextHoverColor: 'var(--icon-hover-color)',
      textTextActiveColor: 'var(--icon-active-color)',
      textHoverBg: 'var(--control-hover-bg)',
      defaultBgDisabled: 'var(--color-disabled-bg)',
      dashedBgDisabled: 'var(--color-disabled-bg)',
      primaryColor: 'var(--icon-selected-color)',
      dangerColor: 'var(--icon-selected-color)',
      primaryShadow: 'var(--control-primary-shadow)',
      defaultShadow: 'none',
      dangerShadow: 'var(--control-danger-shadow)',
      algorithm: false,
    },
    Drawer: {
      colorBgElevated: '#FFF9FC',
      algorithm: true,
    },
    Modal: {
      colorBgElevated: '#FFF9FC',
      borderRadiusLG: 20,
      algorithm: true,
    },
    Notification: {
      colorBgElevated: '#FFF9FC',
      algorithm: true,
    },
    Popover: {
      colorBgElevated: '#FFF9FC',
      algorithm: true,
    },
    Table: {
      headerBg: 'rgba(255, 249, 252, 0.96)',
      headerColor: '#6B5A5A',
      rowHoverBg: 'rgba(247, 192, 193, 0.08)',
      algorithm: true,
    },
    Tabs: {
      itemSelectedColor: NIKKI_PRIMARY_ACTIVE_COLOR,
      itemHoverColor: NIKKI_PRIMARY_HOVER_COLOR,
      inkBarColor: NIKKI_PRIMARY_COLOR,
      algorithm: true,
    },
    // 工具提示沿用品牌粉色系：背景使用主品牌按压态色，对比度足以承载白色文字，
    // 箭头背景色会自动跟随 colorBgSpotlight，无需额外指定。
    Tooltip: {
      colorBgSpotlight: NIKKI_PRIMARY_ACTIVE_COLOR,
      colorTextLightSolid: '#FFFFFF',
    },
  },
}

/**
 * @description: Antdv Next Button 语义样式入口
 * @description 通过 ConfigProvider.button.classes 挂载，遵循官方 semantic DOM 扩展方式。
 */
export const infinityNikkiButtonConfig: ConfigProviderProps['button'] = {
  classes: {
    root: 'nikki-theme-button',
  },
  styles: {
    root: { outlineColor: 'var(--control-focus-ring)' },
  },
}

/**
 * @description: Antdv Next 根配置
 * @description 统一提供给根 ConfigProvider 和静态反馈 holder，避免主题上下文分叉。
 */
export const infinityNikkiConfigProviderProps: ConfigProviderProps = {
  theme: infinityNikkiTheme,
  button: infinityNikkiButtonConfig,
  // 菜单图标独立于正文色，通过框架语义 class 接入统一状态，避免每个菜单工厂自己着色。
  dropdown: {
    classes: {
      item: 'nikki-menu-action',
      itemTitle: 'nikki-menu-action',
      itemIcon: 'nikki-menu-action-icon',
    },
  },
}

/** MIDI 编辑器在主窗口与独立窗口中共用的紧凑控件规格。 */
export const midiEditorConfigProviderProps: ConfigProviderProps = {
  ...infinityNikkiConfigProviderProps,
  theme: {
    ...infinityNikkiTheme,
    token: {
      ...infinityNikkiTheme.token,
      borderRadius: 6,
      controlHeightSM: 28,
      fontSize: 13,
    },
    components: {
      ...infinityNikkiTheme.components,
      Button: {
        ...infinityNikkiTheme.components?.Button,
        borderRadius: 6,
        primaryShadow: 'none',
      },
      Select: {
        ...infinityNikkiTheme.components?.Select,
        borderRadius: 6,
        borderRadiusLG: 8,
      },
      Popover: {
        ...infinityNikkiTheme.components?.Popover,
        borderRadiusLG: 10,
      },
    },
  },
}

/**
 * @description: 获取主内容弹层容器
 * @description Drawer/Popover/Tooltip 默认挂到 body 会覆盖顶部菜单，这里统一优先挂到内容区。
 * @return {HTMLElement} 主窗口内容弹层容器，找不到时回退到 body
 */
export function getMainWindowPopupContainer(): HTMLElement {
  return document.getElementById('main-window-portal-root') ?? document.body
}

/**
 * @description: 获取 Antdv Drawer 内容区挂载配置
 * @description 自定义容器必须配合 absolute rootStyle，避免 Drawer 继续按视口 fixed 定位。
 * @return {CSSProperties} Drawer 根容器样式
 */
export function getContentDrawerRootStyle(): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
  }
}

/**
 * @description: 为静态 message/notification/modal 注入主题上下文
 * @description Antdv Next 静态 API 不会自动继承根 ConfigProvider，启动时必须单独配置 holder。
 * @return {void} 无返回值
 */
export function configureAntdvStaticContext(): void {
  ConfigProvider.config({
    holderRender: (children: VNodeChild) =>
      h(ConfigProvider, getCurrentInfinityNikkiConfigProviderProps(), {
        default: () => h(AntApp, null, () => children),
      }),
  })
}

/**
 * @description: 获取当前语言下的 Antdv Next 根配置
 * @description 静态反馈 holder 不在 Vue 模板响应式上下文内，渲染时需主动读取当前 i18n 语言。
 * @return {ConfigProviderProps} 包含主题和当前框架语言包的根配置
 */
function getCurrentInfinityNikkiConfigProviderProps(): ConfigProviderProps {
  return {
    ...infinityNikkiConfigProviderProps,
    locale: getAntdvLocale(i18n.global.locale.value),
  }
}
