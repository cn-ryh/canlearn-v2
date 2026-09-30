import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrationClient, migrationDatabase } from "./client.js";

await migrate(migrationDatabase, { migrationsFolder: "drizzle" });
await migrationClient.end();
