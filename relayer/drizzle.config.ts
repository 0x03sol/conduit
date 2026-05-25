import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "sqlite",
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dbCredentials: {
        url: process.env.RELAYER_DB_URL ?? "file:./data/relayer.db",
    },
    strict: true,
});
