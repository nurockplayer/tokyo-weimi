import type { Dictionary, I18nConfig, LanguageCode, LanguageOption } from "./types.ts";

export function createI18n<L extends LanguageCode = LanguageCode>(config: I18nConfig<L>) {
  const { defaultLanguage, languageOptions, dictionaries, routes } = config;

  const getLanguageOption = (code: L): LanguageOption =>
    languageOptions.find((option) => option.code === code) || languageOptions[0]!;

  const getCopy = (code: L): Dictionary =>
    dictionaries[code] || dictionaries[defaultLanguage];

  return {
    defaultLanguage,
    languageOptions,
    routes,
    dictionaries,
    getLanguageOption,
    getCopy,
  };
}
