/**
 * One SQL surface, two drivers.
 *
 *   DATABASE_URL set   -> postgres.js against Supabase (or any Postgres)
 *   DATABASE_URL unset -> PGlite, real Postgres in WASM, persisted to .data/pgdata
 *
 * Both speak the same dialect and take the same $1-style parameters, so every
 * query in this app is written once and runs unchanged in dev and in production.
 * This is what lets the whole portal be built and tested before Supabase
 * credentials exist.
 *
 * Import `./db` from application code — it adds a server-only guard. This
 * module exists unguarded so the migration/seed CLI (which runs outside Next)
 * can reuse the exact same driver instead of duplicating connection logic.
 */

type Driver = {
  query: <T>(text: string, params: unknown[]) => Promise<T[]>;
  /** Multi-statement DDL. The extended protocol allows only one statement per
   *  call, so migrations need the simple protocol instead. */
  exec: (text: string) => Promise<void>;
  close: () => Promise<void>;
};

// Next dev does HMR across workers; without a global cache we'd open a new
// PGlite instance (and lock the data dir) on every reload.
const globalForDb = globalThis as unknown as { __striveDriver?: Promise<Driver> };

declare global {
  // eslint-disable-next-line no-var
  var __strivePGliteHooked: boolean | undefined;
}

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { default: postgres } = await import("postgres");
    const client = postgres(url, {
      // Supabase's transaction pooler does not support prepared statements.
      prepare: false,
      max: 5,
      idle_timeout: 20,
    });
    return {
      query: async <T>(text: string, params: unknown[]) =>
        (await client.unsafe(text, params as never[])) as unknown as T[],
      exec: async (text: string) => {
        await client.unsafe(text).simple();
      },
      close: () => client.end({ timeout: 5 }),
    };
  }

  /**
   * Imported through a variable specifier on purpose.
   *
   * A literal `import("@electric-sql/pglite")` lets bundlers follow the graph
   * and pull in its 9.6 MB of WASM — which then blows the Cloudflare Workers
   * script size limit for a dependency that can never execute there anyway
   * (production always has DATABASE_URL, so this branch is unreachable).
   * A computed specifier defers resolution to runtime, where Node finds it
   * normally and Workers never asks.
   */
  const pgliteModule = ["@electric-sql", "pglite"].join("/");
  const { PGlite } = (await import(
    /* webpackIgnore: true */ /* @vite-ignore */ pgliteModule
  )) as typeof import("@electric-sql/pglite");

  const dir = process.env.PGLITE_DIR ?? ".data/pgdata";

  // PGlite's node filesystem layer calls a non-recursive mkdir, so it fails if
  // the parent directory is missing. Create the tree ourselves first.
  const { mkdirSync, rmSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });

  /**
   * Open PGlite, rebuilding the store if it will not open.
   *
   * PGlite writes its data directory lazily and cannot survive a hard kill —
   * on Windows, stopping a dev server does exactly that, and every subsequent
   * query then aborts inside the WASM runtime with "Aborted()". The database is
   * unrecoverable at that point, so the only useful behaviour is to recreate it
   * rather than leave the app dead until someone reads a stack trace.
   *
   * Safe because this path is development-only: with DATABASE_URL set we never
   * get here, and production is Supabase. Loud on purpose — silently discarding
   * a database should never be quiet, even a disposable one.
   */
  let pg: InstanceType<typeof PGlite>;
  try {
    pg = new PGlite(dir);
    await pg.waitReady;
  } catch (err) {
    console.error(
      `\n[db] PGlite store at ${dir} could not be opened and is being rebuilt.\n` +
        `     Cause: ${err instanceof Error ? err.message : String(err)}\n` +
        `     This happens when the dev server is killed mid-write.\n` +
        `     Run 'npm run db:seed' to restore demo data.\n`,
    );
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    pg = new PGlite(dir);
    await pg.waitReady;

    // A rebuilt store has no tables; apply the schema so the app comes back up.
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const ddl = await readFile(
      path.join(process.cwd(), "src", "lib", "schema.sql"),
      "utf8",
    );
    await pg.exec(ddl);
  }

  /**
   * Close PGlite on shutdown.
   *
   * PGlite writes its data directory lazily; killing the process mid-write
   * (which is what stopping a dev server does) leaves the directory corrupt and
   * every later query aborts inside the WASM runtime. Flushing on the way out
   * makes an abrupt stop survivable.
   */
  if (!globalThis.__strivePGliteHooked) {
    globalThis.__strivePGliteHooked = true;
    const shutdown = () => {
      void pg.close().catch(() => {});
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    process.once("beforeExit", shutdown);
  }

  return {
    query: async <T>(text: string, params: unknown[]) =>
      (await pg.query<T>(text, params)).rows,
    exec: async (text: string) => {
      await pg.exec(text);
    },
    close: () => pg.close(),
  };
}

function driver(): Promise<Driver> {
  // Don't cache a rejected promise: a single failed connection would otherwise
  // poison every later request until the process restarts, turning a transient
  // problem into a permanently broken app.
  globalForDb.__striveDriver ??= createDriver().catch((err) => {
    globalForDb.__striveDriver = undefined;
    throw err;
  });
  return globalForDb.__striveDriver;
}

/** Run a parameterised query. Prefer the `sql` tagged template below. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const d = await driver();
  return d.query<T>(text, params);
}

/**
 * Tagged-template SQL. Interpolations always become bound parameters, never
 * string concatenation, so this is injection-safe by construction:
 *
 *   const rows = await sql<Item>`select * from items where client_id = ${id}`;
 *
 * For an IN-list, pass an array and use `= any(...)`:
 *
 *   await sql`select * from items where id = any(${ids}::uuid[])`
 */
export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  let text = "";
  const params: unknown[] = [];
  strings.forEach((chunk, i) => {
    text += chunk;
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  });
  return query<T>(text, params);
}

/** Run a multi-statement SQL script (migrations, DDL). Takes no parameters. */
export async function exec(text: string): Promise<void> {
  const d = await driver();
  return d.exec(text);
}

/** First row or null — the common "fetch one" case. */
export async function one<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T | null> {
  const rows = await sql<T>(strings, ...values);
  return rows[0] ?? null;
}

export async function closeDb(): Promise<void> {
  const cached = globalForDb.__striveDriver;
  if (!cached) return;
  globalForDb.__striveDriver = undefined;
  await (await cached).close();
}
