export function parseLatLng(latLng: string): { lat: number; lng: number } | null {
  const parts = latLng.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }
  return { lat: parts[0], lng: parts[1] };
}
