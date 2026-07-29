/**
 * Scans the whole source tree for UTF-8 mojibake.
 *
 * Guards against a specific mistake: rewriting files with a tool that does not
 * round-trip UTF-8 mangles every non-ASCII character. It is easy to introduce
 * across dozens of files and invisible until someone reads the rendered text.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOTS = ["src", "scripts"].map((d) => path.join(process.cwd(), d));

/**
 * Classic Latin-1-interpreted-as-UTF-8 lead bytes, built from char codes so
 * this file does not match its own pattern.
 */
const LEAD = String.fromCharCode(0x00c2, 0x00e2, 0x00c3, 0x00f0); // Â â Ã ð
const MOJIBAKE = new RegExp(`[${LEAD}][\\u0080-\\u00bf]`);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(tsx?|mts|mjs|css|sql|md)$/.test(entry.name)) yield full;
  }
}

let bad = 0;
for (const root of ROOTS) {
  for await (const file of walk(root)) {
    const text = await readFile(file, "utf8");
    const line = text.split("\n").findIndex((l) => MOJIBAKE.test(l));
    if (line >= 0) {
      bad += 1;
      console.error(
        `✗ ${path.relative(process.cwd(), file)}:${line + 1}  ${text.split("\n")[line].trim().slice(0, 70)}`,
      );
    }
  }
}

console.log(bad === 0 ? "✓ encoding clean" : `✗ ${bad} file(s) with mojibake`);
process.exitCode = bad > 0 ? 1 : 0;
