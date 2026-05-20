import { imageMap } from "../../src/content/image-map.js";

const cacheHeaders = {
  "Cache-Control": "public, max-age=86400, s-maxage=604800",
  "X-Content-Type-Options": "nosniff",
};

const getImageId = (path) => {
  try {
    return decodeURIComponent(path).replace(/\.jpe?g$/i, "");
  } catch {
    return undefined;
  }
};

export async function onRequestGet({ params }) {
  const rawPath = Array.isArray(params.path) ? params.path.join("/") : params.path;
  const imageId = getImageId(rawPath);
  const upstreamUrl = Object.hasOwn(imageMap, imageId) ? imageMap[imageId] : undefined;

  if (typeof upstreamUrl !== "string") {
    return new Response("Image not found", {
      status: 404,
      headers: cacheHeaders,
    });
  }

  const upstream = await fetch(upstreamUrl, {
    cf: {
      cacheEverything: true,
      cacheTtl: 604800,
      polish: "lossy",
    },
  });

  if (!upstream.ok) {
    return new Response("Image unavailable", {
      status: upstream.status,
      headers: cacheHeaders,
    });
  }

  const headers = new Headers(cacheHeaders);
  const contentType = upstream.headers.get("content-type");
  if (contentType?.startsWith("image/")) headers.set("Content-Type", contentType);

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
