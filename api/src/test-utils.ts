import Database from "better-sqlite3";

/**
 * Thin D1-compatible wrapper around better-sqlite3 for testing.
 * Implements the subset of D1Database API used by our db.ts functions.
 */
export function createTestDb(): D1Database {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      do_account_id TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subdomains (
      subdomain TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      app TEXT NOT NULL,
      ip TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Cast through unknown to satisfy D1Database interface which may differ across versions
  return ({
    withSession() { return this; },
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);
      let boundArgs: unknown[] = [];

      const binding = {
        bind(...args: unknown[]) {
          boundArgs = args;
          return binding;
        },
        first<T = unknown>(): Promise<T | null> {
          const row = stmt.get(...boundArgs) as T | undefined;
          return Promise.resolve(row ?? null);
        },
        all<T = unknown>(): Promise<D1Result<T>> {
          const rows = stmt.all(...boundArgs) as T[];
          return Promise.resolve({
            results: rows,
            success: true,
            meta: { duration: 0, changes: 0, last_row_id: 0, changed_db: false, size_after: 0, rows_read: rows.length, rows_written: 0 },
          } as D1Result<T>);
        },
        run(): Promise<D1Response> {
          const result = stmt.run(...boundArgs);
          return Promise.resolve({
            success: true,
            meta: { duration: 0, changes: result.changes, last_row_id: Number(result.lastInsertRowid), changed_db: result.changes > 0, size_after: 0, rows_read: 0, rows_written: result.changes },
          } as D1Response);
        },
        raw<T = unknown>(): Promise<T[]> {
          return Promise.resolve([] as T[]);
        },
      };

      return binding;
    },
    batch<T = unknown>(): Promise<D1Result<T>[]> {
      return Promise.resolve([]);
    },
    exec(): Promise<D1ExecResult> {
      return Promise.resolve({ count: 0, duration: 0 });
    },
    dump(): Promise<ArrayBuffer> {
      return Promise.resolve(new ArrayBuffer(0));
    },
  }) as unknown as D1Database;
}
