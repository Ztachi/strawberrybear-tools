/**
 * @fileOverview Infinity Nikki antdv-next theme configuration
 * @description Centralizes Antdv Next theme tokens, static feedback context, and popup container rules.
 */
import type { CSSProperties, VNodeChild } from 'vue'
import { h } from 'vue'
import { App as AntApp, ConfigProvider } from 'antdv-next'
import type { ThemeConfig } from 'antdv-next'

/** 主品牌粉色，源自无限暖暖当前项目视觉基准。 */
export const NIKKI_PRIMARY_COLOR = '#F7C0C1'
/** 主品牌粉色悬停态，用于按钮、选中项和可交互边框。 */
export const NIKKI_PRIMARY_HOVER_COLOR = '#F5AAB8'
/** 主品牌粉色按下态，确保浅色界面里仍有明确反馈。 */
export const NIKKI_PRIMARY_ACTIVE_COLOR = '#E98CA2'
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
    colorBgElevated: '#FFF9FC',
    colorBorder: '#F3CAD0',
    colorBorderSecondary: '#F8DCE2',
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
      borderRadius: 12,
      primaryShadow: '0 4px 16px rgba(247, 192, 193, 0.28)',
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
      h(
        ConfigProvider,
        {
          theme: infinityNikkiTheme,
        },
        {
          default: () => h(AntApp, null, () => children),
        }
      ),
  })
}
