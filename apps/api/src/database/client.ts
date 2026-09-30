import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://canlearn:canlearn_local@localhost:5432/canlearn";

export const migrationClient = postgres(databaseUrl, { max: 1 });
export const queryClient = postgres(databaseUrl);
export const migrationDatabase = drizzle(migrationClient);
export const database = drizzle(queryClient, { schema });
