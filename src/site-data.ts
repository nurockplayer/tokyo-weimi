import { imageMap } from "./content/image-map.ts";
import siteData from "./content/site-data.json" with { type: "json" };
import type { SiteData } from "./types.ts";

export const { shops, contact, heroImages, profiles, pricePlans, hotels } = siteData as SiteData;
export { imageMap };
