/**
 * @fileOverview 日本語言語パック
 * @description アプリ UI 文言を管理し、証明書内容は資料庫の多言語データで管理する。
 * @author strawberrybear
 * @date 2026-06-18
 */

export default {
  app: {
    title: '証書発行所',
    fullTitle: '奇跡大陸スタイリスト協会本部 · 証書発行所',
  },
  common: {
    action: {
      backHome: 'ホームへ戻る',
      continue: '続ける',
      start: '登録する',
      openProfile: '個人センター',
      save: '保存',
      cancel: 'キャンセル',
      retry: '再試行',
      view: '表示',
    },
    language: {
      label: 'UI 言語',
      zhCN: '简体中文',
      zhTW: '繁體中文',
      enUS: 'English',
      jaJP: '日本語',
    },
    status: {
      notReady: '未接続',
      localOnly: 'ローカル内蔵',
    },
  },
  home: {
    agency: '奇跡大陸スタイリスト協会本部',
    office: '証書発行所',
    description: 'スタイリスト身分登録、資料確認、正式証書の発行を受け付けます。',
    flow: '身分登録 → 校正確認 → 正式発行',
    primary: '登録する',
    profile: '個人センターを見る',
    catalogStatus: '協会資料庫はローカル seed から読み込み済みです。遠隔更新口は予約済みです。',
  },
  registration: {
    title: '身分登録 · 第一步',
    subtitle:
      'スタイリスト資料を入力します。証書言語は現在の UI 言語に初期設定され、このページで個別に変更できます。',
    stylistName: 'スタイリスト名',
    stylistNameHint: '最大 14 文字',
    titleOption: 'スタイリスト称号',
    certificateLanguage: '証書言語',
    avatar: 'アバター',
    background: '背景',
    region: '登録地域',
    confirm: '資料確認',
    previewTitle: '証書プレビュー',
    previewDescription: '次段階でテンプレート座標、アバター切り抜き、背景切り抜きを接続します。',
  },
  proofing: {
    title: '発行前校正 · 第二步',
    subtitle: '後続段階で Canvas テンプレート描画、アバターと背景の調整を接続します。',
    desktopPanel: 'デスクトップ編集パネル',
    mobileToolbar: 'モバイル下部ツールバー',
    apply: '正式発行を申請',
  },
  signing: {
    title: '発行式',
    subtitle: '発行アニメーションと PNG 生成トランザクションはテンプレート段階で接続します。',
  },
  certificate: {
    title: 'スタイリスト身分証書正本',
    subtitle: '正式証書の保存と 2 種類の PNG 正本はテンプレート段階で接続します。',
  },
  profile: {
    title: '個人センター',
    subtitle: '進行中の資料、発行済み証書、カスタム素材、ローカルデータを管理します。',
    activeDraft: '進行中',
    certificates: '私の証書',
    customAssets: 'カスタム資料',
    localData: 'ローカルデータ',
    catalog: '協会資料庫',
    noDraft: '現在進行中のスタイリスト資料はありません',
  },
  assets: {
    avatarTitle: 'カスタムアバター管理',
    backgroundTitle: 'カスタム背景管理',
    placeholder: '素材アップロード、名前変更、選択、削除は次段階で接続します。',
  },
} as const
