export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "NS";
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "NS";
}

export function toDefaultDisplayName(email: string | null): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "NewSpots User";
  return cleaned
    .split(/\s+/)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function isAvatarColumnMissing(error: {
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null): boolean {
  if (!error) return false;
  const composed = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`
    .toLowerCase()
    .trim();
  return composed.includes("avatar_url") && composed.includes("column");
}
