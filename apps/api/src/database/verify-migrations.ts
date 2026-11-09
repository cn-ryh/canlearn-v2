// Only creates/drops uniquely named databases on the disposable smoke PostgreSQL instance.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = new URL(process.env.CANLEARN_MIGRATION_TEST_URL ?? "");
if (
  url.protocol !== "postgresql:" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "15433" ||
  url.pathname !== "/canlearn"
)
  throw new Error("Migration evidence requires the isolated CL-013 PostgreSQL endpoint");
const admin = postgres(url.toString(), { max: 1, onnotice: () => {} });
const names: string[] = [];
const clients: ReturnType<typeof postgres>[] = [];
const directory = mkdtempSync(join(tmpdir(), "canlearn-migration-"));
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const checks: string[] = [];
const passed = (name: string) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};

async function database() {
  const name = `cl013_migration_${randomUUID().replaceAll("-", "")}`;
  names.push(name);
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  const target = new URL(url);
  target.pathname = `/${name}`;
  const client = postgres(target.toString(), { max: 1, onnotice: () => {} });
  clients.push(client);
  return client;
}
function fixtureFolder(name: string, entries: typeof journal.entries) {
  const folder = join(directory, name);
  mkdirSync(join(folder, "meta"), { recursive: true });
  writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries)
    writeFileSync(join(folder, `${entry.tag}.sql`), readFileSync(`drizzle/${entry.tag}.sql`));
  return folder;
}
const fingerprint = async (client: ReturnType<typeof postgres>) =>
  JSON.stringify(
    await client`
  SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
  FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position
`,
  );
try {
  const fresh = await database();
  await migrate(drizzle(fresh), { migrationsFolder: "drizzle" });
  passed("fresh database applies all committed migrations");
  const upgraded = await database();
  await migrate(drizzle(upgraded), {
    migrationsFolder: fixtureFolder("legacy", journal.entries.slice(0, 1)),
  });
  const oldId = randomUUID();
  await upgraded`INSERT INTO jobs(id,kind,input,workflow_id) VALUES (${oldId},'health',${JSON.stringify({ legacy: true })}::jsonb,'legacy-health')`;
  const before = JSON.stringify(await upgraded`SELECT * FROM jobs WHERE id=${oldId}`);
  await migrate(drizzle(upgraded), { migrationsFolder: "drizzle" });
  assert.equal(JSON.stringify(await upgraded`SELECT * FROM jobs WHERE id=${oldId}`), before);
  passed("0000 to current upgrade preserves the complete legacy Job row");
  await upgraded`INSERT INTO jobs(kind,input,workflow_id) VALUES ('health',${JSON.stringify({ oldWriter: true })}::jsonb,'old-writer-after-upgrade')`;
  assert.equal(
    (await upgraded`SELECT status FROM jobs WHERE workflow_id='old-writer-after-upgrade'`)[0]
      ?.status,
    "QUEUED",
  );
  passed("legacy writer and reader remain compatible after expansion");
  const snapshot = await fingerprint(upgraded);
  const applied = JSON.stringify(
    await upgraded`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`,
  );
  await migrate(drizzle(upgraded), { migrationsFolder: "drizzle" });
  assert.equal(await fingerprint(upgraded), snapshot);
  assert.equal(
    JSON.stringify(await upgraded`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`),
    applied,
  );
  passed("repeated migration is a no-op for schema and migration journal");
  assert.equal(await fingerprint(fresh), snapshot);
  passed("fresh and upgraded database schemas converge");
  const duplicate = randomUUID();
  await assert.rejects(
    upgraded`INSERT INTO smoke_jobs(job_id,request_key,request_hash,snapshot_id,trace_id) VALUES (${duplicate},'orphan','synthetic',${randomUUID()},'0123456789abcdef0123456789abcdef')`,
  );
  passed("real PostgreSQL foreign key rejects orphan synthetic metadata");
  const bad = fixtureFolder("incompatible", journal.entries);
  const entry = {
    ...journal.entries.at(-1),
    idx: journal.entries.length,
    when: journal.entries.at(-1).when + 1,
    tag: "9999_controlled_failure",
  };
  writeFileSync(
    join(bad, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries: [...journal.entries, entry] }),
  );
  writeFileSync(
    join(bad, `${entry.tag}.sql`),
    "CREATE TABLE cl013_rollback_probe(id integer);--> statement-breakpoint\nALTER TABLE jobs ADD COLUMN incompatible_required text NOT NULL;",
  );
  await assert.rejects(migrate(drizzle(upgraded), { migrationsFolder: bad }));
  assert.equal(await fingerprint(upgraded), snapshot);
  assert.equal(
    JSON.stringify(await upgraded`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`),
    applied,
  );
  assert.equal(JSON.stringify(await upgraded`SELECT * FROM jobs WHERE id=${oldId}`), before);
  passed("incompatible NOT NULL migration fails and rolls back DDL/data/journal");
  const record = process.env.CANLEARN_MIGRATION_RECORD;
  if (record)
    writeFileSync(
      record,
      `${JSON.stringify(
        {
          recorded_at: new Date().toISOString(),
          scope: "disposable PostgreSQL; synthetic legacy rows; no production rollback",
          passed: checks.length,
          checks,
        },
        null,
        2,
      )}\n`,
    );
} finally {
  for (const client of clients) await client.end();
  for (const name of names) await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
  rmSync(directory, { recursive: true, force: true });
}
