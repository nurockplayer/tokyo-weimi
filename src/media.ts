import { imageMap } from "./content/image-map.ts";

const sourceImages = imageMap as Record<string, string>;
const isAbsoluteMediaUrl = (value: string) => /^https?:\/\//i.test(value);

export const imageSrc = (imageId: string) => {
  if (isAbsoluteMediaUrl(imageId)) return imageId;
  return sourceImages[imageId] || `/img/${encodeURIComponent(imageId)}.jpg`;
};

export const videoSrc = (videoUrl: string) => videoUrl;
