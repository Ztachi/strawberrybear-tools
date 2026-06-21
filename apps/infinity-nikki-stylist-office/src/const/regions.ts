/**
 * @fileOverview 奇迹大陆地区常量
 * @description 维护登记地区的稳定编号、地区 code 与可国际化名称，供协会资料库 seed 复用。
 * @author strawberrybear
 * @date 2026-06-20
 */
import type { RegionOption } from '@/domain/catalog/types'

/**
 * @description: 奇迹大陆登记地区列表
 * @description 顺序跟随产品确认；多语言名称来自官方 Pear-Pal 地图配置。
 *
 * Source:
 * - Official home: https://infinitynikki.infoldgames.com/en/home
 * - Official JP home: https://infinitynikki.infoldgames.com/ja/home
 * - Pear-Pal map page: https://myl.nuanpaper.com/tools/map?v=2.0
 * - Pear-Pal map API: POST https://pearpal-api.infoldgames.com/v1/strategy/map/world/config/list
 *
 * Verification note:
 * - API body used for verification: {"client_id":1116}
 * - Field used: data.list[].place_name[].name
 * - Last verified: 2026-06-20
 */
export const MIRALAND_REGION_OPTIONS = [
  {
    id: 'florawish',
    number: '001',
    code: 'FLW',
    name: {
      'zh-CN': '花愿镇',
      'zh-TW': '花願鎮',
      'en-US': 'Florawish',
      'ja-JP': '花願町',
    },
  },
  {
    id: 'breezy-meadow',
    number: '002',
    code: 'BRM',
    name: {
      'zh-CN': '微风绿野',
      'zh-TW': '微風綠野',
      'en-US': 'Breezy Meadow',
      'ja-JP': 'そよ風の緑野',
    },
  },
  {
    id: 'little-stoneville',
    number: '003',
    code: 'LSV',
    name: {
      'zh-CN': '小石树田村',
      'zh-TW': '小石樹田村',
      'en-US': 'Stoneville',
      'ja-JP': '石樹の里',
    },
  },
  {
    id: 'stoneville',
    number: '004',
    code: 'STV',
    name: {
      'zh-CN': '石树田无人区',
      'zh-TW': '石樹田無人區',
      'en-US': 'Abandoned District',
      'ja-JP': '石樹の秘境',
    },
  },
  {
    id: 'wishing-woods',
    number: '005',
    code: 'WWD',
    name: {
      'zh-CN': '祈愿树林',
      'zh-TW': '祈願樹林',
      'en-US': 'Wishing Woods',
      'ja-JP': '祈りの森林',
    },
  },
  {
    id: 'memorial-mountains',
    number: '006',
    code: 'MMT',
    name: {
      'zh-CN': '纪念山地',
      'zh-TW': '紀念山地',
      'en-US': 'Memorial Mountains',
      'ja-JP': '追憶の山地',
    },
  },
  {
    id: 'fireworks-isles',
    number: '007',
    code: 'FWI',
    name: {
      'zh-CN': '花焰群岛',
      'zh-TW': '花焰群島',
      'en-US': 'Firework Isles',
      'ja-JP': '花焔群島',
    },
  },
  {
    id: 'carefree-island',
    number: '008',
    code: 'CFI',
    name: {
      'zh-CN': '无忧岛',
      'zh-TW': '無憂島',
      'en-US': 'Serenity Island',
      'ja-JP': 'ユーラク島',
    },
  },
  {
    id: 'danqing-islet',
    number: '009',
    code: 'DQI',
    name: {
      'zh-CN': '丹青屿',
      'zh-TW': '丹青嶼',
      'en-US': 'Danqing Island',
      'ja-JP': '丹青島',
    },
  },
  {
    id: 'danqing-realm',
    number: '010',
    code: 'DQR',
    name: {
      'zh-CN': '丹青之境',
      'zh-TW': '丹青之境',
      'en-US': 'Danqing Realm',
      'ja-JP': '丹青境',
    },
  },
  {
    id: 'giant-outpost-ruins',
    number: '011',
    code: 'GOR',
    name: {
      'zh-CN': '巨人哨所遗址',
      'zh-TW': '巨人哨所遺址',
      'en-US': "Titans' Outpost Ruins",
      'ja-JP': '巨人の守衛所遺跡',
    },
  },
  {
    id: 'snail-farm',
    number: '012',
    code: 'SNF',
    name: {
      'zh-CN': '蜗牛农场',
      'zh-TW': '蝸牛農場',
      'en-US': 'Snail Ranch',
      'ja-JP': 'スカルゴ飼育場',
    },
  },
  {
    id: 'snail-city-falls',
    number: '013',
    code: 'SCF',
    name: {
      'zh-CN': '蜗牛城瀑布',
      'zh-TW': '蝸牛城瀑布',
      'en-US': 'Spira Waterfall',
      'ja-JP': 'スカルゴン城・滝',
    },
  },
  {
    id: 'mushmush-settlement',
    number: '014',
    code: 'MMS',
    name: {
      'zh-CN': '菇菇聚落',
      'zh-TW': '菇菇聚落',
      'en-US': 'Shroomville',
      'ja-JP': 'キノキノ集落',
    },
  },
  {
    id: 'mother-mushroom-woods',
    number: '015',
    code: 'MMW',
    name: {
      'zh-CN': '母菇林地',
      'zh-TW': '母菇林地',
      'en-US': 'Mothershroom Woods',
      'ja-JP': 'マザーキノコの森',
    },
  },
  {
    id: 'shell-island',
    number: '016',
    code: 'SHI',
    name: {
      'zh-CN': '壳壳岛',
      'zh-TW': '殼殼島',
      'en-US': 'Shell Island',
      'ja-JP': 'カラカラ島',
    },
  },
  {
    id: 'giant-vine-woods',
    number: '017',
    code: 'GVW',
    name: {
      'zh-CN': '巨藤林地',
      'zh-TW': '巨藤林地',
      'en-US': 'Giant Vine Forest',
      'ja-JP': '巨蔓の林地',
    },
  },
  {
    id: 'beast-fortress',
    number: '018',
    code: 'BST',
    name: {
      'zh-CN': '巨兽堡垒',
      'zh-TW': '巨獸堡壘',
      'en-US': 'Coliseum',
      'ja-JP': '巨獣の城塞',
    },
  },
  {
    id: 'forgotten-old-street',
    number: '019',
    code: 'FOS',
    name: {
      'zh-CN': '遗忘旧街',
      'zh-TW': '遺忘舊街',
      'en-US': 'Forgotten Street',
      'ja-JP': '忘却の旧市街',
    },
  },
  {
    id: 'leaf-river',
    number: '020',
    code: 'LFR',
    name: {
      'zh-CN': '叶子河',
      'zh-TW': '葉子河',
      'en-US': 'Leaf River',
      'ja-JP': 'リーフリバー',
    },
  },
  {
    id: 'pottery-jar-village',
    number: '021',
    code: 'PJV',
    name: {
      'zh-CN': '陶罐村',
      'zh-TW': '陶罐村',
      'en-US': 'Pottsville',
      'ja-JP': 'ツボツボ村',
    },
  },
  {
    id: 'giant-graveyard',
    number: '022',
    code: 'GGY',
    name: {
      'zh-CN': '巨人墓园',
      'zh-TW': '巨人墓園',
      'en-US': "The Titan's Graveyard",
      'ja-JP': '巨人の墓地',
    },
  },
  {
    id: 'sleeping-forest',
    number: '023',
    code: 'SLF',
    name: {
      'zh-CN': '安眠之林',
      'zh-TW': '安眠之林',
      'en-US': 'Forest of Slumber',
      'ja-JP': '眠りの森',
    },
  },
  {
    id: 'oldwood-shade',
    number: '024',
    code: 'OWS',
    name: {
      'zh-CN': '古木荫地',
      'zh-TW': '古木蔭地',
      'en-US': 'Elderwood Shade',
      'ja-JP': '古木の木陰',
    },
  },
  {
    id: 'giantwood-dock',
    number: '025',
    code: 'GWD',
    name: {
      'zh-CN': '巨森码头',
      'zh-TW': '巨森碼頭',
      'en-US': 'Elderwood Wharf',
      'ja-JP': '巨木の埠頭',
    },
  },
  {
    id: 'pakaya-lake-island',
    number: '026',
    code: 'PLI',
    name: {
      'zh-CN': '帕克亚湖心岛',
      'zh-TW': '帕克亞湖心島',
      'en-US': 'Parkya Lakeheart Island',
      'ja-JP': 'パクア湖の中州',
    },
  },
  {
    id: 'beast-observatory',
    number: '027',
    code: 'BOV',
    name: {
      'zh-CN': '巨兽观测点',
      'zh-TW': '巨獸觀測點',
      'en-US': 'Behemoth Observation Site',
      'ja-JP': '巨獣観測所',
    },
  },
  {
    id: 'rock-village-ruins',
    number: '028',
    code: 'RVR',
    name: {
      'zh-CN': '岩村遗址',
      'zh-TW': '岩村遺址',
      'en-US': 'Rockville Ruins',
      'ja-JP': '岩の村跡地',
    },
  },
  {
    id: 'glow-lake',
    number: '029',
    code: 'GLL',
    name: {
      'zh-CN': '荧湖',
      'zh-TW': '熒湖',
      'en-US': 'Glimmering Lake',
      'ja-JP': '蛍光湖',
    },
  },
  {
    id: 'dragon-sleep-flower-tomb',
    number: '030',
    code: 'DSF',
    name: {
      'zh-CN': '龙眠花冢',
      'zh-TW': '龍眠花冢',
      'en-US': 'Dragonrest Flowerfield',
      'ja-JP': '竜眠の花塚',
    },
  },
  {
    id: 'great-lamu-settlement',
    number: '031',
    code: 'GLS',
    name: {
      'zh-CN': '大拉姆居落',
      'zh-TW': '大拉姆聚落',
      'en-US': 'Great Lumieville',
      'ja-JP': 'ラージラム集落',
    },
  },
  {
    id: 'healing-ground',
    number: '032',
    code: 'HLG',
    name: {
      'zh-CN': '疗愈地',
      'zh-TW': '療癒地',
      'en-US': 'Healing Ground',
      'ja-JP': '癒しの地',
    },
  },
  {
    id: 'blue-pool',
    number: '033',
    code: 'BLP',
    name: {
      'zh-CN': '蓝池',
      'zh-TW': '藍池',
      'en-US': 'Blue Pools',
      'ja-JP': 'シアンプール',
    },
  },
  {
    id: 'training-hall',
    number: '034',
    code: 'TRH',
    name: {
      'zh-CN': '修习所',
      'zh-TW': '修習所',
      'en-US': 'Cultivarium',
      'ja-JP': '修練所',
    },
  },
  {
    id: 'lone-rock-beach',
    number: '035',
    code: 'LRB',
    name: {
      'zh-CN': '孤石滩',
      'zh-TW': '孤石灘',
      'en-US': 'Lonestone Shore',
      'ja-JP': 'ロックビーチ',
    },
  },
  {
    id: 'sweet-spring',
    number: '036',
    code: 'SWS',
    name: {
      'zh-CN': '甜泉',
      'zh-TW': '甜泉',
      'en-US': 'Soul Spring',
      'ja-JP': 'グリキアの泉',
    },
  },
  {
    id: 'dragon-ocarina-ruins',
    number: '037',
    code: 'DOR',
    name: {
      'zh-CN': '龙埙遗所',
      'zh-TW': '龍塤遺所',
      'en-US': 'Dragon Ruins',
      'ja-JP': '竜笛の遺跡',
    },
  },
  {
    id: 'whispering-corridor',
    number: '038',
    code: 'WSC',
    name: {
      'zh-CN': '幽息廊道',
      'zh-TW': '幽息廊道',
      'en-US': 'Hollowbreath Passage',
      'ja-JP': '幽息の歩廊',
    },
  },
  {
    id: 'snail-city',
    number: '039',
    code: 'SNC',
    name: {
      'zh-CN': '蜗牛城',
      'zh-TW': '蝸牛城',
      'en-US': 'Spira',
      'ja-JP': 'スカルゴン城',
    },
  },
  {
    id: 'kaleidoscope-realm',
    number: '040',
    code: 'KLR',
    name: {
      'zh-CN': '万相境',
      'zh-TW': '萬相境',
      'en-US': 'Wanxiang Realm',
      'ja-JP': '万相境',
    },
  },
] as const satisfies readonly RegionOption[]

/** 地区 code 联合类型，供后续按 code 查地区名或生成编号时使用。 */
export type MiralandRegionCode = (typeof MIRALAND_REGION_OPTIONS)[number]['code']
