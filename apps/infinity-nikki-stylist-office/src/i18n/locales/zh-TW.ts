/**
 * @fileOverview 繁体中文语言包
 * @description 当前先覆盖应用界面文案，内容型证书资料后续由资料库语言包补齐。
 * @author strawberrybear
 * @date 2026-06-18
 */

export default {
  app: {
    title: '證書簽發處',
    fullTitle: '奇蹟大陸搭配師協會總部 · 證書簽發處',
  },
  common: {
    action: {
      backHome: '返回首頁',
      continue: '繼續',
      start: '登記資料',
      openProfile: '個人中心',
      save: '保存',
      cancel: '取消',
      retry: '重試',
      view: '查看',
    },
    language: {
      label: '介面語言',
      zhCN: '简体中文',
      zhTW: '繁體中文',
      enUS: 'English',
      jaJP: '日本語',
    },
    status: {
      notReady: '待接入',
      localOnly: '本地內置',
    },
  },
  home: {
    agency: '奇蹟大陸搭配師協會總部',
    office: '證書簽發處',
    description: '受理搭配師身份登記、檔案核對及證書正本簽發',
    flow: '身份登記 → 校樣核對 → 正式簽發',
    primary: '登記資料',
    profile: '查看個人中心',
    catalogStatus: '協會資料庫已載入本地種子資料，遠端更新接口已預留。',
  },
  registration: {
    title: '身份登記 · 第一步',
    subtitle: '填寫搭配師檔案，證書語言預設跟隨目前介面語言，也可以在本頁單獨調整。',
    stylistName: '搭配師姓名',
    stylistNameHint: '最多 14 個使用者可見字元',
    titleOption: '搭配師稱號',
    certificateLanguage: '證書語言',
    avatar: '頭像',
    background: '背景',
    region: '登記地區',
    confirm: '資料確認',
    previewTitle: '證書預覽區域',
    previewDescription: '下一階段會接入模板座標、頭像取景和背景取景。',
  },
  proofing: {
    title: '簽發前校樣 · 第二步',
    subtitle: '後續階段會在這裡接入 Canvas 模板渲染、頭像取景和背景取景。',
    desktopPanel: '桌面端編輯面板',
    mobileToolbar: '移動端底部工具列',
    apply: '申請正式簽發',
  },
  signing: {
    title: '簽發儀式',
    subtitle: '簽發動畫和事務式正本生成會在模板階段接入。',
  },
  certificate: {
    title: '搭配師身份證書正本',
    subtitle: '正式證書歸檔與兩份 PNG 正本會在模板階段接入。',
  },
  profile: {
    title: '個人中心',
    subtitle: '管理正在辦理的檔案、已簽發證書、自訂資料和本地資料。',
    activeDraft: '正在辦理',
    certificates: '我的證書',
    customAssets: '自訂資料',
    localData: '本地資料',
    catalog: '協會資料庫',
    noDraft: '目前沒有正在辦理的搭配師檔案',
  },
  assets: {
    avatarTitle: '自訂頭像管理',
    backgroundTitle: '自訂背景管理',
    placeholder: '素材上傳、重新命名、選用和刪除會在下一階段接入。',
  },
} as const
