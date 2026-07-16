/**
 * db/helpers.ts — Query helpers that bridge Drizzle's type system.
 * Wraps the sync better-sqlite3 API for cleaner usage.
 */
import { eq, SQL } from "drizzle-orm";
import type { SQLiteSelectBuilder } from "drizzle-orm/sqlite-core";
import { db } from "./index";

/** Helper: run a select query and return all results */
export function queryAll<T>(query: SQLiteSelectBuilder<any, "sync", any>): T[] {
  // Drizzle better-sqlite3 sync API: the builder has .all() at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (query as any).all() as T[];
}

/** Helper: run a select query and return first result or undefined */
export function queryGet<T>(query: SQLiteSelectBuilder<any, "sync", any>): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (query as any).get() as T | undefined;
}
