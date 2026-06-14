import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "src/content/site-data.json",
  "src/content/image-map.json",
  "src/content/image-map.ts",
  "src/content/local-image-map.json",
  "src/content/profile-translations.json",
  "functions/img/[[path]].ts",
  "tools/postbuild.ts",
  "public/404.html",
  "public/robots.txt",
  ".github/workflows/verify.yml",
  ".github/workflows/source-diagnostics.yml",
  "docs/privacy-policy.md",
  "docs/disclaimer.md",
  "docs/operations.md",
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const file of requiredFiles) {
  assert(existsSync(join(root, file)), `Missing required file: ${file}`);
}

const { onRequestGet } = await import("../functions/img/[[path]].ts");
const malformedImageResponse = await onRequestGet({ params: { path: "%" } });
assert(
  malformedImageResponse.status === 404,
  "malformed image paths must return a controlled 404",
);
for (const inheritedPath of ["__proto__", "toString"]) {
  const inheritedImageResponse = await onRequestGet({ params: { path: inheritedPath } });
  assert(
    inheritedImageResponse.status === 404,
    `inherited image key ${inheritedPath} must return a controlled 404`,
  );
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
assert(packageJson.scripts?.test === "tsx tools/check-site.ts", "package.json must expose pnpm test");
assert(packageJson.scripts?.typecheck === "tsc --noEmit", "package.json must expose pnpm run typecheck");
assert(
  packageJson.scripts?.build?.includes("tools/postbuild.ts"),
  "build script must run the postbuild SEO route generator",
);

const mainSource = readFileSync(join(root, "src/main.ts"), "utf8");
assert(mainSource.includes("trackEvent("), "CTA tracking must be wired through trackEvent()");
assert(mainSource.includes("imageSrc("), "Images must be rendered through the media helper");
assert(mainSource.includes("videoSrc("), "Profile videos must be rendered through the media helper");
assert(
  readFileSync(join(root, "src/media.ts"), "utf8").includes("sourceImages[imageId]"),
  "image helper must resolve image ids to source image URLs",
);

const imageMap = JSON.parse(readFileSync(join(root, "src/content/image-map.json"), "utf8")) as Record<string, string>;
assert(Object.keys(imageMap).length >= 30, "image map should contain the migrated gallery images");
const localImageMap = JSON.parse(readFileSync(join(root, "src/content/local-image-map.json"), "utf8")) as Record<string, string>;
assert(
  Object.keys(localImageMap).length >= 30,
  "local image map should preserve migrated image references",
);

const siteData = readFileSync(join(root, "src/content/site-data.json"), "utf8");
assert(!siteData.includes("WeChat"), "customer-facing data should not mention WeChat");
const simplifiedProfileTerms = [
  "东京",
  "中国",
  "推荐",
  "人气",
  "极品",
  "皮肤",
  "干净",
  "年轻",
  "类型",
  "颜值",
  "开发",
  "喜欢",
  "快来",
  "长相",
  "紧致",
  "精致",
  "岁",
  "分钟",
  "信息",
  "档期",
  "价格",
  "电话",
  "回复",
  "服务",
  "评价",
  "预约",
  "房间",
  "免费",
  "女优",
];
for (const term of simplifiedProfileTerms) {
  assert(!siteData.includes(term), `site-data base copy should be Traditional Chinese, found: ${term}`);
}
const parsedSiteData = JSON.parse(siteData) as {
  shops?: Array<{ id: string; name: string; sourceUrl: string }>;
  profiles?: Array<{ id: string; gallery?: string[]; videos?: string[]; isToday?: boolean }>;
};
assert((parsedSiteData.shops?.length || 0) >= 2, "site data should include multiple shops");
assert(
  parsedSiteData.shops?.some((shop) => shop.id === "tokyo-weimi" && shop.sourceUrl === "https://tokyo-weimi.com/"),
  "Tokyo Weimi should be configured as a shop source",
);
assert(
  parsedSiteData.shops?.some((shop) => shop.id === "hikari888" && shop.sourceUrl === "https://hikari888.com/"),
  "Hikari should be configured as a shop source",
);
const parsedProfiles = parsedSiteData.profiles || [];
assert(parsedProfiles.length >= 1, "today schedule should contain scraped profiles");
const todayProfiles = parsedProfiles.filter((profile) => profile.isToday !== false);
const todayByShop = new Map<string, number>();
for (const profile of todayProfiles) {
  const shopId = (profile as { shopId?: string }).shopId || "";
  todayByShop.set(shopId, (todayByShop.get(shopId) || 0) + 1);
}
assert(
  (todayByShop.get("tokyo-weimi") || 0) >= 27,
  "Tokyo Weimi today schedule should preserve the full source homepage grid",
);
assert(
  (todayByShop.get("hikari888") || 0) >= 20,
  "Hikari today schedule should include the source homepage profile grid",
);
assert(
  parsedProfiles.every((profile) => typeof (profile as { shopId?: unknown }).shopId === "string"),
  "every profile should be assigned to a shop",
);
assert(
  parsedProfiles.some((profile) => profile.isToday === false),
  "curated non-today profiles should be preserved instead of deleted",
);
let multiPhotoProfiles = 0;
for (const profile of parsedProfiles) {
  assert((profile.gallery?.length || 0) >= 1, `Profile ${profile.id} should keep at least one source image`);
  if ((profile.gallery?.length || 0) >= 2) multiPhotoProfiles += 1;
  for (const video of profile.videos || []) {
    assert(/^https:\/\/tokyo-weimi\.com\/wp-content\/uploads\//.test(video), `Profile ${profile.id} video should use a source URL`);
    assert(/\.(mp4|mov|webm)$/i.test(new URL(video).pathname), `Profile ${profile.id} video should be a supported video file`);
  }
}
assert(multiPhotoProfiles >= 40, "most profiles should keep multi-photo galleries from source detail pages");
const { dictionaries, languageOptions } = await import("../src/i18n.ts");
const localizedDictionaries = dictionaries as Record<
  string,
  { profiles: Record<string, { summary: string }> }
>;
for (const option of languageOptions) {
  const dictionary = localizedDictionaries[option.code];
  for (const profile of parsedProfiles) {
    const profileCopy = dictionary?.profiles[profile.id];
    assert(profileCopy, `Missing ${option.code} profile copy for ${profile.id}`);
    assert(profileCopy.summary.length > 0, `Missing ${option.code} profile summary for ${profile.id}`);
    if (["ja", "ko", "en"].includes(option.code)) {
      assert(
        profileCopy.summary !== localizedDictionaries["zh-Hant"]?.profiles[profile.id]?.summary,
        `${option.code} profile summary should not fall back to Traditional Chinese for ${profile.id}`,
      );
    }
  }
}
assert(
  existsSync(join(root, "tools/update-today-attendance.ts")),
  "daily attendance updater should be available",
);
assert(
  existsSync(join(root, ".github/workflows/update-attendance.yml")),
  "daily attendance workflow should be available",
);
const attendanceWorkflow = readFileSync(join(root, ".github/workflows/update-attendance.yml"), "utf8");
assert(
  attendanceWorkflow.includes("tailscale/github-action@v4"),
  "daily attendance workflow should connect through Tailscale",
);
assert(
  attendanceWorkflow.includes("TAILSCALE_EXIT_NODE"),
  "daily attendance workflow should select a Tailscale exit node",
);
assert(
  attendanceWorkflow.includes("secrets.DEEPSEEK_API_KEY"),
  "daily attendance workflow should pass DEEPSEEK_API_KEY to the updater",
);
assert(
  attendanceWorkflow.includes("src/content/profile-translations.json"),
  "daily attendance workflow should commit generated profile translations",
);
const sourceDiagnosticsWorkflow = readFileSync(join(root, ".github/workflows/source-diagnostics.yml"), "utf8");
assert(
  sourceDiagnosticsWorkflow.includes("tailscale/github-action@v4"),
  "source diagnostics should test source access through Tailscale",
);
assert(
  sourceDiagnosticsWorkflow.includes("wp-json/wp/v2/posts"),
  "source diagnostics should test the WordPress REST API",
);

const attendanceUpdater = readFileSync(join(root, "tools/update-today-attendance.ts"), "utf8");
assert(!attendanceUpdater.includes('"海选"'), "Tokyo Weimi parser should not blacklist regular 海选 attendance cards");
assert(!attendanceUpdater.includes('"海選"'), "Tokyo Weimi parser should not blacklist regular 海選 attendance cards");

const postbuild = readFileSync(join(root, "tools/postbuild.ts"), "utf8");
for (const route of ["zh-hant", "zh-hans", "ja", "ko", "en"]) {
  assert(postbuild.includes(route), `postbuild must generate /${route}/`);
}
assert(!postbuild.includes("mirrorImages"), "postbuild should not mirror images when rendering source media URLs");
assert(!postbuild.includes("fetch("), "postbuild should not fetch source media during Cloudflare builds");

const trackedJsImplementationFiles = [
  "src/main.js",
  "src/i18n.js",
  "src/media.js",
  "src/site-data.js",
  "src/content/image-map.js",
  "functions/img/[[path]].js",
  "tools/check-site.mjs",
  "tools/postbuild.mjs",
  "tools/scrape-old-site.mjs",
  "tests/e2e/site.spec.js",
  "playwright.config.js",
];

for (const file of trackedJsImplementationFiles) {
  assert(!existsSync(join(root, file)), `JavaScript implementation file should be TypeScript: ${file}`);
}

console.log("site checks passed");
