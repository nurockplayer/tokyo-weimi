export const imageSrc = (imageId: string): string =>
  `/img/${encodeURIComponent(imageId)}.jpg`;

export type VideoSrcResolver = (url: string) => string;

export const videoSrc: VideoSrcResolver = (videoUrl: string) => videoUrl;
