import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "src/content/site-data.json",
  "src/content/image-map.json",
  "src/content/image-map.js",
  "functions/img/[[path]].js",
  "tools/postbuild.mjs",
  "public/robots.txt",
  ".github/workflows/verify.yml",
  "docs/privacy-policy.md",
  "docs/disclaimer.md",
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const file of requiredFiles) {
  assert(existsSync(join(root, file)), `Missing required file: ${file}`);
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert(packageJson.scripts?.test === "node tools/check-site.mjs", "package.json must expose pnpm test");
assert(
  packageJson.scripts?.build?.includes("tools/postbuild.mjs"),
  "build script must run the postbuild SEO route generator",
);

const mainSource = readFileSync(join(root, "src/main.js"), "utf8");
assert(mainSource.includes("trackEvent("), "CTA tracking must be wired through trackEvent()");
assert(mainSource.includes("imageSrc("), "Images must be rendered through the image proxy helper");

const imageMap = JSON.parse(readFileSync(join(root, "src/content/image-map.json"), "utf8"));
assert(Object.keys(imageMap).length >= 30, "image map should contain the migrated gallery images");

const siteData = readFileSync(join(root, "src/content/site-data.json"), "utf8");
assert(!siteData.includes("tokyo-weimi.com/wp-content/uploads"), "site-data JSON must not expose original image URLs");

const postbuild = readFileSync(join(root, "tools/postbuild.mjs"), "utf8");
for (const route of ["zh-hant", "zh-hans", "ja", "ko", "en"]) {
  assert(postbuild.includes(route), `postbuild must generate /${route}/`);
}

console.log("site checks passed");
