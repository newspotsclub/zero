export function shouldBypassNextImageOptimization(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);
    return (
      url.protocol === "https:" &&
      url.hostname === "maps.googleapis.com" &&
      url.pathname === "/maps/api/place/js/PhotoService.GetPhoto"
    );
  } catch {
    return false;
  }
}
