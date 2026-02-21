import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql = postgres(connectionString, { max: 1 });

function toDisplayName(email) {
  const localPart = (email ?? "").split("@")[0] ?? "";
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "NewSpots User";
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeUsernameBase(input) {
  const ascii = (input ?? "").toLowerCase();
  const cleaned = ascii
    .replace(/[^a-z0-9._]+/g, "_")
    .replace(/[._]{2,}/g, "_")
    .replace(/^[._]+|[._]+$/g, "");

  const fallback = cleaned || "user";
  const clipped = fallback.slice(0, 30);
  if (clipped.length >= 3) return clipped;
  return `${clipped}${"0".repeat(3 - clipped.length)}`;
}

function makeUniqueUsername(base, taken) {
  let candidate = base;
  let suffix = 0;

  while (taken.has(candidate)) {
    suffix += 1;
    const suffixText = `_${suffix}`;
    const maxBaseLength = 30 - suffixText.length;
    const truncatedBase = base.slice(0, Math.max(3, maxBaseLength));
    candidate = `${truncatedBase}${suffixText}`;
  }

  taken.add(candidate);
  return candidate;
}

async function main() {
  try {
    const rows = await sql`
      select user_id, email, display_name, username
      from public.profiles
      order by created_at asc
    `;

    const taken = new Set(
      rows
        .map((row) => row.username)
        .filter((username) => typeof username === "string" && username.trim().length > 0)
        .map((username) => username.trim().toLowerCase()),
    );

    let updatedCount = 0;

    for (const row of rows) {
      const currentDisplayName = row.display_name?.trim() ?? "";
      const currentUsername = row.username?.trim().toLowerCase() ?? "";

      const nextDisplayName =
        currentDisplayName.length > 0 ? currentDisplayName : toDisplayName(row.email);

      let nextUsername = currentUsername;
      if (!nextUsername) {
        const emailBase = normalizeUsernameBase((row.email ?? "").split("@")[0]);
        nextUsername = makeUniqueUsername(emailBase, taken);
      }

      if (
        nextDisplayName !== currentDisplayName ||
        (!!nextUsername && nextUsername !== currentUsername)
      ) {
        await sql`
          update public.profiles
          set display_name = ${nextDisplayName},
              username = ${nextUsername}
          where user_id = ${row.user_id}
        `;
        updatedCount += 1;
      }
    }

    console.log(
      `Backfill complete. Processed ${rows.length} profiles, updated ${updatedCount}.`,
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error("Profile identity backfill failed:", error.message);
  process.exit(1);
});
