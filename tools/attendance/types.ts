import type { LanguageCode, ProfileCopy, SiteData } from "../../src/types.ts";

export type TranslatedProfileText = Pick<ProfileCopy, "title" | "tags" | "summary">;
export type TranslatableLanguage = Exclude<LanguageCode, "zh-Hant">;
export type ProfileTranslations = Record<LanguageCode, Record<string, TranslatedProfileText>>;

export type RefreshResult = {
  jstDate: string;
  generatedAt: string;
  siteData: SiteData;
  imageMap: Record<string, string>;
  profileTranslations: ProfileTranslations;
  stats: {
    todayProfiles: number;
    preservedProfiles: number;
    totalProfiles: number;
    images: number;
    localImages: number;
  };
};
