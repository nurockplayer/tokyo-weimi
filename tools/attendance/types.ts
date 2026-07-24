import type { LanguageCode, Profile, ProfileTranslations, SiteData, TranslatedProfileText } from "../../src/types.ts";

export type SourceProfile = {
  shopId: string;
  wpId: string;
  name?: string;
  title: string;
  link: string;
  updatedAt: string;
  home: string;
  age: string;
  height: string;
  weight: string;
  cup: string;
  brief: string;
  images: string[];
  videos: string[];
};

export type TranslatableLanguage = Exclude<LanguageCode, "zh-Hant">;

export type TranslationItem = {
  id: string;
  translations?: Partial<Record<TranslatableLanguage, Partial<TranslatedProfileText>>>;
};

export type TranslationResponse = {
  profiles?: TranslationItem[];
};

export type DeepSeekChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export type RefreshResult = {
  profiles: Profile[];
  siteData: SiteData;
  imageMap: Record<string, string>;
  profileTranslations: ProfileTranslations;
  localImageMap: Record<string, string>;
  jstDate: string;
};
