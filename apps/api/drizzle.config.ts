import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/database/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://canlearn:canlearn_local@localhost:5432/canlearn",
  },
  strict: true,
});
