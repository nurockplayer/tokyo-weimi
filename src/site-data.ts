import type { SiteData } from "./types.ts";
import siteData from "./content/site-data.json" with { type: "json" };

export const { shops, contact, heroImages, profiles, pricePlans, hotels } = siteData as SiteData;
