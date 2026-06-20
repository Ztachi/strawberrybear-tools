/**
 * @fileOverview 协会资料库本地种子数据
 * @description 在远程 R2 manifest 接入前，使用与后台接口同构的本地对象支撑页面骨架和校验。
 * @author strawberrybear
 * @date 2026-06-18
 */
import { MIRALAND_REGION_OPTIONS } from '@/const'
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
        'zh-TW': '奇蹟大陸協會經典證書',
        'en-US': 'Miracle Continent Association Classic Certificate',
        'ja-JP': '奇跡大陸協会クラシック証書',
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
      name: {
        'zh-CN': '心愿织光搭配师',
        'zh-TW': '心願織光搭配師',
        'en-US': 'Wishlight Weaver Stylist',
        'ja-JP': '願い織りの光スタイリスト',
      },
      description: {
        'zh-CN': '以心愿为经纬，把微光织进每一次搭配。',
        'zh-TW': '以心願為經緯，把微光織進每一次搭配。',
        'en-US': 'Weaves gentle light from wishes into every styling choice.',
        'ja-JP': '願いを縦糸と横糸にして、淡い光をすべてのコーデに織り込みます。',
      },
      symbol: '✦',
    },
    {
      id: 'starlight-roamer',
      name: {
        'zh-CN': '星辉漫游搭配师',
        'zh-TW': '星輝漫遊搭配師',
        'en-US': 'Starlight Roamer Stylist',
        'ja-JP': '星明かりの旅スタイリスト',
      },
      description: {
        'zh-CN': '追随星辉轨迹，在旅途中记录闪耀灵感。',
        'zh-TW': '追隨星輝軌跡，在旅途中記錄閃耀靈感。',
        'en-US': 'Follows trails of starlight and records bright inspiration on the road.',
        'ja-JP': '星明かりの軌跡を追い、旅の中で輝くひらめきを記録します。',
      },
      symbol: '✧',
    },
    {
      id: 'flower-dreamer',
      name: {
        'zh-CN': '花语映梦搭配师',
        'zh-TW': '花語映夢搭配師',
        'en-US': 'Floral Dream Stylist',
        'ja-JP': '花言葉の夢映しスタイリスト',
      },
      description: {
        'zh-CN': '让花语与梦境相映，呈现温柔而坚定的风格。',
        'zh-TW': '讓花語與夢境相映，呈現溫柔而堅定的風格。',
        'en-US': 'Pairs floral meanings with dreams to show a gentle, assured style.',
        'ja-JP': '花言葉と夢を響かせ、やさしく芯のあるスタイルを描きます。',
      },
      symbol: '❀',
    },
    {
      id: 'cloud-tailor',
      name: {
        'zh-CN': '云端裁梦搭配师',
        'zh-TW': '雲端裁夢搭配師',
        'en-US': 'Cloud Dream Tailor Stylist',
        'ja-JP': '雲上の夢裁ちスタイリスト',
      },
      description: {
        'zh-CN': '在云端裁剪幻想，把梦的轮廓落成衣装。',
        'zh-TW': '在雲端裁剪幻想，把夢的輪廓落成衣裝。',
        'en-US': 'Cuts fantasy among the clouds and shapes dream outlines into outfits.',
        'ja-JP': '雲の上で幻想を裁ち、夢の輪郭を装いへと仕立てます。',
      },
      symbol: '☁',
    },
    {
      id: 'crystal-tracer',
      name: {
        'zh-CN': '晶彩寻迹搭配师',
        'zh-TW': '晶彩尋跡搭配師',
        'en-US': 'Crystal Trace Stylist',
        'ja-JP': '晶彩の足跡スタイリスト',
      },
      description: {
        'zh-CN': '循着晶彩痕迹，寻找每个造型的高光瞬间。',
        'zh-TW': '循著晶彩痕跡，尋找每個造型的高光瞬間。',
        'en-US': 'Tracks crystal glimmers to find the highlight moment in every look.',
        'ja-JP': 'きらめく痕跡をたどり、すべての装いのハイライトを見つけます。',
      },
      symbol: '◆',
    },
    {
      id: 'windtime-collector',
      name: {
        'zh-CN': '风旅拾光搭配师',
        'zh-TW': '風旅拾光搭配師',
        'en-US': 'Windborne Light Collector Stylist',
        'ja-JP': '風旅の光拾いスタイリスト',
      },
      description: {
        'zh-CN': '随风旅行，拾起流光，整理成自己的搭配档案。',
        'zh-TW': '隨風旅行，拾起流光，整理成自己的搭配檔案。',
        'en-US': 'Travels with the wind, gathers passing light, and files it as style.',
        'ja-JP': '風と旅し、流れる光を拾い、自分だけのコーデ記録に整えます。',
      },
      symbol: '◇',
    },
    {
      id: 'moon-fantasia',
      name: {
        'zh-CN': '月影绮想搭配师',
        'zh-TW': '月影綺想搭配師',
        'en-US': 'Moonshadow Fantasia Stylist',
        'ja-JP': '月影綺想スタイリスト',
      },
      description: {
        'zh-CN': '在月影下展开绮想，让神秘感成为风格底色。',
        'zh-TW': '在月影下展開綺想，讓神秘感成為風格底色。',
        'en-US': 'Unfolds fantasia under moonlight and makes mystery the style base.',
        'ja-JP': '月影の下で綺想を広げ、神秘をスタイルの土台にします。',
      },
      symbol: '☾',
    },
    {
      id: 'dawn-painter',
      name: {
        'zh-CN': '晨曦绘梦搭配师',
        'zh-TW': '晨曦繪夢搭配師',
        'en-US': 'Dawn Dream Painter Stylist',
        'ja-JP': '暁の夢描きスタイリスト',
      },
      description: {
        'zh-CN': '以晨曦作画，把新的冒险绘入搭配篇章。',
        'zh-TW': '以晨曦作畫，把新的冒險繪入搭配篇章。',
        'en-US': 'Paints with dawnlight and adds new adventures to the styling story.',
        'ja-JP': '朝の光で描き、新しい冒険をコーデの章へ加えます。',
      },
      symbol: '☼',
    },
  ],
  regions: MIRALAND_REGION_OPTIONS,
  comments: [
    {
      id: 'comment-graceful-creation',
      text: {
        'zh-CN': '经奇迹大陆搭配师协会总部审核，认定持证人具备卓越的审美感知力与搭配创造力。',
        'zh-TW': '經奇蹟大陸搭配師協會總部審核，認定持證人具備卓越的審美感知力與搭配創造力。',
        'en-US':
          'Reviewed by the Miracle Continent Stylist Association Headquarters, the holder is recognized for outstanding aesthetic perception and styling creativity.',
        'ja-JP':
          '奇跡大陸スタイリスト協会本部の審査により、所持者は優れた審美感覚とスタイリング創造力を備えると認定されます。',
      },
    },
  ],
  officialAvatars: [
    {
      id: 'avatar-default-nikki',
      name: {
        'zh-CN': '协会默认头像',
        'zh-TW': '協會預設頭像',
        'en-US': 'Association Default Avatar',
        'ja-JP': '協会デフォルトアバター',
      },
      assetId: 'asset-avatar-default-nikki',
    },
  ],
  officialBackgrounds: [
    {
      id: 'background-snow-mountain',
      name: {
        'zh-CN': '雪山晶彩背景',
        'zh-TW': '雪山晶彩背景',
        'en-US': 'Snow Mountain Crystal Background',
        'ja-JP': '雪山クリスタル背景',
      },
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
