import { NextRequest, NextResponse } from "next/server";

const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;

function isAllowedImageHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "maps.googleapis.com" ||
    normalized === "images.unsplash.com" ||
    normalized === "googleusercontent.com" ||
    normalized.endsWith(".googleusercontent.com")
  );
}

/**
 * Google Places JS API generates ephemeral PhotoService URLs that only work
 * in the browser. Convert them to the stable Places Photo REST API endpoint
 * which works server-side.
 *
 * PhotoService URL pattern:
 *   maps.googleapis.com/maps/api/place/js/PhotoService.GetPhoto?1s<REF>&3u<W>&...&key=<KEY>
 *
 * REST API URL:
 *   maps.googleapis.com/maps/api/place/photo?photoreference=<REF>&maxwidth=<W>&key=<KEY>
 */
function resolvePhotoServiceUrl(url: URL): URL {
  if (
    url.hostname !== "maps.googleapis.com" ||
    !url.pathname.includes("PhotoService.GetPhoto")
  ) {
    return url;
  }

  const search = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  const parts = search.split("&");

  let photoRef = "";
  let maxWidth = "1200";
  let apiKey = "";

  for (const part of parts) {
    if (part.startsWith("1s")) {
      photoRef = part.slice(2);
    } else if (part.startsWith("3u")) {
      maxWidth = part.slice(2);
    } else if (part.startsWith("key=")) {
      apiKey = part.slice(4);
    }
  }

  if (!photoRef || !apiKey) return url;

  const restUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
  restUrl.searchParams.set("photoreference", photoRef);
  restUrl.searchParams.set("maxwidth", maxWidth);
  restUrl.searchParams.set("key", apiKey);
  return restUrl;
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing image URL." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only HTTPS image URLs are supported." },
      { status: 400 }
    );
  }

  if (!isAllowedImageHost(parsed.hostname)) {
    return NextResponse.json(
      {
        error:
          "Unsupported image host. Use Google Place photos, Googleusercontent, or Unsplash URLs.",
      },
      { status: 400 }
    );
  }

  parsed = resolvePhotoServiceUrl(parsed);

  const upstream = await fetch(parsed.toString(), {
    cache: "no-store",
    redirect: "follow",
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Unable to fetch source image (status ${upstream.status}).` },
      { status: 502 }
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json(
      { error: "Source URL did not return an image." },
      { status: 400 }
    );
  }

  const sourceBuffer = await upstream.arrayBuffer();
  if (sourceBuffer.byteLength > MAX_SOURCE_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Source image is too large. Please use a smaller image." },
      { status: 413 }
    );
  }

  return new NextResponse(sourceBuffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}
