import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { LanguageCode, Profile, ProfileCopy, SiteData } from "../src/types.ts";

const rootDir = new URL("..", import.meta.url).pathname;
const contentDir = path.join(rootDir, "src", "content");
const baseUrl = "https://tokyo-weimi.com";
const recentWindowDays = 120;
const requestTimeoutMs = 20_000;
const requestHeaders = {
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "zh-TW,zh;q=0.9,ja;q=0.8,en-US;q=0.7,en;q=0.6",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "sec-ch-ua": '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "upgrade-insecure-requests": "1",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
} satisfies HeadersInit;

type SourceProfile = {
  wpId: string;
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

type ImageDimensions = {
  width: number;
  height: number;
};

type TranslatedProfileText = Pick<ProfileCopy, "title" | "tags" | "summary">;
type TranslatableLanguage = Exclude<LanguageCode, "zh-Hant">;
type ProfileTranslations = Record<LanguageCode, Record<string, TranslatedProfileText>>;
type GeminiTranslationItem = {
  id: string;
  translations?: Partial<Record<TranslatableLanguage, Partial<TranslatedProfileText>>>;
};
type GeminiTranslationResponse = {
  profiles?: GeminiTranslationItem[];
};
type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const translatableLanguages = ["zh-Hans", "ja", "ko", "en"] as const satisfies readonly TranslatableLanguage[];
const emptyProfileTranslations = (): ProfileTranslations => ({
  "zh-Hant": {},
  "zh-Hans": {},
  ja: {},
  ko: {},
  en: {},
});

const knownNameIds: Record<string, string> = {
  柚菜: "yuna",
  舞香: "maika",
  乃亞: "noa",
  乃亚: "noa",
  百合香: "yurika",
  優繪: "yue",
  优绘: "yue",
  梨亞: "ria",
  梨亚: "ria",
  七海: "nanami",
  麗奈: "reina",
  丽奈: "reina",
  溫妮: "winnie",
  温妮: "winnie",
  結奈: "yuina",
  结奈: "yuina",
  向日葵: "himawari",
  優希: "yuki",
  优希: "yuki",
  希: "nozomi",
  楓: "kaede",
  枫: "kaede",
  可可: "koko",
};

const textReplacements: Array<[RegExp, string]> = [
  [/东京/g, "東京"],
  [/中国/g, "中國"],
  [/日本人/g, "日本人"],
  [/推荐/g, "推薦"],
  [/人气/g, "人氣"],
  [/极品/g, "極品"],
  [/皮肤/g, "皮膚"],
  [/干净/g, "乾淨"],
  [/年轻/g, "年輕"],
  [/类型/g, "類型"],
  [/颜值/g, "顏值"],
  [/开发/g, "開發"],
  [/喜欢/g, "喜歡"],
  [/快来/g, "快來"],
  [/长相/g, "長相"],
  [/紧致/g, "緊緻"],
  [/精致/g, "精緻"],
  [/岁/g, "歲"],
  [/温柔/g, "溫柔"],
  [/女优/g, "女優"],
  [/分钟/g, "分鐘"],
  [/信息/g, "資訊"],
  [/档期/g, "檔期"],
  [/价格/g, "價格"],
  [/电话/g, "電話"],
  [/回复/g, "回覆"],
  [/服务/g, "服務"],
  [/评价/g, "評價"],
  [/开始/g, "開始"],
  [/预约/g, "預約"],
  [/出勤/g, "出勤"],
  [/房间/g, "房間"],
  [/免费/g, "免費"],
  [/优/g, "優"],
  [/亚/g, "亞"],
  [/绘/g, "繪"],
  [/丽/g, "麗"],
  [/长/g, "長"],
  [/紧/g, "緊"],
  [/温/g, "溫"],
  [/结/g, "結"],
  [/枫/g, "楓"],
  [/樱/g, "櫻"],
  [/体/g, "體"],
];

const blacklist = [
  "海选",
  "海選",
  "回归",
  "回歸",
  "私聊",
  "招募",
  "业务员",
  "业务員",
  "業務員",
  "店长",
  "店長",
  "避孕药",
  "避孕藥",
  "出售",
  "AV女优",
  "AV女優",
];

const supportScreenshotImageIds = new Set([
  "2026-03-img-5871",
  "2026-05-img-5997",
  "2025-09-img-5071",
  "2023-08-img-9481",
  "2026-05-img-6050",
  "2026-04-img-5916",
  "2026-04-img-5873",
]);

const profilePhotoImageIds = new Set([
  "2025-10-img-5293",
  "2025-12-img-5779-2",
]);

const decodeEntities = (value = ""): string =>
  value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const toTraditional = (value = ""): string =>
  textReplacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);

const stripHtml = (html = ""): string =>
  decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6]|span)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim(),
  );

const cleanText = (value = ""): string =>
  toTraditional(stripHtml(value))
    .replace(/[！!。]+/g, "。")
    .replace(/\s+/g, " ")
    .trim();

const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(rootDir, file), "utf8")) as T;

const writeJson = async (file: string, value: unknown): Promise<void> => {
  await writeFile(path.join(rootDir, file), `${JSON.stringify(value, null, 2)}\n`);
};

const readProfileTranslations = (): ProfileTranslations => {
  const file = path.join(rootDir, "src/content/profile-translations.json");
  if (!existsSync(file)) return emptyProfileTranslations();
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ProfileTranslations>;
  return {
    ...emptyProfileTranslations(),
    ...parsed,
  };
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const fetchFromSource = async (url: string, init: RequestInit = {}, retries = 2): Promise<Response> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...requestHeaders,
          ...(init.headers || {}),
        },
        redirect: "follow",
        signal: controller.signal,
      });
      if (response.ok || (response.status < 500 && response.status !== 403 && response.status !== 429)) return response;
      lastError = new Error(`${url} failed with HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < retries) await wait(1_000 * (attempt + 1));
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(`${url} failed`);
};

const dimensionsFromJpeg = (buffer: Buffer): ImageDimensions | null => {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let index = 2;
  while (index < buffer.length - 9) {
    if (buffer[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = buffer[index + 1] ?? 0;
    const length = buffer.readUInt16BE(index + 2);
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return {
        width: buffer.readUInt16BE(index + 7),
        height: buffer.readUInt16BE(index + 5),
      };
    }
    index += 2 + length;
  }
  return null;
};

const dimensionsFromPng = (buffer: Buffer): ImageDimensions | null => {
  if (buffer.toString("ascii", 1, 4) !== "PNG" || buffer.length < 24) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const imageDimensionsCache = new Map<string, ImageDimensions | null>();

const fetchImageDimensions = async (url: string): Promise<ImageDimensions | null> => {
  if (imageDimensionsCache.has(url)) return imageDimensionsCache.get(url) || null;
  try {
    const response = await fetchFromSource(url, {}, 1);
    if (!response.ok) throw new Error(`${url} failed with HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const dimensions = dimensionsFromJpeg(buffer) || dimensionsFromPng(buffer);
    imageDimensionsCache.set(url, dimensions);
    return dimensions;
  } catch {
    imageDimensionsCache.set(url, null);
    return null;
  }
};

const isLikelySupportScreenshot = async (imageId: string, url: string): Promise<boolean> => {
  if (supportScreenshotImageIds.has(imageId)) return true;
  if (profilePhotoImageIds.has(imageId)) return false;
  const dimensions = await fetchImageDimensions(url);
  if (!dimensions) return false;
  const landscapeRatio = dimensions.width / dimensions.height;
  return dimensions.width > dimensions.height && landscapeRatio >= 1.15 && dimensions.height <= 1_000;
};

const fetchTextWithBrowser = async (url: string): Promise<string> => {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      extraHTTPHeaders: {
        "accept-language": requestHeaders["accept-language"],
        "cache-control": "no-cache",
        "pragma": "no-cache",
      },
      userAgent: requestHeaders["user-agent"],
    });
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: requestTimeoutMs,
    });
    const status = response?.status() || 0;
    if (!response || status >= 400) throw new Error(`${url} browser fallback failed with HTTP ${status}`);
    return page.content();
  } finally {
    await browser.close();
  }
};

const fetchText = async (url: string): Promise<string> => {
  try {
    const response = await fetchFromSource(url);
    if (!response.ok) throw new Error(`${url} failed with HTTP ${response.status}`);
    return response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("HTTP 403") || message.includes("HTTP 429")) return fetchTextWithBrowser(url);
    throw error;
  }
};

const absolutize = (url: string | undefined): string => {
  if (!url || url.startsWith("data:")) return "";
  try {
    const parsed = new URL(decodeEntities(url), baseUrl);
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return "";
  }
};

const canonicalImageUrl = (url: string): string => {
  const parsed = new URL(url);
  parsed.pathname = parsed.pathname
    .replace(/-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp|gif)$)/i, "")
    .replace(/-scaled(?=\.(?:jpe?g|png|webp|gif)$)/i, "");
  return parsed.href;
};

const imageUrlsFromHtml = (html = ""): string[] => {
  const urls = new Set<string>();
  const add = (value: string | undefined) => {
    const url = absolutize(value);
    if (!url.includes("/wp-content/uploads/")) return;
    if (!/\.(jpe?g|png|webp|gif)$/i.test(new URL(url).pathname)) return;
    urls.add(canonicalImageUrl(url));
  };

  for (const match of html.matchAll(/<(?:img|source)\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)) {
    add(match[1]);
  }
  for (const match of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
    const srcset = match[1] || "";
    for (const candidate of srcset.split(",")) {
      add(candidate.trim().split(/\s+/)[0]);
    }
  }
  return [...urls];
};

const videoUrlsFromHtml = (html = ""): string[] => {
  const urls = new Set<string>();
  const add = (value: string | undefined) => {
    const url = absolutize(value);
    if (!url.includes("/wp-content/uploads/")) return;
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    if (!/\.(mp4|mov|webm)$/i.test(parsed.pathname)) return;
    urls.add(parsed.href);
  };

  for (const match of html.matchAll(/<(?:video|source)\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)) {
    add(match[1]);
  }
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+\.(?:mp4|mov|webm)(?:\?[^"']*)?)["'][^>]*>/gi)) {
    add(match[1]);
  }
  for (const match of html.matchAll(/https?:[^"'\s<>]+\.(?:mp4|mov|webm)(?:\?[^"'\s<>]*)?/gi)) {
    add(match[0]);
  }
  return [...urls];
};

const fieldFromArticle = (article: string, className: string, label: string): string => {
  if (!label) {
    const match = article.match(new RegExp(`<span[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`, "i"));
    return cleanText(match?.[1] || "");
  }
  const match = article.match(new RegExp(`<span[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>${label}[:：]([\\s\\S]*?)<\\/span>`, "i"));
  return cleanText(match?.[1] || "");
};

const titleFromArticle = (article: string): string =>
  cleanText(article.match(/<h2 class=["']entry-title["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");

const linkFromArticle = (article: string): string =>
  decodeEntities(
    article.match(/<h2 class=["']entry-title["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)/i)?.[1] || "",
  );

const dateFromArticle = (article: string): string =>
  article.match(/<time[^>]*class=["'][^"']*updated[^"']*["'][^>]*datetime=["']([^"']+)/i)?.[1] ||
  article.match(/<time[^>]*datetime=["']([^"']+)/i)?.[1] ||
  new Date().toISOString();

const isRecent = (value: string): boolean => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const ageDays = (Date.now() - date.getTime()) / 86_400_000;
  return ageDays <= recentWindowDays;
};

const isValidAttendance = (profile: SourceProfile): boolean => {
  const age = Number(profile.age);
  const blocked = blacklist.some((word) => profile.title.includes(word) || profile.brief.includes(word));
  return (
    Number.isFinite(age) &&
    age >= 18 &&
    age <= 35 &&
    profile.home.length > 0 &&
    profile.brief.length > 0 &&
    profile.images.length > 0 &&
    isRecent(profile.updatedAt) &&
    !blocked
  );
};

const extractHomeProfiles = async (): Promise<SourceProfile[]> => {
  const html = await fetchText(baseUrl);
  const sectionStart = html.indexOf('<section class="front-page-section front-page-section-type-post"');
  const source = sectionStart >= 0 ? html.slice(sectionStart) : html;
  const articles = [...source.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((match) => match[0]);

  const profiles: SourceProfile[] = [];
  for (const article of articles) {
    const wpId = article.match(/id=["']post-(\d+)/i)?.[1] || "";
    const title = titleFromArticle(article);
    const link = linkFromArticle(article);
    if (!wpId || !title || !link) continue;

    profiles.push({
      wpId,
      title,
      link,
      updatedAt: dateFromArticle(article),
      home: fieldFromArticle(article, "model_home", "家[乡鄉]"),
      age: fieldFromArticle(article, "model_age", "年[龄齡]"),
      height: fieldFromArticle(article, "model_height", "身高"),
      weight: fieldFromArticle(article, "model_weight", "(?:体重|體重)"),
      cup: fieldFromArticle(article, "model_cup", "罩杯"),
      brief: fieldFromArticle(article, "model_brief", ""),
      images: imageUrlsFromHtml(article),
      videos: videoUrlsFromHtml(article),
    });
  }
  return profiles.filter(isValidAttendance);
};

const extractDetailMedia = async (profile: SourceProfile): Promise<{ images: string[]; videos: string[] }> => {
  const html = await fetchText(profile.link);
  const images = [...new Set([...profile.images, ...imageUrlsFromHtml(html)])].filter(
    (url) => !/\.(mp4|mov|webm)$/i.test(new URL(url).pathname),
  );
  const videos = [...new Set([...profile.videos, ...videoUrlsFromHtml(html)])];
  return { images, videos };
};

const extractName = (profile: SourceProfile): string => {
  for (const name of Object.keys(knownNameIds).sort((a, b) => b.length - a.length)) {
    if (profile.title.includes(name)) return toTraditional(name);
  }

  const withoutPrefix = profile.title.replace(/^【[^】]+】/, "").trim();
  const beforeBracket = withoutPrefix.split(/[【\s]/)[0] || "";
  const afterSpace = withoutPrefix.match(/\s([一-龥ぁ-んァ-ヶー]{1,6})\s/)?.[1] || "";
  return toTraditional(afterSpace || beforeBracket || `女孩${profile.wpId}`);
};

const profileId = (profile: SourceProfile, existingByName: Map<string, string>): string => {
  const name = extractName(profile);
  return existingByName.get(name) || knownNameIds[name] || `girl-${profile.wpId}`;
};

const deriveTags = (profile: SourceProfile): string[] => {
  const tags = new Set<string>();
  const text = `${profile.title} ${profile.brief}`;
  const origin = toTraditional(profile.home);
  if (origin.includes("中國") || text.includes("中国")) tags.add("中國");
  else tags.add("日本人");
  if (/新人|18歲|18岁/.test(text)) tags.add("新人");
  if (/推薦|推荐|人氣|人气|特價|特价|極品|极品/.test(text)) tags.add("推薦");
  if (/提供.*房[間间]|免費房[間间]/.test(text)) tags.add("提供房間");
  if (/溫柔|温柔|女友/.test(text)) tags.add("女友感");
  if (/高挑|長腿|长腿|模特/.test(text)) tags.add("高挑");
  return [...tags].slice(0, 3);
};

const deriveTitle = (profile: SourceProfile, tags: string[]): string => {
  const title = toTraditional(profile.title)
    .replace(/開始接受預約/g, "")
    .replace(/\d{1,2}[號号日]?.{0,4}出勤/g, "")
    .replace(/出勤/g, "")
    .replace(/[！!。]/g, "")
    .replace(extractName(profile), "")
    .replace(/【|】/g, "・")
    .replace(/\s+/g, "")
    .replace(/・+/g, "・")
    .replace(/^・|・$/g, "");

  if (tags.includes("中國")) return title.includes("中國") ? title : `中國・${title || "人氣女孩"}`;
  return title.includes("日本人") ? title : `日本人・${title || "推薦女孩"}`;
};

const formatAmount = (value: string | undefined): string => {
  if (!value) return "";
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) ? number.toLocaleString("en-US") : value;
};

const derivePrice = (profile: SourceProfile): string => {
  const brief = profile.brief.replace(/,/g, "");
  const plans = [
    ["60", brief.match(/60\s*(?:分鐘|分钟|分)[^\d]{0,8}(\d{4,6})/)?.[1]],
    ["80", brief.match(/80\s*(?:分鐘|分钟|分)[^\d]{0,8}(\d{4,6})/)?.[1]],
    ["120", brief.match(/120\s*(?:分鐘|分钟|分)[^\d]{0,8}(\d{4,6})/)?.[1]],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([minutes, amount]) => `${minutes} 分鐘 ${formatAmount(amount)}`);
  const overnight = brief.match(/包夜[^\d]{0,8}(\d{4,6})/)?.[1];
  if (overnight) plans.push(`包夜 ${formatAmount(overnight)}`);
  if (plans.length) return plans.join(" / ");
  if (toTraditional(profile.home).includes("中國")) {
    return "60 分鐘 13,000 / 80 分鐘 20,000 / 120 分鐘 26,000";
  }
  return "60 分鐘 20,000 / 80 分鐘 30,000 / 120 分鐘 40,000";
};

const deriveSummary = (profile: SourceProfile): string =>
  cleanText(profile.brief)
    .replace(/\d{2,3}\s*分鐘?[^\d]{0,8}\d{4,6}/g, "")
    .replace(/\d{2,3}\s*分钟?[^\d]{0,8}\d{4,6}/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 90);

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

const buildGeminiTranslationPrompt = (profiles: Profile[]): string => `Translate these reservation profile summaries.

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

const translateProfilesWithGemini = async (
  profiles: Profile[],
  translations: ProfileTranslations,
): Promise<ProfileTranslations> => {
  const apiKey = process.env.GEMINI_API_KEY;
  const missingProfiles = profiles.filter((profile) =>
    translatableLanguages.some((language) => !translations[language][profile.id]),
  );
  if (!apiKey || !missingProfiles.length) return translations;

  try {
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildGeminiTranslationPrompt(missingProfiles) }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!response.ok) throw new Error(`Gemini failed with HTTP ${response.status}`);

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
    if (!text) throw new Error("Gemini returned an empty response");

    const translated = JSON.parse(text) as GeminiTranslationResponse;
    for (const item of translated.profiles || []) {
      if (!item.id || !item.translations) continue;
      for (const language of translatableLanguages) {
        if (translations[language][item.id]) continue;
        const text = validTranslatedProfileText(item.translations[language]);
        if (text) translations[language][item.id] = text;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Gemini translation skipped: ${message}`);
  }

  return translations;
};

const makeImageId = (url: string, imageMap: Record<string, string>): string => {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const year = parts.at(-3) || "image";
  const month = parts.at(-2) || "00";
  const filename = parts.at(-1) || "asset";
  const base = filename
    .replace(/\.(jpe?g|png|webp|gif)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const candidate = `${year}-${month}-${base}`;
  if (!imageMap[candidate] || imageMap[candidate] === url) return candidate;
  let suffix = 2;
  while (imageMap[`${candidate}-${suffix}`] && imageMap[`${candidate}-${suffix}`] !== url) suffix += 1;
  return `${candidate}-${suffix}`;
};

const ensureImage = async (
  url: string,
  imageMap: Record<string, string>,
  sourceToId: Map<string, string>,
): Promise<string> => {
  const existingId = sourceToId.get(url);
  const imageId = existingId || makeImageId(url, imageMap);
  imageMap[imageId] = url;
  sourceToId.set(url, imageId);
  return imageId;
};

const splitProfileImages = async (
  imageIds: string[],
  imageMap: Record<string, string>,
  existingSupportScreenshots: string[] = [],
): Promise<{ gallery: string[]; supportScreenshots: string[] }> => {
  const gallery: string[] = [];
  const supportScreenshots: string[] = [];
  const existingSupport = new Set(existingSupportScreenshots);
  for (const imageId of imageIds) {
    const url = imageMap[imageId];
    if (profilePhotoImageIds.has(imageId)) {
      gallery.push(imageId);
    } else if (existingSupport.has(imageId) || (url && await isLikelySupportScreenshot(imageId, url))) {
      supportScreenshots.push(imageId);
    } else {
      gallery.push(imageId);
    }
  }
  for (const imageId of existingSupportScreenshots) {
    if (!profilePhotoImageIds.has(imageId) && !supportScreenshots.includes(imageId)) supportScreenshots.push(imageId);
  }
  if (!gallery.length && supportScreenshots.length) gallery.push(supportScreenshots.shift()!);
  return { gallery, supportScreenshots };
};

const siteData = readJson<SiteData>("src/content/site-data.json");
const baselineSiteData = siteData;
const imageMap = readJson<Record<string, string>>("src/content/image-map.json");
const localImageMap = readJson<Record<string, string>>("src/content/local-image-map.json");
const profileTranslations = readProfileTranslations();
const sourceToId = new Map(Object.entries(imageMap).map(([id, source]) => [source, id]));
const existingByName = new Map(baselineSiteData.profiles.map((profile) => [profile.name, profile.id]));
const existingById = new Map(baselineSiteData.profiles.map((profile) => [profile.id, profile]));

const sourceProfiles = await extractHomeProfiles();
if (!sourceProfiles.length) throw new Error("No valid attendance profiles found on source homepage");

const profiles: Profile[] = [];
for (const sourceProfile of sourceProfiles) {
  const { images: imageUrls, videos } = await extractDetailMedia(sourceProfile);
  if (!imageUrls.length) continue;
  const imageIds: string[] = [];
  for (const url of imageUrls) {
    imageIds.push(await ensureImage(url, imageMap, sourceToId));
  }
  const { gallery, supportScreenshots } = await splitProfileImages(imageIds, imageMap);
  const name = extractName(sourceProfile);
  const tags = deriveTags(sourceProfile);
  const id = profileId(sourceProfile, existingByName);
  const previousProfile = existingById.get(id);
  profiles.push({
    id,
    name,
    title: previousProfile?.title || deriveTitle(sourceProfile, tags),
    date: new Date(sourceProfile.updatedAt).toISOString().slice(0, 10),
    origin: toTraditional(sourceProfile.home),
    age: sourceProfile.age,
    height: sourceProfile.height,
    weight: sourceProfile.weight,
    cup: sourceProfile.cup,
    tags: previousProfile?.tags?.length ? previousProfile.tags : tags,
    price: derivePrice(sourceProfile),
    summary: previousProfile?.summary ? toTraditional(previousProfile.summary) : deriveSummary(sourceProfile),
    image: gallery[0] || "",
    gallery,
    ...(supportScreenshots.length ? { supportScreenshots } : {}),
    videos: videos.length ? videos : previousProfile?.videos,
    isToday: true,
  });
}

if (!profiles.length) throw new Error("No profiles remained after image processing");

const todayProfileIds = new Set(profiles.map((profile) => profile.id));
const preservedProfiles: Profile[] = [];
for (const profile of baselineSiteData.profiles.filter((item) => !todayProfileIds.has(item.id))) {
  const { gallery, supportScreenshots } = await splitProfileImages(
    profile.gallery || [],
    imageMap,
    profile.supportScreenshots || [],
  );
  preservedProfiles.push({
    ...profile,
    gallery,
    ...(supportScreenshots.length ? { supportScreenshots } : { supportScreenshots: undefined }),
    isToday: false,
  });
}

siteData.profiles = [...profiles, ...preservedProfiles];
siteData.heroImages = profiles.slice(0, 4).map((profile) => profile.image);

await translateProfilesWithGemini(siteData.profiles, profileTranslations);

await writeJson("src/content/site-data.json", siteData);
await writeJson("src/content/image-map.json", imageMap);
await writeJson("src/content/profile-translations.json", profileTranslations);
await writeFile(
  path.join(contentDir, "image-map.ts"),
  `export const imageMap = ${JSON.stringify(imageMap, null, 2)} satisfies Record<string, string>;\n`,
);

console.log(
  JSON.stringify(
    {
      todayProfiles: profiles.length,
      preservedProfiles: preservedProfiles.length,
      totalProfiles: siteData.profiles.length,
      images: Object.keys(imageMap).length,
      localImages: Object.keys(localImageMap).length,
    },
    null,
    2,
  ),
);
