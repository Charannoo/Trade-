/**
 * scripts/migrate.ts — Apply Drizzle migrations.
 * Run with: npm run db:migrate
 */
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || "./data/trades.db");

// Ensure data directory
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");

const db = drizzle(sqlite);

console.log(`Running migrations on: ${dbPath}`);
migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
console.log("Migrations complete.");

sqlite.close();
