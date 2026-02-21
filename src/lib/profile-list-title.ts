function toTrimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function stripCanonicalOwnerPrefix(
  title: string,
  displayName: string | null | undefined,
  username: string | null | undefined,
): string {
  const ownerCandidates = [toTrimmed(displayName), toTrimmed(username)].filter(
    (candidate) => candidate.length > 0,
  );

  const normalizedTitle = title.trim();
  if (!normalizedTitle) return normalizedTitle;

  for (const ownerCandidate of ownerCandidates) {
    const lowerOwner = ownerCandidate.toLowerCase();
    const lowerTitle = normalizedTitle.toLowerCase();
    const asciiPrefix = `${lowerOwner}'s `;
    const smartPrefix = `${lowerOwner}’s `;

    if (lowerTitle.startsWith(asciiPrefix)) {
      const remainder = normalizedTitle.slice(asciiPrefix.length).trim();
      if (remainder.length > 0) {
        return remainder;
      }
    }

    if (lowerTitle.startsWith(smartPrefix)) {
      const remainder = normalizedTitle.slice(smartPrefix.length).trim();
      if (remainder.length > 0) {
        return remainder;
      }
    }
  }

  return normalizedTitle;
}

export function formatListTitleForViewer(params: {
  title: string | null | undefined;
  displayName: string | null | undefined;
  username: string | null | undefined;
}): string {
  const fallbackTitle = "List";
  const normalized = stripCanonicalOwnerPrefix(
    params.title ?? "",
    params.displayName,
    params.username,
  );
  return normalized || fallbackTitle;
}
