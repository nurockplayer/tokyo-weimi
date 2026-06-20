import { readFileSync } from "node:fs";
import path from "node:path";

import type { LanguageCode, ProfileCopy, SiteData } from "../src/types.ts";

const rootDir = new URL("..", import.meta.url).pathname;
const contentDir = path.join(rootDir, "src", "content");

type TranslatedProfileText = Pick<ProfileCopy, "title" | "tags" | "summary">;
type TranslatableLanguage = Exclude<LanguageCode, "zh-Hant">;
type ProfileTranslations = Record<LanguageCode, Record<string, TranslatedProfileText>>;
type TranslationItem = {
  id: string;
  translations?: Partial<Record<TranslatableLanguage, Partial<TranslatedProfileText>>>;
};
type TranslationResponse = {
  profiles?: TranslationItem[];
};

const translatableLanguages = ["zh-Hans", "ja", "ko", "en"] as const satisfies readonly TranslatableLanguage[];

const loadExistingTranslations = (): ProfileTranslations => {
  const raw = readFileSync(path.join(contentDir, "profile-translations.json"), "utf8");
  return JSON.parse(raw) as ProfileTranslations;
};

const loadSiteData = (): SiteData => {
  const raw = readFileSync(path.join(contentDir, "site-data.json"), "utf8");
  return JSON.parse(raw) as SiteData;
};

const buildTranslationPrompt = (profiles: Array<{ id: string; name: string; title: string; origin: string; tags: string[]; summary: string }>): string => `Translate these reservation profile summaries.

Rules:
- Return strict JSON only with this shape: {"profiles":[{"id":"...","translations":{"zh-Hans":{"title":"...","tags":["..."],"summary":"..."},"ja":{"title":"...","tags":["..."],"summary":"..."},"ko":{"title":"...","tags":["..."],"summary":"..."},"en":{"title":"...","tags":["..."],"summary":"..."}}}]}.
- Keep each id unchanged.
- Keep profile names unchanged when they appear.
- Keep the tone polished and concise. Do not add claims that are not in the source.
- Translate only title, tags, and summary. Do not include price, age, height, weight, or cup.
- Use natural Simplified Chinese, Japanese, Korean, and English.

Profiles:
${JSON.stringify(
  profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    title: profile.title,
    origin: profile.origin,
    tags: profile.tags,
    summary: profile.summary,
  })),
  null,
  2,
)}`;

const translateWithGemini = async (
  profiles: Array<{ id: string; name: string; title: string; origin: string; tags: string[]; summary: string }>,
  apiKey: string,
  model: string,
): Promise<TranslationResponse | null> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "You translate adult reservation profile copy and return valid JSON only." }],
      },
      contents: [{ parts: [{ text: buildTranslationPrompt(profiles) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response");

  return JSON.parse(text) as TranslationResponse;
};

const validTranslatedProfileText = (value: Partial<TranslatedProfileText> | undefined): TranslatedProfileText | null => {
  if (!value || typeof value.title !== "string" || typeof value.summary !== "string" || !Array.isArray(value.tags)) {
    return null;
  }
  const tags = value.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).slice(0, 3);
  if (!value.title.trim() || !value.summary.trim() || !tags.length) return null;
  return {
    title: value.title.trim(),
    tags,
    summary: value.summary.trim(),
  };
};

const printComparison = (
  profileId: string,
  profileName: string,
  language: string,
  deepseek: TranslatedProfileText | undefined,
  gemini: TranslatedProfileText | undefined,
) => {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${profileName} (${profileId}) — ${language}`);
  console.log(`${"=".repeat(70)}`);

  if (deepseek) {
    console.log(`\n  [DeepSeek]`);
    console.log(`    title:   ${deepseek.title}`);
    console.log(`    tags:    ${deepseek.tags.join(", ")}`);
    console.log(`    summary: ${deepseek.summary}`);
  } else {
    console.log(`\n  [DeepSeek] (無現有翻譯)`);
  }

  if (gemini) {
    console.log(`\n  [Gemini]`);
    console.log(`    title:   ${gemini.title}`);
    console.log(`    tags:    ${gemini.tags.join(", ")}`);
    console.log(`    summary: ${gemini.summary}`);
  } else {
    console.log(`\n  [Gemini] (翻譯失敗或未產出)`);
  }
};

const main = async (): Promise<void> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("請設定 GEMINI_API_KEY 環境變數");
    process.exit(1);
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  const siteData = loadSiteData();
  const existingTranslations = loadExistingTranslations();

  // 挑選 3-5 個 profile：優先選每個語言都缺翻譯的（新鮮案例），
  // 但也選幾個已有 DeepSeek 翻譯的（用來對比品質）
  const profilesNeedingTranslation: typeof siteData.profiles = [];
  const profilesWithExisting: typeof siteData.profiles = [];

  for (const profile of siteData.profiles) {
    const hasAll = translatableLanguages.every((lang) => existingTranslations[lang][profile.id]);
    if (!hasAll && profilesNeedingTranslation.length < 3) {
      profilesNeedingTranslation.push(profile);
    } else if (hasAll && profilesWithExisting.length < 2) {
      profilesWithExisting.push(profile);
    }
    if (profilesNeedingTranslation.length >= 3 && profilesWithExisting.length >= 2) break;
  }

  const testProfiles = [...profilesNeedingTranslation, ...profilesWithExisting];
  if (testProfiles.length === 0) {
    console.log("所有 profile 都已有完整翻譯，沒有可測試的案例。");
    return;
  }

  console.log(`使用模型: ${model}`);
  console.log(`測試 ${testProfiles.length} 個 profiles:`);
  for (const p of testProfiles) {
    const missing = translatableLanguages.filter((l) => !existingTranslations[l][p.id]);
    console.log(`  - ${p.name} (${p.id})${missing.length ? ` — 缺: ${missing.join(", ")}` : " — 已有全部翻譯 (對比模式)"}`);
  }

  console.log(`\n呼叫 Gemini API...`);

  let geminiResult: TranslationResponse | null = null;
  try {
    geminiResult = await translateWithGemini(testProfiles, apiKey, model);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Gemini 呼叫失敗: ${message}`);
    process.exit(1);
  }

  if (!geminiResult?.profiles?.length) {
    console.error("Gemini 沒有回傳任何翻譯結果。");
    process.exit(1);
  }

  // 建立 Gemini 翻譯查找表
  const geminiMap = new Map<string, Partial<Record<TranslatableLanguage, TranslatedProfileText>>>();
  for (const item of geminiResult.profiles) {
    if (!item.id || !item.translations) continue;
    const texts: Partial<Record<TranslatableLanguage, TranslatedProfileText>> = {};
    for (const language of translatableLanguages) {
      const text = validTranslatedProfileText(item.translations[language]);
      if (text) texts[language] = text;
    }
    if (Object.keys(texts).length) geminiMap.set(item.id, texts);
  }

  // 輸出對照
  for (const profile of testProfiles) {
    const geminiTexts = geminiMap.get(profile.id) || {};
    for (const language of translatableLanguages) {
      const deepseekText = existingTranslations[language][profile.id];
      const geminiText = geminiTexts[language];
      // 只印出有意義的對照：兩者至少有一個存在
      if (deepseekText || geminiText) {
        printComparison(profile.id, profile.name, language, deepseekText, geminiText);
      }
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("  翻譯對照完成");
  console.log(`${"=".repeat(70)}\n`);
};

main();
