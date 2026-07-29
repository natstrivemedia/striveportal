/**
 * Push raw Metricool rows into the portal.
 *
 *   node scripts/push-metricool.mts <payload.json>
 *
 * The payload is whatever the Metricool MCP tools returned, wrapped with the
 * brand and the field IDs that were requested:
 *
 *   {
 *     "brandId": 4818244,
 *     "blocks": [
 *       { "fields": ["IGEV01","IGEV06","IGEV38"],
 *         "rows": [["318.0","591.0","29.0","20260717"], ...] }
 *     ]
 *   }
 *
 * A file may hold one such object or an array of them (one per brand).
 *
 * This talks to the portal over HTTP, never to the database directly — so it is
 * safe to run while the dev server holds the PGlite lock, and it works
 * unchanged against a deployed instance.
 */
import { readFile } from "node:fs/promises";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* fall through to real env vars */
}

const { toSnapshots } = await import("../src/lib/metricool-map.ts");

type Input = {
  brandId?: number | string;
  slug?: string;
  clientId?: string;
  blocks: { fields: string[]; rows: (string | number | null)[][] }[];
};

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/push-metricool.mts <payload.json>");
  process.exit(1);
}

const base = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.INGEST_SECRET;
if (!secret) {
  console.error("✗ INGEST_SECRET is not set");
  process.exit(1);
}

const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
const inputs: Input[] = Array.isArray(parsed) ? (parsed as Input[]) : [parsed as Input];

let failures = 0;

for (const input of inputs) {
  const snapshots = toSnapshots(input.blocks ?? []);
  if (snapshots.length === 0) {
    console.warn(`• ${input.brandId ?? input.slug ?? "?"} — no usable rows, skipped`);
    continue;
  }

  const res = await fetch(`${base}/api/ingest/metricool`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      source: "metricool",
      blogId: input.brandId,
      slug: input.slug,
      clientId: input.clientId,
      snapshots,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    failures += 1;
    console.error(`✗ ${input.brandId ?? input.slug} — ${res.status} ${JSON.stringify(body)}`);
  } else {
    console.log(`✓ ${body.client} — ${body.rowsWritten} rows`);
  }
}

process.exitCode = failures > 0 ? 1 : 0;
