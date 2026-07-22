import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { RefreshResult } from "./types.ts";

const rootDir = new URL("../..", import.meta.url).pathname;
const contentDir = path.join(rootDir, "src", "content");

const writeJson = async (file: string, value: unknown): Promise<void> => {
  await writeFile(path.join(rootDir, file), `${JSON.stringify(value, null, 2)}\n`);
};

export async function writeLegacyContent(result: RefreshResult): Promise<void> {
  await writeJson("src/content/site-data.json", result.siteData);
  await writeJson("src/content/image-map.json", result.imageMap);
  await writeJson("src/content/profile-translations.json", result.profileTranslations);
  await writeFile(
    path.join(contentDir, "image-map.ts"),
    `export const imageMap = ${JSON.stringify(result.imageMap, null, 2)} satisfies Record<string, string>;\n`,
  );
}
