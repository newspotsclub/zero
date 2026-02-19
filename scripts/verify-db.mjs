import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql = postgres(connectionString, { max: 1 });

async function ensureTable(tableName) {
  const [row] = await sql`
    select exists(
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = ${tableName}
    ) as exists
  `;

  if (!row?.exists) {
    throw new Error(`Missing table: public.${tableName}`);
  }
}

async function ensureRls(tableName) {
  const [row] = await sql`
    select relrowsecurity
    from pg_class
    where oid = ${`public.${tableName}`}::regclass
  `;

  if (!row?.relrowsecurity) {
    throw new Error(`RLS is disabled on public.${tableName}`);
  }
}

async function ensurePolicy(tableName, policyName) {
  const [row] = await sql`
    select exists(
      select 1
      from pg_policies
      where schemaname = 'public'
      and tablename = ${tableName}
      and policyname = ${policyName}
    ) as exists
  `;

  if (!row?.exists) {
    throw new Error(`Missing policy "${policyName}" on public.${tableName}`);
  }
}

async function ensureColumn(tableName, columnName) {
  const [row] = await sql`
    select exists(
      select 1
      from information_schema.columns
      where table_schema = 'public'
      and table_name = ${tableName}
      and column_name = ${columnName}
    ) as exists
  `;

  if (!row?.exists) {
    throw new Error(`Missing column public.${tableName}.${columnName}`);
  }
}

async function main() {
  try {
    await ensureTable("profiles");
    await ensureTable("user_spot_status");
    await ensureTable("spots");

    await ensureRls("profiles");
    await ensureRls("user_spot_status");
    await ensureRls("spots");

    await ensurePolicy("user_spot_status", "Users can read own statuses");
    await ensurePolicy("user_spot_status", "Users can insert own statuses");
    await ensurePolicy("user_spot_status", "Users can update own statuses");
    await ensurePolicy("user_spot_status", "Users can delete own statuses");
    await ensurePolicy("spots", "Anyone can read spots");
    await ensurePolicy("spots", "Admins can insert spots");
    await ensurePolicy("spots", "Admins can update spots");
    await ensurePolicy("spots", "Admins can delete spots");
    await ensureColumn("spots", "place_id");

    console.log("DB verify passed: tables, RLS, and policies are present.");
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error("DB verify failed:", error.message);
  process.exit(1);
});
