import type { ContentManifestV1, ContentSnapshotV1, LanguageCode, Profile, TranslatedProfileText } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LANGUAGE_CODES = new Set<string>(["zh-Hant", "zh-Hans", "ja", "ko", "en"]);

const SHA256_RE = /^[a-f0-9]{64}$/;

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function indent(message: string): string {
  return message
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// assertContentManifestV1
// ---------------------------------------------------------------------------

export function assertContentManifestV1(value: unknown): asserts value is ContentManifestV1 {
  const prefix = "manifest";

  if (!isRecord(value)) {
    throw new Error(`${prefix} must be an object`);
  }

  // schemaVersion
  if (value.schemaVersion !== 1) {
    throw new Error(`${prefix}.schemaVersion must be 1, got ${String(value.schemaVersion)}`);
  }

  // version
  if (!isString(value.version) || value.version.length === 0) {
    throw new Error(`${prefix}.version must be a non-empty string`);
  }

  // generatedAt
  if (!isString(value.generatedAt) || Number.isNaN(Date.parse(value.generatedAt))) {
    throw new Error(`${prefix}.generatedAt must be a valid date string, got ${JSON.stringify(value.generatedAt)}`);
  }

  // snapshotPath
  if (!isString(value.snapshotPath)) {
    throw new Error(`${prefix}.snapshotPath must be a string`);
  }
  if (!value.snapshotPath.startsWith("snapshots/")) {
    throw new Error(`${prefix}.snapshotPath must start with "snapshots/", got "${value.snapshotPath}"`);
  }
  if (value.snapshotPath.includes("..")) {
    throw new Error(`${prefix}.snapshotPath must not contain "..", got "${value.snapshotPath}"`);
  }

  // sha256
  if (!isString(value.sha256) || !SHA256_RE.test(value.sha256)) {
    throw new Error(
      `${prefix}.sha256 must be 64 lowercase hex characters, got ${JSON.stringify(value.sha256)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// assertContentSnapshotV1
// ---------------------------------------------------------------------------

export function assertContentSnapshotV1(value: unknown): asserts value is ContentSnapshotV1 {
  const prefix = "snapshot";

  if (!isRecord(value)) {
    throw new Error(`${prefix} must be an object`);
  }

  // schemaVersion
  if (value.schemaVersion !== 1) {
    throw new Error(`${prefix}.schemaVersion must be 1, got ${String(value.schemaVersion)}`);
  }

  // version
  if (!isString(value.version) || value.version.length === 0) {
    throw new Error(`${prefix}.version must be a non-empty string`);
  }

  // generatedAt
  if (!isString(value.generatedAt) || Number.isNaN(Date.parse(value.generatedAt))) {
    throw new Error(`${prefix}.generatedAt must be a valid date string, got ${JSON.stringify(value.generatedAt)}`);
  }

  // data
  if (!isRecord(value.data)) {
    throw new Error(`${prefix}.data must be an object`);
  }
  const data = value.data as Record<string, unknown>;

  // data.profiles
  if (!isArray(data.profiles)) {
    throw new Error(`${prefix}.data.profiles must be an array`);
  }
  const profiles = data.profiles as Record<string, unknown>[];

  // data.heroImages
  if (!isArray(data.heroImages)) {
    throw new Error(`${prefix}.data.heroImages must be an array`);
  }
  const heroImages = data.heroImages as string[];

  // data.shops
  if (!isArray(data.shops)) {
    throw new Error(`${prefix}.data.shops must be an array`);
  }
  const shops = data.shops as Record<string, unknown>[];
  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    if (!isRecord(shop)) {
      throw new Error(`${prefix}.data.shops[${i}] must be an object`);
    }
    if (!isString(shop.id)) {
      throw new Error(`${prefix}.data.shops[${i}].id must be a string`);
    }
    if (!isString(shop.name)) {
      throw new Error(`${prefix}.data.shops[${i}].name must be a string`);
    }
  }

  // data.contact
  if (!isRecord(data.contact)) {
    throw new Error(`${prefix}.data.contact must be an object`);
  }

  // data.hotels
  if (!isArray(data.hotels)) {
    throw new Error(`${prefix}.data.hotels must be an array`);
  }

  // data.pricePlans
  if (!isArray(data.pricePlans)) {
    throw new Error(`${prefix}.data.pricePlans must be an array`);
  }

  // imageMap
  if (!isRecord(value.imageMap)) {
    throw new Error(`${prefix}.imageMap must be an object`);
  }
  const imageMap = value.imageMap as Record<string, unknown>;
  const imageMapKeys = new Set(Object.keys(imageMap));

  // profileTranslations
  if (!isRecord(value.profileTranslations)) {
    throw new Error(`${prefix}.profileTranslations must be an object`);
  }
  const profileTranslations = value.profileTranslations as Record<string, unknown>;

  // ---- Validations ----

  // Check for duplicate profile ids
  const profileIds = new Set<string>();
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    if (!isRecord(p)) {
      throw new Error(`${prefix}.data.profiles[${i}] must be an object`);
    }
    const id = p.id;
    if (!isString(id)) {
      throw new Error(`${prefix}.data.profiles[${i}].id must be a string`);
    }
    if (profileIds.has(id)) {
      throw new Error(`${prefix}.data.profiles has duplicate id: ${id}`);
    }
    profileIds.add(id);
  }

  // Check profile image / gallery references to imageMap
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i] as Record<string, unknown>;
    const pPath = `${prefix}.data.profiles[${i}]`;

    // image
    const image = p.image;
    if (!isString(image)) {
      throw new Error(`${pPath}.image must be a string`);
    }
    if (!imageMapKeys.has(image)) {
      throw new Error(`${pPath}.image references missing image id: ${image}`);
    }

    // gallery
    const gallery = p.gallery;
    if (!isArray(gallery)) {
      throw new Error(`${pPath}.gallery must be an array`);
    }
    for (let g = 0; g < gallery.length; g++) {
      const gid = gallery[g];
      if (!isString(gid)) {
        throw new Error(`${pPath}.gallery[${g}] must be a string`);
      }
      if (!imageMapKeys.has(gid)) {
        throw new Error(`${pPath}.gallery[${g}] references missing image id: ${gid}`);
      }
    }
  }

  // Check heroImages references to imageMap
  for (let h = 0; h < heroImages.length; h++) {
    const hid = heroImages[h];
    if (!isString(hid)) {
      throw new Error(`${prefix}.data.heroImages[${h}] must be a string`);
    }
    if (!imageMapKeys.has(hid)) {
      throw new Error(`${prefix}.data.heroImages[${h}] references missing image id: ${hid}`);
    }
  }

  // Check profileTranslations keys are valid LanguageCodes
  const translationLangKeys = Object.keys(profileTranslations);
  for (const langKey of translationLangKeys) {
    if (!LANGUAGE_CODES.has(langKey)) {
      throw new Error(`${prefix}.profileTranslations has unknown language code: ${langKey}`);
    }
    const langTranslations = profileTranslations[langKey];
    if (!isRecord(langTranslations)) {
      throw new Error(`${prefix}.profileTranslations.${langKey} must be an object`);
    }
    const profileTranslationIds = Object.keys(langTranslations);

    for (const pid of profileTranslationIds) {
      if (!profileIds.has(pid)) {
        throw new Error(`${prefix}.profileTranslations.${langKey}.${pid} references missing profile`);
      }

      const entry = (langTranslations as Record<string, unknown>)[pid];
      if (!isRecord(entry)) {
        throw new Error(`${prefix}.profileTranslations.${langKey}.${pid} must be an object`);
      }

      // title
      if (!isString(entry.title)) {
        throw new Error(`${prefix}.profileTranslations.${langKey}.${pid}.title must be a string`);
      }

      // summary
      if (!isString(entry.summary)) {
        throw new Error(`${prefix}.profileTranslations.${langKey}.${pid}.summary must be a string`);
      }

      // tags
      if (!isArray(entry.tags)) {
        throw new Error(`${prefix}.profileTranslations.${langKey}.${pid}.tags must be an array`);
      }
      const tags = entry.tags as unknown[];
      for (let t = 0; t < tags.length; t++) {
        if (!isString(tags[t])) {
          throw new Error(
            `${prefix}.profileTranslations.${langKey}.${pid}.tags[${t}] must be a string`,
          );
        }
      }
    }
  }
}
