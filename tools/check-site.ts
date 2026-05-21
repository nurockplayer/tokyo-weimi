import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "src/content/site-data.json",
  "src/content/image-map.json",
  "src/content/image-map.ts",
  "src/content/local-image-map.json",
  "functions/img/[[path]].ts",
  "tools/postbuild.ts",
  "public/404.html",
  "public/robots.txt",
  ".github/workflows/verify.yml",
  "docs/privacy-policy.md",
  "docs/disclaimer.md",
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
assert(mainSource.includes("imageSrc("), "Images must be rendered through the image proxy helper");
assert(
  readFileSync(join(root, "src/media.ts"), "utf8").includes(".jpg"),
  "image helper must use static mirrored image paths",
);

const imageMap = JSON.parse(readFileSync(join(root, "src/content/image-map.json"), "utf8")) as Record<string, string>;
assert(Object.keys(imageMap).length >= 30, "image map should contain the migrated gallery images");
const localImageMap = JSON.parse(readFileSync(join(root, "src/content/local-image-map.json"), "utf8")) as Record<string, string>;
assert(
  Object.keys(localImageMap).length === Object.keys(imageMap).length,
  "local image map should cover every rendered image",
);
for (const [imageId, localPath] of Object.entries(localImageMap)) {
  assert(
    existsSync(join(root, "public", localPath.replace(/^\//, ""))),
    `Missing local image copy for ${imageId}: ${localPath}`,
  );
}

const siteData = readFileSync(join(root, "src/content/site-data.json"), "utf8");
assert(!siteData.includes("tokyo-weimi.com/wp-content/uploads"), "site-data JSON must not expose original image URLs");

const postbuild = readFileSync(join(root, "tools/postbuild.ts"), "utf8");
for (const route of ["zh-hant", "zh-hans", "ja", "ko", "en"]) {
  assert(postbuild.includes(route), `postbuild must generate /${route}/`);
}
assert(postbuild.includes("mirrorImages"), "postbuild must mirror images into dist/img");
assert(postbuild.includes("copyFileSync"), "postbuild must prefer local image copies");

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
