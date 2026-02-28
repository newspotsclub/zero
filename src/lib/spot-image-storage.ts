export const SPOT_IMAGE_BUCKET = "spot-images";
export const SPOT_IMAGE_MAX_WIDTH = 1080;
export const SPOT_IMAGE_MAX_HEIGHT = 1350;
export const SPOT_IMAGE_OUTPUT_MIME = "image/webp";
export const SPOT_IMAGE_OUTPUT_QUALITY = 0.82;

export function getSpotImagePublicUrl(imageStorageId?: string | null): string | null {
  const trimmed = imageStorageId?.trim();
  if (!trimmed) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  const baseUrl = supabaseUrl.replace(/\/+$/, "");

  const sanitized = trimmed.replace(/^\/+/, "");
  const encodedPath = sanitized
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${baseUrl}/storage/v1/object/public/${SPOT_IMAGE_BUCKET}/${encodedPath}`;
}
