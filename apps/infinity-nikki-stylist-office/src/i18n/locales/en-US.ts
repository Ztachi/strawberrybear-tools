/**
 * @fileOverview English locale messages
 * @description Stores user-facing interface copy; certificate content is maintained by the catalog.
 * @author strawberrybear
 * @date 2026-06-18
 */

export default {
  app: {
    title: 'Certificate Office',
    fullTitle: 'Miracle Continent Stylist Association · Certificate Office',
  },
  common: {
    action: {
      backHome: 'Back Home',
      continue: 'Continue',
      start: 'Register',
      openProfile: 'Profile',
      save: 'Save',
      cancel: 'Cancel',
      retry: 'Retry',
      view: 'View',
      confirm: 'Confirm',
      reset: 'Reset',
      home: 'Office Home',
      currentDraft: 'Continue Draft',
    },
    language: {
      label: 'Language',
      zhCN: '简体中文',
      zhTW: '繁體中文',
      enUS: 'English',
      jaJP: '日本語',
    },
    status: {
      notReady: 'Pending',
      localOnly: 'Local seed',
    },
  },
  home: {
    agency: 'Miracle Continent Stylist Association',
    office: 'Certificate Office',
    description: 'Handles stylist identity registration, archive review, and certificate issuance.',
    kicker: 'MIRACLE CONTINENT STYLIST ASSOCIATION',
    intro:
      'Submit your stylist archive, complete the association review, and receive an official Miracle Continent identity certificate.',
    flowLabel: 'Issuance Flow',
    stepRegister: 'Identity Registration',
    stepReview: 'Archive Review',
    stepIssue: 'Official Issuance',
    primary: 'Register',
    assurance:
      'Every archive receives a proof for review before the association proceeds to official issuance.',
    demoAlt: 'Example of an issued stylist identity certificate',
    demoCaption: 'Official certificate sample · Final content follows issuance',
    serviceLabel: 'Certificate Services',
    serviceRegisterTitle: 'Register Identity',
    serviceRegisterText:
      'Enter your stylist name, certified title, and certificate language to create an archive.',
    serviceReviewTitle: 'Review Proof',
    serviceReviewText:
      'Confirm avatar, background, region, and association comment while edits are still available.',
    serviceIssueTitle: 'Receive Original',
    serviceIssueText:
      'After issuance, the certificate is archived with originals ready to save and share.',
  },
  registration: {
    title: 'Identity Registration · Step One',
    subtitle:
      'Fill in the stylist archive. The top language switch updates both interface and certificate template copy.',
    loading: 'Loading the active archive',
    draftMissing: 'No active stylist archive. Please start registration from the home page.',
    stylistName: 'Stylist Name',
    stylistNameHint: 'Up to 14 visible characters',
    titleOption: 'Stylist Title',
    avatar: 'Avatar',
    background: 'Background',
    region: 'Registration Region',
    comment: 'Association Comment',
    president: 'President Seal',
    certificateNoPrefix: 'Certificate Number Prefix',
    selectedAsset: 'Selected',
    avatarPickerTitle: 'Choose Avatar',
    backgroundPickerTitle: 'Choose Background',
    assetPickerIntro: 'Choose the asset for this certificate. Custom asset management is reserved.',
    officialAvatarGroup: 'Association Avatars',
    officialBackgroundGroup: 'Association Backgrounds',
    officialAsset: 'Association Built-in',
    customAssetGroup: 'Custom Assets',
    noCustomAssets: 'No custom assets yet',
    randomAsset: 'Random Pick',
    manageCustomAvatar: 'Manage Custom Avatars',
    manageCustomBackground: 'Manage Custom Backgrounds',
    confirm: 'Review Archive',
    confirmTitle: 'Review Archive',
    confirmIntro:
      'Review this archive before creating the proof. You can still adjust the archive and layout in the proofing step.',
    returnEdit: 'Back to Edit',
    buildProof: 'Create Proof',
    chooseTitle: 'Choose a stylist title',
    previewTitle: 'Certificate Preview',
    previewDescription:
      'This preview uses a temporary base image. Final template details will be refined later.',
  },
  proofing: {
    title: 'Pre-Issuance Proof · Step Two',
    subtitle:
      'Review the proof on the temporary base image. The top language switch updates template text immediately while user-entered names stay unchanged.',
    desktopPanel: 'Desktop edit panel',
    mobileToolbar: 'Mobile bottom toolbar',
    previewTitle: 'Pre-Issuance Proof',
    fieldEditor: 'Archive Content',
    templatePosition: 'Template Position',
    positionTarget: 'Target',
    positionX: 'Horizontal Position',
    positionY: 'Vertical Position',
    resetPosition: 'Reset target position',
    backRegistration: 'Back to Registration',
    saveHint: 'Adjustments are saved to the active draft immediately.',
    apply: 'Request Official Issuance',
  },
  signing: {
    title: 'Issuance Ceremony',
    subtitle: 'The ceremony animation and transactional PNG generation will be connected later.',
  },
  certificate: {
    title: 'Official Stylist Identity Certificate',
    subtitle: 'Certificate archive and two PNG originals will be connected in the template stage.',
  },
  profile: {
    title: 'Profile',
    subtitle: 'Manage active drafts, issued certificates, custom assets, and local data.',
    activeDraft: 'Active Draft',
    certificates: 'My Certificates',
    customAssets: 'Custom Assets',
    localData: 'Local Data',
    catalog: 'Association Catalog',
    noDraft: 'No active stylist archive.',
    catalogEyebrow: 'ASSOCIATION CATALOG',
    catalogTitle: 'Association Catalog Overview',
    catalogDescription:
      'This area summarizes the base association catalog. Future remote updates, import/export, and catalog maintenance belong here.',
    catalogVersion: 'Catalog Version',
    titleCount: 'Title Count',
    templateCount: 'Template Count',
  },
  assets: {
    avatarTitle: 'Custom Avatar Library',
    backgroundTitle: 'Custom Background Library',
    placeholder: 'Upload, rename, select, and delete flows will be connected later.',
    backToDraft: 'Back to Draft',
    backToHome: 'Office Home',
    emptyAvatarTitle: 'No custom avatars yet',
    emptyBackgroundTitle: 'No custom backgrounds yet',
    emptyDescription: 'Upload, crop, rename, and selection flows will be connected here later.',
  },
} as const
