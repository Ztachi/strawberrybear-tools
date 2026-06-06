/**
 * @fileOverview Infinity Nikki antdv-next theme configuration
 * @description Centralizes Antdv Next theme tokens, static feedback context, and popup container rules.
 */
import type { CSSProperties, VNodeChild } from 'vue'
import { h } from 'vue'
import { App as AntApp, ConfigProvider } from 'antdv-next'
import type { ConfigProviderProps, ThemeConfig } from 'antdv-next'
import { getAntdvLocale, i18n } from '@/i18n'

/** 主品牌粉色，源自无限暖暖当前项目视觉基准。 */
export const NIKKI_PRIMARY_COLOR = '#F7B7BE'
/** 主品牌粉色悬停态，必须比常态更深，确保 hover 是增强反馈。 */
export const NIKKI_PRIMARY_HOVER_COLOR = '#EE8FA1'
/** 主品牌粉色按下态，比 hover 再深一级，形成明确按压层级。 */
export const NIKKI_PRIMARY_ACTIVE_COLOR = '#E36F86'
/** 主品牌粉色禁用背景，只降低饱和和对比，不回退到灰色系。 */
export const NIKKI_PRIMARY_DISABLED_BG = '#FFF1F4'
/** 主品牌粉色禁用描边，用于 disabled 按钮和输入控件边框。 */
export const NIKKI_PRIMARY_DISABLED_BORDER = '#F8D4DA'
/** 主品牌粉色禁用文字，保持主题感但降低可交互暗示。 */
export const NIKKI_PRIMARY_DISABLED_TEXT = '#F0B8C2'
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
    colorError: '#EF5B6B',
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
    Button: {
      colorPrimary: NIKKI_PRIMARY_COLOR,
      colorPrimaryHover: NIKKI_PRIMARY_HOVER_COLOR,
      colorPrimaryActive: NIKKI_PRIMARY_ACTIVE_COLOR,
      colorPrimaryBg: '#FFF5F7',
      colorPrimaryBgHover: '#FFE8EE',
      colorPrimaryBorder: '#F5AAB8',
      colorPrimaryBorderHover: NIKKI_PRIMARY_HOVER_COLOR,
      colorBgContainerDisabled: NIKKI_PRIMARY_DISABLED_BG,
      colorBorderDisabled: NIKKI_PRIMARY_DISABLED_BORDER,
      colorTextDisabled: NIKKI_PRIMARY_DISABLED_TEXT,
      borderRadius: 12,
      fontWeight: 500,
      defaultBg: 'rgba(255, 255, 255, 0.8)',
      defaultBorderColor: NIKKI_PRIMARY_COLOR,
      defaultColor: NIKKI_PRIMARY_ACTIVE_COLOR,
      defaultHoverBg: '#FFF0F3',
      defaultHoverBorderColor: NIKKI_PRIMARY_HOVER_COLOR,
      defaultHoverColor: NIKKI_PRIMARY_HOVER_COLOR,
      defaultActiveBg: '#FFE4EA',
      defaultActiveBorderColor: NIKKI_PRIMARY_ACTIVE_COLOR,
      defaultActiveColor: NIKKI_PRIMARY_ACTIVE_COLOR,
      defaultBgDisabled: NIKKI_PRIMARY_DISABLED_BG,
      dashedBgDisabled: NIKKI_PRIMARY_DISABLED_BG,
      primaryColor: '#FFFFFF',
      primaryShadow: '0 4px 16px rgba(238, 143, 161, 0.28)',
      defaultShadow: 'none',
      dangerShadow: '0 4px 16px rgba(239, 91, 107, 0.22)',
      algorithm: true,
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
}

/**
 * @description: Antdv Next 根配置
 * @description 统一提供给根 ConfigProvider 和静态反馈 holder，避免主题上下文分叉。
 */
export const infinityNikkiConfigProviderProps: ConfigProviderProps = {
  theme: infinityNikkiTheme,
  button: infinityNikkiButtonConfig,
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
