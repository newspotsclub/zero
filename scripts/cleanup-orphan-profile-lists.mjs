import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const runKey =
  process.env.MIGRATION_RUN_KEY ?? "cleanup_orphan_profile_lists_v1";

const parsedBatchSize = Number.parseInt(process.env.BATCH_SIZE ?? "1000", 10);
const batchSize =
  Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 1000;

const sql = postgres(connectionString, { max: 1 });

async function ensureMigrationRunsTable() {
  await sql`
    create table if not exists public.migration_runs (
      run_key text primary key,
      status text not null check (status in ('running', 'completed', 'failed')),
      started_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      finished_at timestamptz,
      batches_processed integer not null default 0,
      rows_affected bigint not null default 0,
      last_checkpoint text,
      error_message text,
      metadata jsonb not null default '{}'::jsonb
    )
  `;
}

async function startRun() {
  await sql`
    insert into public.migration_runs (
      run_key,
      status,
      started_at,
      updated_at,
      finished_at,
      batches_processed,
      rows_affected,
      last_checkpoint,
      error_message,
      metadata
    )
    values (
      ${runKey},
      'running',
      now(),
      now(),
      null,
      0,
      0,
      null,
      null,
      ${sql.json({
        task: "cleanup_orphan_profile_lists",
        batch_size: batchSize,
      })}::jsonb
    )
    on conflict (run_key) do update
    set status = 'running',
        updated_at = now(),
        finished_at = null,
        error_message = null,
        metadata = public.migration_runs.metadata || excluded.metadata
  `;
}

async function runBatch() {
  return sql.begin(async (tx) => {
    const orphanRows = await tx`
      select pl.id
      from public.profile_lists pl
      where not exists (
        select 1
        from auth.users u
        where u.id = pl.user_id
      )
      order by pl.id asc
      limit ${batchSize}
    `;

    if (orphanRows.length === 0) {
      return {
        deletedCount: 0,
        lastCheckpoint: null,
      };
    }

    const orphanIds = orphanRows.map((row) => row.id);
    const deletedRows = await tx`
      delete from public.profile_lists
      where id = any(${sql.array(orphanIds, "uuid")})
      returning id
    `;

    const deletedCount = deletedRows.length;
    const lastCheckpoint = deletedRows[deletedRows.length - 1]?.id ?? orphanIds.at(-1) ?? null;

    await tx`
      update public.migration_runs
      set updated_at = now(),
          batches_processed = batches_processed + 1,
          rows_affected = rows_affected + ${deletedCount},
          last_checkpoint = ${lastCheckpoint}
      where run_key = ${runKey}
    `;

    return {
      deletedCount,
      lastCheckpoint,
    };
  });
}

async function markCompleted() {
  await sql`
    update public.migration_runs
    set status = 'completed',
        updated_at = now(),
        finished_at = now()
    where run_key = ${runKey}
  `;
}

async function markFailed(message) {
  await sql`
    update public.migration_runs
    set status = 'failed',
        updated_at = now(),
        finished_at = now(),
        error_message = ${message}
    where run_key = ${runKey}
  `;
}

async function main() {
  try {
    await ensureMigrationRunsTable();
    await startRun();

    let totalDeleted = 0;
    let batchNumber = 0;

    while (true) {
      const { deletedCount, lastCheckpoint } = await runBatch();
      if (deletedCount === 0) break;

      batchNumber += 1;
      totalDeleted += deletedCount;

      console.log(
        `[batch ${batchNumber}] deleted ${deletedCount} orphan profile_lists` +
          (lastCheckpoint ? ` (last_id=${lastCheckpoint})` : ""),
      );
    }

    await markCompleted();
    console.log(
      `Cleanup complete. Deleted ${totalDeleted} orphan profile_lists rows in ${batchNumber} batch(es).`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await markFailed(message);
    } catch {
      // Ignore secondary failure while recording run status.
    }
    throw error;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error("Orphan profile list cleanup failed:", error.message);
  process.exit(1);
});
