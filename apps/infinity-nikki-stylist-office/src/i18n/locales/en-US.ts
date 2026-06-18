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
    },
    language: {
      label: 'Interface Language',
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
    flow: 'Registration → Proof Review → Official Issuance',
    primary: 'Register',
    profile: 'Open Profile',
    catalogStatus:
      'Association catalog is loaded from the local seed. Remote updates are reserved.',
  },
  registration: {
    title: 'Identity Registration · Step One',
    subtitle:
      'Fill in the stylist archive. Certificate language follows the current UI language by default and can be changed here.',
    stylistName: 'Stylist Name',
    stylistNameHint: 'Up to 14 visible characters',
    titleOption: 'Stylist Title',
    certificateLanguage: 'Certificate Language',
    avatar: 'Avatar',
    background: 'Background',
    region: 'Registration Region',
    confirm: 'Review Archive',
    previewTitle: 'Certificate Preview',
    previewDescription:
      'Template coordinates, avatar crop, and background crop will be connected in the next stage.',
  },
  proofing: {
    title: 'Pre-Issuance Proof · Step Two',
    subtitle:
      'Canvas template rendering, avatar crop, and background crop will be connected here later.',
    desktopPanel: 'Desktop edit panel',
    mobileToolbar: 'Mobile bottom toolbar',
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
  },
  assets: {
    avatarTitle: 'Custom Avatar Library',
    backgroundTitle: 'Custom Background Library',
    placeholder: 'Upload, rename, select, and delete flows will be connected later.',
  },
} as const
