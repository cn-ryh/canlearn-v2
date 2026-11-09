// Generate only in an isolated copy: a source schema edit without a migration blocks verify.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporary = mkdtempSync(join(tmpdir(), "canlearn-schema-drift-"));
try {
  const folder = join(temporary, "drizzle");
  cpSync("drizzle", folder, { recursive: true });
  const before = readdirSync(folder).sort();
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "drizzle-kit",
      "generate",
      "--dialect=postgresql",
      "--schema=./src/database/schema.ts",
      `--out=${folder}`,
    ],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.equal(result.status, 0, "Drizzle schema comparison failed");
  assert.deepEqual(
    readdirSync(folder).sort(),
    before,
    "Database schema changed without a committed migration",
  );
  console.log("Database schema matches committed migration snapshots");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
