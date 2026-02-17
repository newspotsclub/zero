const BASE = "https://maps.googleapis.com/maps/api/staticmap";
const W = 400;
const H = 500; // 4:5 aspect (scale=2 for retina)
const ZOOM = 16;
const SCALE = 2;

export function getStaticMapImageUrl(lat: number, lng: number): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(ZOOM),
    size: `${W}x${H}`,
    scale: String(SCALE),
    maptype: "roadmap",
    key,
  });
  return `${BASE}?${params.toString()}`;
}
