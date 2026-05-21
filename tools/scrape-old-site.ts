import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = new URL("..", import.meta.url).pathname;
const scrapeDir = path.join(rootDir, "scraped", "old-site");
const assetDir = path.join(rootDir, "public", "assets", "old-site");
const baseUrl = "https://tokyo-weimi.com";

type WordPressEntity = {
  id: number | string;
  title?: { rendered?: string };
  slug?: string;
  link: string;
  date?: string;
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      source_url?: string;
      media_details?: {
        sizes?: {
          full?: {
            source_url?: string;
          };
        };
      };
    }>;
  };
};

type ScrapedDocument = {
  type: "home" | "page" | "post";
  id: string | number;
  title: string;
  slug: string;
  link: string;
  date: string | null;
  html: string;
  featuredMedia?: string;
};

type DownloadedImage = {
  src: string;
  usedBy: string[];
  local?: string;
  bytes?: number;
  error?: string;
};

type ContentItem = {
  type: ScrapedDocument["type"];
  id: ScrapedDocument["id"];
  title: string;
  slug: string;
  link: string;
  date: string | null;
  text: string;
  profile: Record<string, string>;
  imageUrls: string[];
  images: Array<{ source: string; local: string }>;
};

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

const stripHtml = (html = ""): string =>
  decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );

const absolutize = (url: string | undefined): string => {
  if (!url || url.startsWith("data:")) return "";
  try {
    return new URL(decodeEntities(url), baseUrl).href;
  } catch {
    return "";
  }
};

const imageUrlsFromHtml = (html = ""): string[] => {
  const urls = new Set<string>();
  for (const match of html.matchAll(
    /<(?:img|source)\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi,
  )) {
    const url = absolutize(match[1]);
    if (url) urls.add(url);
  }
  for (const match of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
    const srcset = match[1];
    if (!srcset) continue;
    for (const candidate of srcset.split(",")) {
      const source = candidate.trim().split(/\s+/)[0];
      const url = absolutize(source);
      if (url) urls.add(url);
    }
  }
  for (const match of html.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
    const url = absolutize(match[1]);
    if (url) urls.add(url);
  }
  return [...urls].filter(
    (url) =>
      url.includes("/wp-content/uploads/") &&
      /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(url),
  );
};

const extractProfile = (text = ""): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const label of ["家鄉", "年齡", "身高", "體重", "罩杯"]) {
    const match = text.match(new RegExp(`${label}[:：]\\s*([^\\n]+)`));
    if (match?.[1]) fields[label] = match[1].trim();
  }
  return fields;
};

const wpJson = async <T>(endpoint: string): Promise<T> => {
  const response = await fetch(`${baseUrl}/wp-json/wp/v2/${endpoint}`);
  if (!response.ok) {
    throw new Error(`${endpoint} failed with HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
};

const downloadImage = async (url: string, index: number): Promise<Omit<DownloadedImage, "usedBy">> => {
  const parsed = new URL(url);
  const sourceName = path.basename(parsed.pathname).replace(/[^a-z0-9._-]+/gi, "-");
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 8);
  const filename = `${String(index).padStart(2, "0")}-${hash}-${sourceName}`.replace(
    /\.jpeg$/i,
    ".jpg",
  );
  const localPath = path.join(assetDir, filename);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(localPath, bytes);
  return {
    src: url,
    local: `/assets/old-site/${filename}`,
    bytes: bytes.length,
  };
};

await mkdir(scrapeDir, { recursive: true });
await mkdir(assetDir, { recursive: true });

const [pages, posts, homeHtml] = await Promise.all([
  wpJson<WordPressEntity[]>("pages?per_page=100&_embed=1"),
  wpJson<WordPressEntity[]>("posts?per_page=100&_embed=1"),
  fetch(baseUrl).then((response) => response.text()),
]);

const documents: ScrapedDocument[] = [
  {
    type: "home",
    id: "home",
    title: "今日出勤",
    slug: "",
    link: baseUrl,
    date: null,
    html: homeHtml,
  },
  ...pages.map(
    (page): ScrapedDocument => ({
    type: "page",
    id: page.id,
    title: stripHtml(page.title?.rendered),
    slug: page.slug || "",
    link: page.link,
    date: page.date || null,
    html: page.content?.rendered || "",
  })),
  ...posts.map(
    (post): ScrapedDocument => ({
    type: "post",
    id: post.id,
    title: stripHtml(post.title?.rendered),
    slug: post.slug || "",
    link: post.link,
    date: post.date || null,
    html: `${post.content?.rendered || ""}\n${post.excerpt?.rendered || ""}`,
    featuredMedia:
      post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
      post._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes?.full
        ?.source_url ||
      "",
  })),
];

const imageMap = new Map<string, DownloadedImage>();
const content: ContentItem[] = documents.map((document) => {
  const text = stripHtml(document.html);
  const imageUrls = new Set(imageUrlsFromHtml(document.html));
  if (document.featuredMedia) {
    const url = absolutize(document.featuredMedia);
    if (url) imageUrls.add(url);
  }
  for (const imageUrl of imageUrls) {
    const entry = imageMap.get(imageUrl) || { src: imageUrl, usedBy: [] };
    entry.usedBy.push(document.link);
    imageMap.set(imageUrl, entry);
  }
  return {
    type: document.type,
    id: document.id,
    title: document.title,
    slug: document.slug,
    link: document.link,
    date: document.date,
    text,
    profile: extractProfile(text),
    imageUrls: [...imageUrls],
    images: [],
  };
});

const images: DownloadedImage[] = [];
let imageIndex = 0;
for (const image of imageMap.values()) {
  imageIndex += 1;
  try {
    images.push({ ...image, ...(await downloadImage(image.src, imageIndex)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    images.push({ ...image, error: message });
  }
}

const localBySource = new Map(images.map((image) => [image.src, image.local || ""]));
for (const item of content) {
  item.images = item.imageUrls
    .map((source) => ({ source, local: localBySource.get(source) || "" }))
    .filter((image) => image.local);
}

const scrape = {
  scrapedAt: new Date().toISOString(),
  source: baseUrl,
  counts: {
    pages: content.filter((item) => item.type !== "post").length,
    posts: content.filter((item) => item.type === "post").length,
    images: images.length,
    downloadedImages: images.filter((image) => !image.error).length,
  },
  content,
  images,
};

await writeFile(path.join(scrapeDir, "content.json"), JSON.stringify(scrape, null, 2));

const markdown = [
  "# 東京維密天使舊站抓取內容",
  "",
  `來源：${baseUrl}`,
  `抓取時間：${scrape.scrapedAt}`,
  `固定頁：${scrape.counts.pages}`,
  `文章：${scrape.counts.posts}`,
  `圖片：${scrape.counts.downloadedImages}`,
  "",
  ...content.flatMap((item) => [
    `## ${item.title || item.slug || item.link}`,
    "",
    `- 類型：${item.type}`,
    `- URL：${item.link}`,
    item.date ? `- 日期：${item.date}` : "",
    item.images.length
      ? `- 圖片：${item.images.map((image) => image.local).join(", ")}`
      : "",
    "",
    item.text,
    "",
  ]),
].filter(Boolean);

await writeFile(path.join(scrapeDir, "content.md"), markdown.join("\n"));
await writeFile(path.join(assetDir, "manifest.json"), JSON.stringify(images, null, 2));

console.log(JSON.stringify(scrape.counts, null, 2));
