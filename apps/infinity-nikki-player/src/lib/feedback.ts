/**
 * @fileOverview Antdv Next feedback helpers
 * @description Provides a stable notification API so business modules do not depend on UI-framework details.
 */
import { notification } from 'antdv-next'

/**
 * @description: 反馈提示等级
 */
type FeedbackType = 'success' | 'error' | 'warning' | 'info'

/**
 * @description: 反馈提示配置
 */
interface FeedbackOptions {
  /** 详情文本，迁移前的通知调用点会继续传入该字段。 */
  description?: string
  /** 自动关闭时长，单位秒；沿用 Antdv Next notification 语义。 */
  duration?: number
  /** 兼容旧通知参数，Antdv Next 不需要读取。 */
  richColors?: boolean
}

/**
 * @description: 归一化反馈配置
 * @param {FeedbackOptions | string | undefined} options - 调用方传入的旧配置或详情字符串
 * @return {FeedbackOptions} 标准反馈配置
 */
function normalizeFeedbackOptions(options?: FeedbackOptions | string): FeedbackOptions {
  // 允许少数调用点直接把详情作为第二参数，避免反馈 API 过早限制业务层写法。
  if (typeof options === 'string') {
    return {
      description: options,
    }
  }

  return options ?? {}
}

/**
 * @description: 展示 Antdv Next 通知
 * @param {FeedbackType} type - 通知类型
 * @param {string} title - 通知标题
 * @param {FeedbackOptions | string} [options] - 通知配置
 * @return {void} 无返回值
 */
function showFeedback(type: FeedbackType, title: string, options?: FeedbackOptions | string): void {
  const normalizedOptions = normalizeFeedbackOptions(options)

  notification[type]({
    title,
    description: normalizedOptions.description,
    duration: normalizedOptions.duration,
    placement: 'bottomRight',
    showProgress: true,
    pauseOnHover: true,
  })
}

/**
 * @description: 应用反馈 API
 * @description 保留 toast-like 形态，降低替换 UI 框架通知层时对业务代码的影响。
 */
export const feedback = {
  /**
   * @description: 展示成功反馈
   * @param {string} title - 标题
   * @param {FeedbackOptions | string} [options] - 详情或配置
   * @return {void} 无返回值
   */
  success(title: string, options?: FeedbackOptions | string): void {
    showFeedback('success', title, options)
  },

  /**
   * @description: 展示错误反馈
   * @param {string} title - 标题
   * @param {FeedbackOptions | string} [options] - 详情或配置
   * @return {void} 无返回值
   */
  error(title: string, options?: FeedbackOptions | string): void {
    showFeedback('error', title, options)
  },

  /**
   * @description: 展示警告反馈
   * @param {string} title - 标题
   * @param {FeedbackOptions | string} [options] - 详情或配置
   * @return {void} 无返回值
   */
  warning(title: string, options?: FeedbackOptions | string): void {
    showFeedback('warning', title, options)
  },

  /**
   * @description: 展示信息反馈
   * @param {string} title - 标题
   * @param {FeedbackOptions | string} [options] - 详情或配置
   * @return {void} 无返回值
   */
  info(title: string, options?: FeedbackOptions | string): void {
    showFeedback('info', title, options)
  },
}
