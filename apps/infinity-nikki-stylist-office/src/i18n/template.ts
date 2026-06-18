/**
 * @fileOverview 模板语言包
 * @description 维护证书模板上的固定文案，和应用 UI 语言包分离。
 * @author strawberrybear
 * @date 2026-06-18
 */
import type { LocaleCode } from '@/domain/catalog/types'

/** 证书模板固定文案。 */
export interface TemplateLocaleMessages {
  /** 证书主标题 */
  certificateTitle: string
  /** 姓名字段标签 */
  nameLabel: string
  /** 姓名未填写时的模板占位 */
  namePlaceholder: string
  /** 通用字段未填写占位 */
  fieldPlaceholder: string
  /** 称号字段标签 */
  stylistTitleLabel: string
  /** 地区字段标签 */
  regionLabel: string
  /** 评语字段标签 */
  commentLabel: string
  /** 编号字段标签 */
  certificateNoLabel: string
  /** 待编录编号占位 */
  pendingCertificateNo: string
  /** 会长签章字段标签 */
  presidentLabel: string
  /** 会长签章姓名 */
  presidentName: string
  /** 发证机构名称 */
  associationName: string
  /** 签发前校样水印 */
  proofWatermark: string
}

/** 模板文案按语言独立维护，避免混入 UI 页面操作文案。 */
const TEMPLATE_LOCALE_MESSAGES: Record<LocaleCode, TemplateLocaleMessages> = {
  'zh-CN': {
    certificateTitle: '奇迹大陆搭配师身份证书',
    nameLabel: '搭配师姓名',
    namePlaceholder: '待登记',
    fieldPlaceholder: '待确认',
    stylistTitleLabel: '认证称号',
    regionLabel: '登记地区',
    commentLabel: '协会评语',
    certificateNoLabel: '证书编号',
    pendingCertificateNo: '待编录',
    presidentLabel: '会长签章',
    presidentName: '茶叶蛋',
    associationName: '奇迹大陆搭配师协会总部',
    proofWatermark: '未签发校样',
  },
  'zh-TW': {
    certificateTitle: '奇蹟大陸搭配師身份證書',
    nameLabel: '搭配師姓名',
    namePlaceholder: '待登記',
    fieldPlaceholder: '待確認',
    stylistTitleLabel: '認證稱號',
    regionLabel: '登記地區',
    commentLabel: '協會評語',
    certificateNoLabel: '證書編號',
    pendingCertificateNo: '待編錄',
    presidentLabel: '會長簽章',
    presidentName: '茶葉蛋',
    associationName: '奇蹟大陸搭配師協會總部',
    proofWatermark: '未簽發校樣',
  },
  'en-US': {
    certificateTitle: 'Miracle Continent Stylist Identity Certificate',
    nameLabel: 'Stylist Name',
    namePlaceholder: 'Pending',
    fieldPlaceholder: 'Pending',
    stylistTitleLabel: 'Certified Title',
    regionLabel: 'Registration Region',
    commentLabel: 'Association Comment',
    certificateNoLabel: 'Certificate No.',
    pendingCertificateNo: 'Pending',
    presidentLabel: 'President Seal',
    presidentName: 'Tea Egg',
    associationName: 'Miracle Continent Stylist Association Headquarters',
    proofWatermark: 'Unsigned Proof',
  },
  'ja-JP': {
    certificateTitle: '奇跡大陸スタイリスト身分証書',
    nameLabel: 'スタイリスト名',
    namePlaceholder: '登録待ち',
    fieldPlaceholder: '確認待ち',
    stylistTitleLabel: '認定称号',
    regionLabel: '登録地域',
    commentLabel: '協会評語',
    certificateNoLabel: '証書番号',
    pendingCertificateNo: '編録待ち',
    presidentLabel: '会長署名',
    presidentName: '茶葉蛋',
    associationName: '奇跡大陸スタイリスト協会本部',
    proofWatermark: '未発行校正',
  },
}

/**
 * @description: 获取模板语言文案
 * @description 当前四语言都完整配置，保留回退是为了后续资料库扩展时不阻塞渲染。
 * @param {LocaleCode} locale - 目标语言
 * @return {TemplateLocaleMessages} 模板固定文案
 */
export function getTemplateLocaleMessages(locale: LocaleCode): TemplateLocaleMessages {
  return TEMPLATE_LOCALE_MESSAGES[locale] ?? TEMPLATE_LOCALE_MESSAGES['zh-CN']
}
