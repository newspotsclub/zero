import type { Spot, SpotEntry } from "@/types/spot";
import { parseLatLng } from "./geo";
import { getStaticMapImageUrl } from "./staticMap";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500' viewBox='0 0 400 500'%3E%3Crect fill='%23e5e5e5' width='400' height='500'/%3E%3C/svg%3E";

export function getSpotImageUrl(latLng?: string, image?: string): string {
  if (latLng) {
    const coords = parseLatLng(latLng);
    if (coords) {
      const mapUrl = getStaticMapImageUrl(coords.lat, coords.lng);
      if (mapUrl) return mapUrl;
    }
  }
  if (image) return image;
  return PLACEHOLDER_IMAGE;
}

export function flattenSpotEntries(spots: Spot[]): SpotEntry[] {
  return spots.flatMap((spot) =>
    spot.locations.map((location) => ({ spot, location }))
  );
}

export function getAreasFromEntries(entries: SpotEntry[]): string[] {
  const areas = Array.from(
    new Set(entries.map((e) => e.location.area))
  ).sort();
  return ["All", ...areas];
}

export function filterEntriesByArea(
  entries: SpotEntry[],
  area: string
): SpotEntry[] {
  if (area === "All") return entries;
  return entries.filter((e) => e.location.area === area);
}
