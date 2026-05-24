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
  wechat: string;
  area: string;
  hours: string;
};

export type Profile = {
  id: string;
  name: string;
  title: string;
  date: string;
  image: string;
  gallery: string[];
  origin: string;
  age: string;
  height: string;
  weight: string;
  cup: string;
  tags: string[];
  price: string;
  summary: string;
  isToday?: boolean;
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
  contact: Contact;
  heroImages: string[];
  profiles: Profile[];
  pricePlans: PricePlan[];
  hotels: Hotel[];
};

export type ProfileCopy = Pick<Profile, "title" | "origin" | "tags" | "price" | "summary">;

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
  | "photos"
  | "search"
  | "searchPlaceholder"
  | "filterAria"
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
  contact: Record<"area" | "wechat" | "hours" | "lineOne" | "lineTwo", string>;
  ageGate: Record<"kicker" | "title" | "copy", string>;
  footer: Record<"title" | "copy" | "privacy" | "disclaimer", string>;
  profiles: Record<string, ProfileCopy>;
  pricePlans: PricePlan[];
  nav: Array<[string, string]>;
  hotelArea: string;
};
