/**
 * db/index.ts — Database handle with WAL mode.
 * Uses Drizzle ORM over better-sqlite3.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";
import { env } from "@/lib/env";
import * as schema from "./schema";

const dbPath = path.resolve(process.cwd(), env.DATABASE_PATH);

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const globalForDb = globalThis as unknown as {
  __sqlite?: Database.Database;
  __db?: ReturnType<typeof drizzle>;
};

if (!globalForDb.__sqlite) {
  globalForDb.__sqlite = new Database(dbPath);
  globalForDb.__sqlite.pragma("journal_mode = WAL");
  globalForDb.__sqlite.pragma("busy_timeout = 5000");
  globalForDb.__sqlite.pragma("synchronous = NORMAL");
  globalForDb.__db = drizzle(globalForDb.__sqlite, { schema });
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const db = globalForDb.__db!;
export { schema };
