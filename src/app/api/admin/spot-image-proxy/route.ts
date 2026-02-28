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
