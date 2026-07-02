import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { Contact, LanguageCode, Profile, ProfileCopy, Shop, SiteData } from "../src/types.ts";

const rootDir = new URL("..", import.meta.url).pathname;
const contentDir = path.join(rootDir, "src", "content");
const tokyoWeimiUrl = "https://tokyo-weimi.com";
const hikariUrl = "https://hikari888.com";
const vipUrl = "https://vip6969.com";
const recentWindowDays = 120;
const requestTimeoutMs = 12_000;
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
type DeepSeekChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const tokyoWeimiContact: Contact = {
  phone: "080-6831-4605",
  line: "https://line.me/ti/p/0PLMapgqhT",
  secondaryLine: "https://line.me/ti/p/KMSZfYErhS",
  lineQr: "2026-05-20260506-221018",
  secondaryLineQr: "2021-05-c82b87b1-69e1-4649-a4a0-c43c315b9ebf",
  area: "東京・池袋周邊",
  hours: "每日更新，建議提前預約",
};

const hikariContact: Contact = {
  phone: "070-7468-6768",
  line: "https://line.me/ti/p/mTIbPNSwcX",
  secondaryLine: "https://hikari888.com/contact",
  lineQr: tokyoWeimiContact.lineQr,
  secondaryLineQr: tokyoWeimiContact.secondaryLineQr,
  area: "東京・新大久保周邊",
  hours: "12:00~5:00",
};

const vipContact: Contact = {
  phone: "",
  line: "https://line.me/ti/p/8iQ42F7ADu",
  secondaryLine: "https://vip6969.com/contact/",
  lineQr: tokyoWeimiContact.lineQr,
  secondaryLineQr: tokyoWeimiContact.secondaryLineQr,
  area: "東京・池袋周邊",
  hours: "12:00~5:00",
};

const shopSources = [
  {
    id: "tokyo-weimi",
    name: "東京維密天使",
    shortName: "維密",
    sourceUrl: `${tokyoWeimiUrl}/`,
    contact: tokyoWeimiContact,
  },
  {
    id: "hikari888",
    name: "光・ひかり・新大久保",
    shortName: "Hikari",
    sourceUrl: `${hikariUrl}/`,
    contact: hikariContact,
  },
  {
    id: "ikebukuro-vip",
    name: "池袋VIP",
    shortName: "VIP",
    sourceUrl: `${vipUrl}/`,
    contact: vipContact,
  },
] satisfies Shop[];

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
  [/长相/g, "長項"],
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
const defaultUnknown = "未公開";

const supportScreenshotImageIds = new Set([
  "2026-03-img-5871",
  "2026-05-img-5997",
  "2025-09-img-5071",
  "2023-08-img-9481",
  "2026-05-img-6050",
  "2026-04-img-5916",
  "2026-04-img-5873",
  "2026-06-img-6171",
]);

const profilePhotoImageIds = new Set([
  "2025-10-img-5293",
  "2025-12-img-5779",
  "2025-12-img-5779-2",
  "2024-08-img-1778",
  "2024-05-img-0673",
]);

const supplementalMediaImageIds = new Set([
  "2024-07-img-1336",
  "2024-07-img-1337",
  "2024-07-img-1346",
  "2024-05-img-0678",
  "2024-05-img-0677",
  "2024-05-img-0676",
  "2024-05-img-0674",
  "2024-05-img-0675",
  "2024-10-img-2446",
  "2024-10-img-2448",
  "2024-11-img-2612",
  "2023-04-8dfe8ac2-6a67-4e9d-bd51-a7f337e91783",
  "2023-04-f5b9c816-3fbb-415b-9587-b854065a84c0",
  "2023-04-af583bad-59e6-4016-9f23-18a223463e0a",
  "2023-04-37d04928-9203-458c-8bb6-da471a577edb",
  "2023-04-3ade51fa-60bf-46ed-a61d-101d5be91a15",
  "2023-04-58ba6657-4776-429b-8230-d97d9e8b6041",
  "2023-04-c0b60151-053c-45fe-ab89-cf9bfb668d49",
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

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
};

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

const fetchTextWithBrowser = async (url: string, retries = 2): Promise<string> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
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
      await page.goto(url, {
        waitUntil: "load",
        timeout: requestTimeoutMs * 2,
      });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      return await page.content();
    } catch (error) {
      lastError = error;
    } finally {
      await browser.close().catch(() => {});
    }
    if (attempt < retries) await wait(1_000 * (attempt + 1));
  }
  throw lastError;
};

const fetchText = async (url: string): Promise<string> => {
  try {
    const response = await fetchFromSource(url);
    if (!response.ok) throw new Error(`${url} failed with HTTP ${response.status}`);
    return response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("HTTP 403") || message.includes("HTTP 429")) return fetchTextWithBrowser(url, 3);
    throw error;
  }
};

const absolutize = (url: string | undefined): string => {
  if (!url || url.startsWith("data:")) return "";
  try {
    const parsed = new URL(decodeEntities(url), tokyoWeimiUrl);
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

const imageUrlsFromHtmlForBase = (html = "", baseUrl: string): string[] => {
  const urls = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value || value.startsWith("data:")) return;
    let parsed: URL;
    try {
      parsed = new URL(decodeEntities(value), baseUrl);
    } catch {
      return;
    }
    parsed.search = "";
    parsed.hash = "";
    if (!parsed.pathname.includes("/wp-content/uploads/")) return;
    if (!/\.(jpe?g|png|webp|gif)$/i.test(parsed.pathname)) return;
    urls.add(canonicalImageUrl(parsed.href));
  };

  for (const match of html.matchAll(/<(?:img|source)\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)) {
    add(match[1]);
  }
  for (const match of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
    for (const candidate of (match[1] || "").split(",")) {
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

const isSourceListing = (profile: SourceProfile): boolean =>
  Boolean(profile.wpId && profile.title && profile.link && profile.images.length > 0);

const extractHomeProfiles = async (): Promise<SourceProfile[]> => {
  const html = await fetchText(tokyoWeimiUrl);
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
      shopId: "tokyo-weimi",
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
  return profiles.filter(isSourceListing);
};

const textLinesFromHtml = (html = ""): string[] =>
  stripHtml(html)
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);

const nextLineAfter = (lines: string[], label: string): string => {
  const index = lines.findIndex((line) => line === label || line.startsWith(label));
  if (index < 0) return "";
  const inlineValue = lines[index]!.slice(label.length).replace(/^[:：.\s]+/, "").trim();
  if (inlineValue) return inlineValue;
  return (lines[index + 1] || "").replace(/^>\s*/, "").trim();
};

const hikariFieldFromHtml = (html: string, label: string): string => {
  const match = html.match(
    new RegExp(`<em[^>]*class=["'][^"']*tx[^"']*["'][^>]*>${label}\\.<\\/em>\\s*([\\s\\S]*?)(?=<em|<br|<\\/p>)`, "i"),
  );
  return cleanText(match?.[1] || "");
};

const extractHikariCards = (html: string): SourceProfile[] =>
  [...html.matchAll(/<a href=["'](https:\/\/hikari888\.com\/(\d+)\/)["'][^>]*class=["'][^"']*cbox[^"']*["'][\s\S]*?<\/a>/gi)]
    .map((match): SourceProfile | null => {
      const card = match[0];
      const image = imageUrlsFromHtmlForBase(card, hikariUrl)[0] || "";
      const title = cleanText(card.match(/<span[^>]*class=["'][^"']*icon[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || "");
      const name = cleanText(card.match(/<p[^>]*class=["'][^"']*name[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || "");
      const size = cleanText(card.match(/<p[^>]*class=["'][^"']*size[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || "");
      const sizeMatch = size.match(/(\d{2})歳\s+(\d{3})cm\s+([A-ZＡ-Ｚ])-?cup/i);
      const link = match[1];
      const wpId = match[2];
      const age = sizeMatch?.[1];
      const height = sizeMatch?.[2];
      const cup = sizeMatch?.[3];
      if (!name || !link || !wpId || !age || !height || !cup || !image) return null;
      return {
        shopId: "hikari888",
        wpId,
        name,
        title,
        link,
        updatedAt: new Date().toISOString(),
        home: "新大久保",
        age,
        height,
        weight: "",
        cup: `${cup.toUpperCase()}-cup`,
        brief: title,
        images: [image],
        videos: [],
      };
    })
    .filter((profile): profile is SourceProfile => Boolean(profile));

const hydrateHikariProfile = async (profile: SourceProfile): Promise<SourceProfile> => {
  const html = await fetchText(profile.link);
  const title = cleanText(
    html.match(/<h2[^>]*class=["'][^"']*page_title[^"']*["'][^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1] ||
      profile.title,
  );
  const name = cleanText(
    html.match(/<div[^>]*id=["']name["'][^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ||
      profile.name ||
      profile.title,
  );
  const age = hikariFieldFromHtml(html, "年齢").replace(/歳$/i, "") || profile.age;
  const height = hikariFieldFromHtml(html, "身長").replace(/cm$/i, "") || profile.height;
  const weight = hikariFieldFromHtml(html, "体重") || profile.weight;
  const cup = hikariFieldFromHtml(html, "罩杯") || profile.cup;
  const home = hikariFieldFromHtml(html, "出身") || profile.home || "新大久保";
  const brief = cleanText(
    html.match(/<div[^>]*class=["'][^"']*other_in[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
      profile.brief,
  );
  const images = imageUrlsFromHtmlForBase(html, hikariUrl).filter((url) => !url.includes("/themes/"));

  return {
    ...profile,
    name,
    title: title.includes(name) ? title : `${title} ${name}`.trim(),
    home,
    age: age.replace(/歳$/i, ""),
    height,
    weight,
    cup,
    brief,
    images: images.length ? images : profile.images,
  };
};

const extractHikariProfiles = async (): Promise<SourceProfile[]> => {
  const html = await fetchText(hikariUrl);
  const cards = extractHikariCards(html).slice(0, 28);
  const profiles = await mapWithConcurrency(cards, 5, async (card) => {
    try {
      return await hydrateHikariProfile(card);
    } catch {
      return card;
    }
  });
  return profiles.filter(isSourceListing);
};

const extractVipProfiles = async (): Promise<SourceProfile[]> => {
  const html = await fetchTextWithBrowser(vipUrl);
  const profiles: SourceProfile[] = [];
  const matches = [...html.matchAll(/<li[^>]*class=["'][^"']*bg_com[^"']*["'][\s\S]*?<\/li>/gi)];

  for (const match of matches) {
    const card = match[0];
    const image = (card.match(/data-original=["']([^"']+)["']/i) || card.match(/src=["']([^"']+)["']/i))?.[1] || "";
    const name = cleanText(card.match(/<span[^>]*class=["'][^"']*icon[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || "");
    const title = cleanText(card.match(/<div[^>]*class=["']txt["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");
    const size = cleanText(card.match(/<br[^>]*class=["']pc_no["'][^>]*>([\s\S]*?)<br/i)?.[1] || "");
    const sizeMatch = size.match(/(\d{2})歳\s+(\d{3})cm\s+([A-ZＡ-Ｚ])-?cup/i);

    if (!name || !image || !title) continue;

    // Use name hash as a stable identifier since we don't have WP IDs
    const wpId = `vip-${Buffer.from(name).toString("hex").slice(0, 8)}`;

    profiles.push({
      shopId: "ikebukuro-vip",
      wpId,
      name,
      title,
      link: vipUrl,
      updatedAt: new Date().toISOString(),
      home: "池袋",
      age: sizeMatch?.[1] || "",
      height: sizeMatch?.[2] || "",
      weight: "",
      cup: sizeMatch?.[3] ? `${sizeMatch[3].toUpperCase()}-cup` : "",
      brief: title,
      images: [absolutize(image)],
      videos: [],
    });
  }
  return profiles.filter(isSourceListing);
};

const extractDetailMedia = async (profile: SourceProfile): Promise<{ images: string[]; videos: string[] }> => {
  const html = await fetchText(profile.link);
  if (profile.shopId === "hikari888") {
    return {
      images: [...new Set([...profile.images, ...imageUrlsFromHtmlForBase(html, hikariUrl)])].filter(
        (url) => !url.includes("/themes/"),
      ),
      videos: [],
    };
  }
  const images = [...new Set([...profile.images, ...imageUrlsFromHtml(html)])].filter(
    (url) => !/\.(mp4|mov|webm)$/i.test(new URL(url).pathname),
  );
  const videos = [...new Set([...profile.videos, ...videoUrlsFromHtml(html)])];
  return { images, videos };
};

const extractName = (profile: SourceProfile): string => {
  if (profile.name) return toTraditional(profile.name);
  const tradTitle = toTraditional(profile.title);
  for (const name of Object.keys(knownNameIds).sort((a, b) => b.length - a.length)) {
    if (tradTitle.includes(toTraditional(name))) return toTraditional(name);
  }

  const withoutPrefix = tradTitle.replace(/^【[^】]+】/, "").trim();
  const beforeBracket = withoutPrefix.split(/[【\s]/)[0] || "";
  const afterSpace = withoutPrefix.match(/\s([一-龥ぁ-んァ-ヶー]{1,6})\s/)?.[1] || "";
  return toTraditional(afterSpace || beforeBracket || `女孩${profile.wpId}`);
};

const profileId = (profile: SourceProfile, existingByName: Map<string, string>): string => {
  const name = extractName(profile);
  return existingByName.get(`${profile.shopId}:${name}`) || (profile.shopId === "tokyo-weimi" ? knownNameIds[name] : "") || `${profile.shopId}-girl-${profile.wpId}`;
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
  if (profile.shopId === "hikari888") {
    return "60 分鐘 18,000 / 80 分鐘 27,000 / 120 分鐘 36,000";
  }
  if (profile.shopId === "ikebukuro-vip") {
    return "60 分鐘 12,000 / 14,000 / 16,000 / 18,000";
  }
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

const withFallback = (value: string | undefined, fallback = defaultUnknown): string => {
  const text = cleanText(value || "");
  return text || fallback;
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

const buildTranslationPrompt = (profiles: Profile[]): string => `Translate these reservation profile summaries.

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

const SYSTEM_PROMPT = "You translate adult reservation profile copy and return valid JSON only.";

const tryTranslateWithGemini = async (
  missingProfiles: Profile[],
  apiKey: string,
): Promise<TranslationResponse> => {
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: buildTranslationPrompt(missingProfiles) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini failed with HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response");

  return JSON.parse(text) as TranslationResponse;
};

const tryTranslateWithDeepSeek = async (
  missingProfiles: Profile[],
  apiKey: string,
): Promise<TranslationResponse> => {
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildTranslationPrompt(missingProfiles) },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek failed with HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as DeepSeekChatCompletionResponse;
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("DeepSeek returned an empty response");

  return JSON.parse(text) as TranslationResponse;
};

const mergeTranslationResponse = (
  translated: TranslationResponse,
  translations: ProfileTranslations,
): void => {
  for (const item of translated.profiles || []) {
    if (!item.id || !item.translations) continue;
    for (const language of translatableLanguages) {
      if (translations[language][item.id]) continue;
      const text = validTranslatedProfileText(item.translations[language]);
      if (text) translations[language][item.id] = text;
    }
  }
};

const translateProfiles = async (
  profiles: Profile[],
  translations: ProfileTranslations,
): Promise<ProfileTranslations> => {
  const missingProfiles = profiles.filter((profile) =>
    translatableLanguages.some((language) => !translations[language][profile.id]),
  );
  if (!missingProfiles.length) return translations;

  const geminiKey = process.env.GEMINI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  if (geminiKey) {
    try {
      console.log("Translating with Gemini...");
      const result = await tryTranslateWithGemini(missingProfiles, geminiKey);
      mergeTranslationResponse(result, translations);
      console.log("Gemini translation succeeded.");
      return translations;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Gemini translation failed, falling back to DeepSeek: ${message}`);
    }
  }

  if (deepseekKey) {
    try {
      console.log("Translating with DeepSeek...");
      const result = await tryTranslateWithDeepSeek(missingProfiles, deepseekKey);
      mergeTranslationResponse(result, translations);
      console.log("DeepSeek translation succeeded.");
      return translations;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`DeepSeek translation skipped: ${message}`);
    }
  } else if (!geminiKey) {
    console.warn("Translation skipped: neither GEMINI_API_KEY nor DEEPSEEK_API_KEY is set.");
  } else {
    console.warn("Translation skipped: Gemini failed and DEEPSEEK_API_KEY is not set.");
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

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

const splitProfileMedia = (
  imageIds: string[],
  previousProfile?: Profile,
): { gallery: string[]; supportScreenshots: string[]; supplementalMedia: string[] } => {
  const previousSupport = new Set(previousProfile?.supportScreenshots || []);
  const previousSupplemental = new Set(previousProfile?.supplementalMedia || []);
  const gallery: string[] = [];
  const supportScreenshots: string[] = [];
  const supplementalMedia: string[] = [];

  for (const imageId of unique(imageIds)) {
    if (profilePhotoImageIds.has(imageId)) {
      gallery.push(imageId);
    } else if (supportScreenshotImageIds.has(imageId)) {
      supportScreenshots.push(imageId);
    } else if (supplementalMediaImageIds.has(imageId)) {
      supplementalMedia.push(imageId);
    } else if (previousSupport.has(imageId)) {
      supportScreenshots.push(imageId);
    } else if (previousSupplemental.has(imageId)) {
      supplementalMedia.push(imageId);
    } else {
      gallery.push(imageId);
    }
  }

  if (!gallery.length) {
    const fallback = supplementalMedia.shift() || supportScreenshots.shift();
    if (fallback) gallery.push(fallback);
  }

  return { gallery, supportScreenshots, supplementalMedia };
};

const siteData = readJson<SiteData>("src/content/site-data.json");
const baselineSiteData = siteData;
const imageMap = readJson<Record<string, string>>("src/content/image-map.json");
const localImageMap = readJson<Record<string, string>>("src/content/local-image-map.json");
const profileTranslations = readProfileTranslations();
const sourceToId = new Map(Object.entries(imageMap).map(([id, source]) => [source, id]));
const existingByName = new Map(baselineSiteData.profiles.map((profile) => [`${profile.shopId || "tokyo-weimi"}:${profile.name}`, profile.id]));
const existingById = new Map(baselineSiteData.profiles.map((profile) => [profile.id, profile]));

const sourceProfiles = [...(await extractHomeProfiles()), ...(await extractHikariProfiles()), ...(await extractVipProfiles())];
if (!sourceProfiles.length) throw new Error("No valid attendance profiles found on source homepage");

const enrichedSourceProfiles = await mapWithConcurrency(sourceProfiles, 5, async (sourceProfile) => ({
  sourceProfile,
  media: await extractDetailMedia(sourceProfile).catch(() => ({
    images: sourceProfile.images,
    videos: sourceProfile.videos,
  })),
}));

const jstDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const profiles: Profile[] = [];
for (const { sourceProfile, media } of enrichedSourceProfiles) {
  const { images: imageUrls, videos } = media;
  if (!imageUrls.length) continue;
  const imageIds: string[] = [];
  for (const url of imageUrls) {
    imageIds.push(await ensureImage(url, imageMap, sourceToId));
  }
  const name = extractName(sourceProfile);
  const tags = deriveTags(sourceProfile);
  const id = profileId(sourceProfile, existingByName);
  const previousProfile = existingById.get(id);
  const { gallery, supportScreenshots, supplementalMedia } = splitProfileMedia(imageIds, previousProfile);
  profiles.push({
    id,
    shopId: sourceProfile.shopId,
    name,
    title: previousProfile?.title || deriveTitle(sourceProfile, tags),
    date: new Date(sourceProfile.updatedAt).toISOString().slice(0, 10),
    origin: withFallback(toTraditional(sourceProfile.home), sourceProfile.shopId === "hikari888" ? "新大久保" : (sourceProfile.shopId === "ikebukuro-vip" ? "池袋" : "東京")),
    age: withFallback(sourceProfile.age),
    height: withFallback(sourceProfile.height),
    weight: withFallback(sourceProfile.weight),
    cup: withFallback(sourceProfile.cup),
    tags: previousProfile?.tags?.length ? previousProfile.tags : tags,
    price: derivePrice(sourceProfile),
    summary: previousProfile?.summary
      ? toTraditional(previousProfile.summary)
      : withFallback(deriveSummary(sourceProfile), deriveTitle(sourceProfile, tags)),
    image: gallery[0] || "",
    gallery,
    ...(supportScreenshots.length ? { supportScreenshots } : {}),
    ...(supplementalMedia.length ? { supplementalMedia } : {}),
    videos: videos.length ? videos : previousProfile?.videos,
    isToday: true,
    lastSeen: jstDate,
  });
}

if (!profiles.length) throw new Error("No profiles remained after image processing");

const todayProfileIds = new Set(profiles.map((profile) => profile.id));
const preservedProfiles = baselineSiteData.profiles
  .filter((profile) => !todayProfileIds.has(profile.id))
  .map((profile) => {
    const { gallery, supportScreenshots, supplementalMedia } = splitProfileMedia(
      [
        profile.image,
        ...(profile.gallery || []),
        ...(profile.supportScreenshots || []),
        ...(profile.supplementalMedia || []),
      ],
      profile,
    );
    return {
      ...profile,
      image: gallery[0] || profile.image,
      gallery,
      ...(supportScreenshots.length ? { supportScreenshots } : { supportScreenshots: undefined }),
      ...(supplementalMedia.length ? { supplementalMedia } : { supplementalMedia: undefined }),
      shopId: profile.shopId || "tokyo-weimi",
      isToday: false,
      lastSeen: profile.lastSeen || profile.date,
    };
  });

siteData.shops = shopSources;
siteData.contact = tokyoWeimiContact;
siteData.profiles = [...profiles, ...preservedProfiles];
siteData.heroImages = profiles.slice(0, 4).map((profile) => profile.image);

for (const profile of siteData.profiles) {
  for (const language of translatableLanguages) {
    if (profileTranslations[language][profile.id]?.summary === profile.summary) {
      delete profileTranslations[language][profile.id];
    }
  }
}

await translateProfiles(siteData.profiles, profileTranslations);

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
