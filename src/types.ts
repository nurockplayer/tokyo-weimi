export type LanguageCode = "zh-Hant" | "zh-Hans" | "ja" | "ko" | "en";

export type FilterKey = "all" | "japanese" | "china" | "newcomer" | "recommended" | "premium" | "room";

export type LanguageOption = {
  code: LanguageCode;
  label: string;
  shortLabel: string;
  htmlLang: string;
  locale: string;
};

export type Contact = {
  phone: string;
  line: string;
  secondaryLine: string;
  lineQr: string;
  secondaryLineQr: string;
  area: string;
  hours: string;
};

export type Shop = {
  id: string;
  name: string;
  shortName: string;
  sourceUrl: string;
  contact: Contact;
};

export type Profile = {
  id: string;
  shopId: string;
  name: string;
  title: string;
  date: string;
  image: string;
  gallery: string[];
  supportScreenshots?: string[];
  supplementalMedia?: string[];
  origin: string;
  age: string;
  height: string;
  weight: string;
  cup: string;
  tags: string[];
  price: string;
  summary: string;
  videos?: string[];
  isToday?: boolean;
  lastSeen?: string;
};

export type Hotel = {
  area: string;
  address: string;
  image: string;
};

export type PricePlan = {
  name: string;
  note: string;
  rows: string[];
};

export type SiteData = {
  shops: Shop[];
  contact: Contact;
  heroImages: string[];
  profiles: Profile[];
  pricePlans: PricePlan[];
  hotels: Hotel[];
};

export type ProfileCopy = Pick<Profile, "title" | "origin" | "tags" | "price" | "summary">;

// === Content Contract Types (Content migration #78) ===

/** Translation text for a single profile — mirrors the shape used in i18n.ts. */
export type TranslatedProfileText = Pick<ProfileCopy, "title" | "tags" | "summary">;

/** Mapping from language code to profile-id-keyed translations. */
export type ProfileTranslations = Record<LanguageCode, Record<string, TranslatedProfileText>>;

/** A self-contained snapshot of all content needed to render the site. */
export type ContentSnapshotV1 = {
  schemaVersion: 1;
  version: string;
  generatedAt: string;
  data: SiteData;
  imageMap: Record<string, string>;
  profileTranslations: ProfileTranslations;
};

/** A lightweight manifest describing a snapshot file for integrity checks. */
export type ContentManifestV1 = {
  schemaVersion: 1;
  version: string;
  generatedAt: string;
  snapshotPath: string;
  sha256: string;
};

type SectionKey =
  | "todayKicker"
  | "todayTitle"
  | "todayCopy"
  | "featuredKicker"
  | "featuredTitle"
  | "featuredCopy"
  | "priceKicker"
  | "priceTitle"
  | "priceCopy"
  | "hotelsKicker"
  | "hotelsTitle"
  | "hotelsCopy"
  | "contactKicker"
  | "contactTitle"
  | "contactCopy"
  | "exchangeKicker"
  | "exchangeTitle"
  | "exchangeCopy";

type LabelKey =
  | "updated"
  | "lastActive"
  | "photos"
  | "search"
  | "searchPlaceholder"
  | "filterAria"
  | "shop"
  | "allShops"
  | "empty"
  | "age"
  | "height"
  | "weight"
  | "cup"
  | "close"
  | "hometown"
  | "serviceArea"
  | "updateFrequency"
  | "lineGallery"
  | "supportScreenshots"
  | "supplementalMedia"
  | "viewPhoto"
  | "photoOrdinalSuffix"
  | "hotelAlt"
  | "qrAltMain"
  | "qrAltSecond";

export type Dictionary = {
  meta: Record<"title" | "description", string>;
  brand: string;
  navAria: string;
  homeAria: string;
  languageAria: string;
  hero: Record<"label" | "eyebrow" | "title" | "copy" | "statusAria" | "daily" | "phonePrefix", string>;
  intro: Record<"kicker" | "title" | "copy", string>;
  sections: Record<SectionKey, string>;
  actions: Record<"viewToday" | "call" | "viewInfo" | "openLine" | "confirmAge" | "leave", string>;
  labels: Record<LabelKey, string>;
  filters: Record<FilterKey, string>;
  contact: Record<"area" | "hours" | "lineOne" | "lineTwo", string>;
  ageGate: Record<"kicker" | "title" | "copy", string>;
  footer: Record<"title" | "copy" | "privacy" | "disclaimer", string>;
  profiles: Record<string, ProfileCopy>;
  pricePlans: PricePlan[];
  nav: Array<[string, string]>;
  hotelArea: string;
};

// === Bridge Refactor Types ===

// Public-facing shop (no sourceUrl — D-05)
export type PublicShop = Omit<Shop, "sourceUrl">;

// Synchronous data provider interface (D-04)
export interface DataProvider {
  getShops(): readonly PublicShop[];
  getProfiles(): readonly Profile[];
  getHotels(): readonly Hotel[];
  getHeroImages(): readonly string[];
  getDefaultContact(): Contact;
  getShop(id: string): PublicShop | undefined;
  getProfile(id: string): Profile | undefined;
}

// i18n configuration interface (D-06)
export interface I18nConfig<L extends string = LanguageCode> {
  defaultLanguage: L;
  languageOptions: readonly LanguageOption[];
  routes: Record<L, string>;
  dictionaries: Record<L, Dictionary>;
}

// Filter configuration (D-15)
export type FilterConfig<K extends string = FilterKey> = {
  defaultKey: K;
  keys: readonly K[];
  rules: Partial<Record<K, (profile: Profile) => boolean>>;
};

// Render context — passed to every render function (D-03, D-09)
export interface RenderContext {
  copy: Dictionary;
  language: LanguageCode;
  languageOption: LanguageOption;
  imageSrc: (id: string) => string;
  videoSrc: (url: string) => string;
  data: DataProvider;
  activeFilter: FilterKey;
  activeShopId: string;
  query: string;
}

// Application configuration (D-18)
export interface YorustarConfig {
  storagePrefix: string;
}

// Media resolver interfaces (D-13)
export type VideoSrcResolver = (videoUrl: string) => string;
