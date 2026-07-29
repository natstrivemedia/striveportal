/**
 * Application-facing database access.
 *
 * The `server-only` import makes the build fail loudly if a client component
 * ever pulls this in — this module carries the service-role connection, and the
 * portal's entire security model rests on the browser never touching Postgres
 * directly.
 *
 * See ./db-core for the driver itself.
 */
import "server-only";

export { query, sql, one, exec, closeDb } from "./db-core";
