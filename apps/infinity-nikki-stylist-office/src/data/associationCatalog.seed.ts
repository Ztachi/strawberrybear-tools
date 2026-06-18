/**
 * @fileOverview 协会资料库本地种子数据
 * @description 在远程 R2 manifest 接入前，使用与后台接口同构的本地对象支撑页面骨架和校验。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { associationCatalogSchema } from '@/domain/catalog/schema'

/** 当前 MVP 内置的协会资料库 seed，后续远程 JSON 必须保持同构。 */
const rawAssociationCatalog = {
  schemaVersion: '2026-06-18',
  catalogId: 'miraland-stylist-office',
  catalogVersion: '2026.06.18-001',
  defaultTemplateId: 'template-miracle-continent-classic-001',
  locales: ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'],
  templates: [
    {
      id: 'template-miracle-continent-classic-001',
      name: {
        'zh-CN': '奇迹大陆协会经典证书',
      },
      baseSize: {
        width: 3840,
        height: 2160,
      },
      overlayAssetId: 'asset-template-classic-overlay',
      textSlots: [
        {
          id: 'name',
          label: '姓名',
          x: 1125,
          y: 930,
          width: 720,
          height: 92,
          fontSize: 68,
          fontFamily: 'Noto Serif SC',
          color: '#536482',
          align: 'left',
          source: 'stylistName',
        },
        {
          id: 'stylistTitle',
          label: '证书等级',
          x: 1045,
          y: 1818,
          width: 610,
          height: 72,
          fontSize: 48,
          fontFamily: 'Noto Serif SC',
          color: '#9A6D2F',
          align: 'center',
          source: 'selectedTitleName',
        },
      ],
    },
  ],
  titleOptions: [
    {
      id: 'wish-weaver',
      name: { 'zh-CN': '心愿织光搭配师' },
      description: { 'zh-CN': '以心愿为经纬，把微光织进每一次搭配。' },
      symbol: '✦',
    },
    {
      id: 'starlight-roamer',
      name: { 'zh-CN': '星辉漫游搭配师' },
      description: { 'zh-CN': '追随星辉轨迹，在旅途中记录闪耀灵感。' },
      symbol: '✧',
    },
    {
      id: 'flower-dreamer',
      name: { 'zh-CN': '花语映梦搭配师' },
      description: { 'zh-CN': '让花语与梦境相映，呈现温柔而坚定的风格。' },
      symbol: '❀',
    },
    {
      id: 'cloud-tailor',
      name: { 'zh-CN': '云端裁梦搭配师' },
      description: { 'zh-CN': '在云端裁剪幻想，把梦的轮廓落成衣装。' },
      symbol: '☁',
    },
    {
      id: 'crystal-tracer',
      name: { 'zh-CN': '晶彩寻迹搭配师' },
      description: { 'zh-CN': '循着晶彩痕迹，寻找每个造型的高光瞬间。' },
      symbol: '◆',
    },
    {
      id: 'windtime-collector',
      name: { 'zh-CN': '风旅拾光搭配师' },
      description: { 'zh-CN': '随风旅行，拾起流光，整理成自己的搭配档案。' },
      symbol: '◇',
    },
    {
      id: 'moon-fantasia',
      name: { 'zh-CN': '月影绮想搭配师' },
      description: { 'zh-CN': '在月影下展开绮想，让神秘感成为风格底色。' },
      symbol: '☾',
    },
    {
      id: 'dawn-painter',
      name: { 'zh-CN': '晨曦绘梦搭配师' },
      description: { 'zh-CN': '以晨曦作画，把新的冒险绘入搭配篇章。' },
      symbol: '☼',
    },
  ],
  regions: [
    {
      id: 'florawish',
      code: 'FLW',
      name: { 'zh-CN': '花愿镇' },
    },
    {
      id: 'stoneville',
      code: 'STV',
      name: { 'zh-CN': '石树田无人区' },
    },
    {
      id: 'breezy-meadow',
      code: 'BRM',
      name: { 'zh-CN': '微风绿野' },
    },
  ],
  comments: [
    {
      id: 'comment-graceful-creation',
      text: {
        'zh-CN': '经奇迹大陆搭配师协会总部审核，认定持证人具备卓越的审美感知力与搭配创造力。',
      },
    },
  ],
  officialAvatars: [
    {
      id: 'avatar-default-nikki',
      name: { 'zh-CN': '协会默认头像' },
      assetId: 'asset-avatar-default-nikki',
    },
  ],
  officialBackgrounds: [
    {
      id: 'background-snow-mountain',
      name: { 'zh-CN': '雪山晶彩背景' },
      assetId: 'asset-background-snow-mountain',
    },
  ],
  imageAssets: [
    {
      id: 'asset-template-classic-overlay',
      kind: 'template-overlay',
      url: '/association-data/assets/template-classic-overlay.png',
      mimeType: 'image/png',
      width: 3840,
      height: 2160,
    },
    {
      id: 'asset-avatar-default-nikki',
      kind: 'avatar',
      url: '/association-data/assets/avatar-default-nikki.png',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
    },
    {
      id: 'asset-background-snow-mountain',
      kind: 'background',
      url: '/association-data/assets/background-snow-mountain.png',
      mimeType: 'image/png',
      width: 3840,
      height: 2160,
    },
  ],
  fontAssets: [],
} as const

// seed 数据在模块加载时就校验，保证开发阶段 schema 变更能第一时间暴露。
export const associationCatalogSeed = associationCatalogSchema.parse(rawAssociationCatalog)
