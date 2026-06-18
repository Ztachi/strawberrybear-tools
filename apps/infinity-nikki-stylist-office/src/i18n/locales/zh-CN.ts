/**
 * @fileOverview 简体中文语言包
 * @description 存放应用界面所有用户可见文案，证书内容型文案由资料库单独维护。
 * @author strawberrybear
 * @date 2026-06-18
 */

export default {
  app: {
    title: '证书签发处',
    fullTitle: '奇迹大陆搭配师协会总部 · 证书签发处',
  },
  common: {
    action: {
      backHome: '返回首页',
      continue: '继续',
      start: '登记资料',
      openProfile: '个人中心',
      save: '保存',
      cancel: '取消',
      retry: '重试',
      view: '查看',
    },
    language: {
      label: '界面语言',
      zhCN: '简体中文',
      zhTW: '繁體中文',
      enUS: 'English',
      jaJP: '日本語',
    },
    status: {
      notReady: '待接入',
      localOnly: '本地内置',
    },
  },
  home: {
    agency: '奇迹大陆搭配师协会总部',
    office: '证书签发处',
    description: '受理搭配师身份登记、档案核对及证书正本签发',
    flow: '身份登记 → 校样核对 → 正式签发',
    primary: '登记资料',
    profile: '查看个人中心',
    catalogStatus: '协会资料库已载入本地种子数据，远程更新接口已预留。',
  },
  registration: {
    title: '身份登记 · 第一步',
    subtitle: '填写搭配师档案，证书语言默认跟随当前界面语言，也可以在本页单独调整。',
    stylistName: '搭配师姓名',
    stylistNameHint: '最多 14 个用户可见字符',
    titleOption: '搭配师称号',
    certificateLanguage: '证书语言',
    avatar: '头像',
    background: '背景',
    region: '登记地区',
    confirm: '资料确认',
    previewTitle: '证书预览区域',
    previewDescription: '下一阶段会接入模板坐标、头像取景和背景取景。',
  },
  proofing: {
    title: '签发前校样 · 第二步',
    subtitle: '后续阶段会在这里接入 Canvas 模板渲染、头像取景和背景取景。',
    desktopPanel: '桌面端编辑面板',
    mobileToolbar: '移动端底部工具栏',
    apply: '申请正式签发',
  },
  signing: {
    title: '签发仪式',
    subtitle: '签发动画和事务式正本生成会在模板阶段接入。',
  },
  certificate: {
    title: '搭配师身份证书正本',
    subtitle: '正式证书归档与两份 PNG 正本会在模板阶段接入。',
  },
  profile: {
    title: '个人中心',
    subtitle: '管理正在办理的档案、已签发证书、自定义资料和本地数据。',
    activeDraft: '正在办理',
    certificates: '我的证书',
    customAssets: '自定义资料',
    localData: '本地数据',
    catalog: '协会资料库',
    noDraft: '当前没有正在办理的搭配师档案',
  },
  assets: {
    avatarTitle: '自定义头像管理',
    backgroundTitle: '自定义背景管理',
    placeholder: '素材上传、重命名、选用和删除会在下一阶段接入。',
  },
} as const
