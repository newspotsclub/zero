import type { HomeSpot, SpotRow } from "@/types/home";
import { parseLatLng } from "./geo";
import { getStaticMapImageUrl } from "./staticMap";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500' viewBox='0 0 400 500'%3E%3Crect fill='%23e5e5e5' width='400' height='500'/%3E%3C/svg%3E";

export function getHomeSpotImageUrl(spot: { latLng?: string; image?: string }): string {
  if (spot.image) return spot.image;
  if (spot.latLng) {
    const coords = parseLatLng(spot.latLng);
    if (coords) {
      const mapUrl = getStaticMapImageUrl(coords.lat, coords.lng);
      if (mapUrl) return mapUrl;
    }
  }
  return PLACEHOLDER_IMAGE;
}

export function mapRowToSpot(row: SpotRow): HomeSpot {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    mapsLink: row.maps_link,
    latLng: row.lat_lng ?? undefined,
    image: row.image ?? undefined,
    verified: row.verified ?? false,
    heroDish: row.hero_dish?.trim() || undefined,
  };
}
