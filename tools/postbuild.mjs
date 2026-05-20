import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dictionaries, getLanguageOption, languageOptions } from "../src/i18n.js";

const siteUrl = "https://tokyo-weimi.pages.dev";
const distDir = join(process.cwd(), "dist");
const baseHtml = readFileSync(join(distDir, "index.html"), "utf8");
const imageMap = JSON.parse(readFileSync(join(process.cwd(), "src/content/image-map.json"), "utf8"));
const localImageMap = JSON.parse(readFileSync(join(process.cwd(), "src/content/local-image-map.json"), "utf8"));

const routeFor = (code) => {
  const routes = {
    "zh-Hant": "zh-hant",
    "zh-Hans": "zh-hans",
    ja: "ja",
    ko: "ko",
    en: "en",
  };
  return routes[code];
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const alternateLinks = languageOptions
  .map((option) => {
    const href = `${siteUrl}/${routeFor(option.code)}/`;
    return `<link rel="alternate" hreflang="${getLanguageOption(option.code).htmlLang}" href="${href}" />`;
  })
  .join("\n    ");

const renderLocalizedHtml = (code) => {
  const copy = dictionaries[code];
  const route = routeFor(code);
  const canonical = `${siteUrl}/${route}/`;
  return baseHtml
    .replace(/<html lang="[^"]*">/, `<html lang="${getLanguageOption(code).htmlLang}">`)
    .replace(/content="[^"]*"(\s*\/>\s*<title>)/, `content="${escapeHtml(copy.meta.description)}"$1`)
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(copy.meta.title)}</title>`)
    .replace(
      "</head>",
      `    <link rel="canonical" href="${canonical}" />\n    ${alternateLinks}\n    <meta property="og:title" content="${escapeHtml(copy.meta.title)}" />\n    <meta property="og:description" content="${escapeHtml(copy.meta.description)}" />\n    <meta property="og:url" content="${canonical}" />\n    <meta property="og:type" content="website" />\n  </head>`,
    );
};

for (const option of languageOptions) {
  const route = routeFor(option.code);
  const routeDir = join(distDir, route);
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "index.html"), renderLocalizedHtml(option.code));
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n  xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${languageOptions
  .map((option) => {
    const route = routeFor(option.code);
    const loc = `${siteUrl}/${route}/`;
    const alternates = languageOptions
      .map((alternate) => {
        const href = `${siteUrl}/${routeFor(alternate.code)}/`;
        return `    <xhtml:link rel="alternate" hreflang="${getLanguageOption(alternate.code).htmlLang}" href="${href}" />`;
      })
      .join("\n");
    return `  <url>\n    <loc>${loc}</loc>\n${alternates}\n  </url>`;
  })
  .join("\n")}\n</urlset>\n`;

writeFileSync(join(distDir, "sitemap.xml"), sitemap);

const imageDir = join(distDir, "img");
mkdirSync(imageDir, { recursive: true });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const fetchWithRetry = async (imageId, sourceUrl) => {
  let lastError;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await fetch(sourceUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 Tokyo-Weimi-Site-Build/1.0",
        },
      });
    } catch (error) {
      lastError = error;
      await wait(400 * attempt);
    }
  }

  throw new Error(`Failed to fetch ${imageId}: ${lastError?.message || "unknown network error"}`);
};

const fetchImage = async ([imageId, sourceUrl]) => {
  const localSource = localImageMap[imageId];
  if (localSource) {
    const localPath = join(process.cwd(), "public", localSource.replace(/^\//, ""));
    if (existsSync(localPath)) {
      copyFileSync(localPath, join(imageDir, `${imageId}.jpg`));
      return;
    }
  }

  const response = await fetchWithRetry(imageId, sourceUrl);

  if (!response.ok) {
    throw new Error(`Failed to mirror ${imageId}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Failed to mirror ${imageId}: expected image content, got ${contentType}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(join(imageDir, `${imageId}.jpg`), bytes);
};

const mirrorImages = async () => {
  const entries = Object.entries(imageMap);
  const batchSize = 2;

  for (let index = 0; index < entries.length; index += batchSize) {
    await Promise.all(entries.slice(index, index + batchSize).map(fetchImage));
  }
};

await mirrorImages();
