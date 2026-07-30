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

/**
 * How long one statement may take, connection included, before it is abandoned.
 *
 * Generous on purpose. Every statement opens its own connection, so this covers
 * a TCP and TLS handshake plus the query, and exceeding it means the database is
 * genuinely unreachable rather than merely slow. Its job is to make a hang
 * impossible, not to enforce a latency budget: a hung request is a 500 with an
 * empty log, while a timeout is an error that names itself.
 */
const STATEMENT_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS ?? 10000);

/**
 * Reject if `promise` has not settled within `ms`.
 *
 * The point is not to cancel the query — a lost socket cannot be cancelled —
 * but to stop awaiting it, so the caller fails with a message instead of
 * hanging until the runtime kills the whole request.
 */
function withDeadline<R>(promise: Promise<R>, ms: number): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`database statement exceeded ${ms}ms — connection is probably dead`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Validate the connection string before postgres.js does, to get a usable error.
 *
 * postgres.js parses it with `new URL()`, which on Workers throws a bare
 * "TypeError: Invalid URL string." — it names no variable and says nothing about
 * what is wrong. Deployed, that surfaces as an unexplained 500 on every
 * database-backed page while the login page keeps working, because login is the
 * one route that never touches Postgres. That combination reads like a routing
 * problem and sends you looking in the wrong place entirely.
 *
 * A Worker secret cannot be read back, so the error message is the only
 * diagnostic available. Every branch below names DATABASE_URL and describes the
 * defect without echoing the password.
 */
function assertUsableConnectionString(url: string): void {
  const fix = "Fix with: npx wrangler secret put DATABASE_URL";
  const expected =
    "Expected postgresql://user:password@host:6543/postgres";

  if (url !== url.trim()) {
    throw new Error(`DATABASE_URL has leading or trailing whitespace. ${fix}`);
  }
  if (/^[<[]|[>\]]$/.test(url)) {
    throw new Error(
      `DATABASE_URL is wrapped in < > or [ ] brackets — paste it without them. ${fix}`,
    );
  }
  if (url.includes("[YOUR-PASSWORD]")) {
    throw new Error(
      `DATABASE_URL still contains the literal [YOUR-PASSWORD] placeholder. ${fix}`,
    );
  }
  if (/\s/.test(url)) {
    throw new Error(
      `DATABASE_URL contains a space, so it is probably the psql command form ` +
        `rather than the URI. ${expected}. ${fix}`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Length and the first few characters only — both structural, never secret.
    throw new Error(
      `DATABASE_URL is not a parseable URL (${url.length} chars, begins ` +
        `"${url.slice(0, 12)}"). ${expected}. ${fix}`,
    );
  }

  const scheme = parsed.protocol.replace(":", "");
  if (!/^postgres(ql)?$/.test(scheme)) {
    throw new Error(
      `DATABASE_URL scheme is "${scheme}", expected "postgresql". ${fix}`,
    );
  }
  if (!parsed.password) {
    throw new Error(
      `DATABASE_URL has no password — Supabase shows [YOUR-PASSWORD] as a ` +
        `placeholder you must replace. ${fix}`,
    );
  }
}

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;

  if (url) {
    assertUsableConnectionString(url);
    const { default: postgres } = await import("postgres");
    type Client = ReturnType<typeof postgres>;

    const make = (): Client =>
      postgres(url, {
        // Supabase's transaction pooler does not support prepared statements.
        prepare: false,
        // One socket: this client serves exactly one statement and is discarded.
        max: 1,
        connect_timeout: 10,
      });

    /**
     * A connection per statement, not a pool held across requests.
     *
     * This looks wasteful and is in fact the cheaper option on Workers. An
     * isolate outlives the request that created it but its timers do not run in
     * between, so postgres.js never learns that Supabase's pooler dropped the
     * idle connection. It writes the next query into a dead socket and waits
     * forever; the runtime then kills the request with "your Worker's code had
     * hung", which reaches you as a 500 with nothing in the logs. That is the
     * failure that looked like a credentials problem for hours.
     *
     * Reusing the pool and probing for death first was measurably worse: the
     * socket was dead on *every* request, so each one paid the full probe
     * timeout before retrying — 8.3s at an 8s deadline, 2.3s at 2s. The probe
     * was pure waste, because there was never a live connection to find.
     *
     * Opening one costs a TCP and TLS handshake, and Next issues a page's
     * queries concurrently so those handshakes overlap rather than accumulate.
     * The deadline stays as a guard: a fresh connection should not hang, and if
     * it does, an error beats a hang.
     *
     * If this is ever too slow, the fix is Hyperdrive — it keeps the pool warm
     * on Cloudflare's side, which is the thing a Worker cannot do for itself.
     * It is free on this plan. This code is the version that needs no extra
     * service to be correct.
     */
    const run = async <R>(fn: (c: Client) => Promise<R>): Promise<R> => {
      const client = make();
      try {
        return await withDeadline(fn(client), STATEMENT_TIMEOUT_MS);
      } finally {
        // Fire-and-forget: the response should not wait on a socket teardown.
        void client.end({ timeout: 1 }).catch(() => {});
      }
    };

    return {
      query: async <T>(text: string, params: unknown[]) =>
        run(async (c) => (await c.unsafe(text, params as never[])) as unknown as T[]),
      exec: async (text: string) => {
        await run(async (c) => {
          await c.unsafe(text).simple();
        });
      },
      // Nothing is retained between statements, so there is nothing to close.
      close: async () => {},
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
