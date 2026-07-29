import "server-only";

import { one } from "./db";

/**
 * Workspace branding.
 *
 * Stored in the database rather than env vars specifically so it can be changed
 * from the UI after the app is deployed — changing a colour should not require
 * a redeploy, and the person who wants to change it is not the person who runs
 * builds.
 */
export type Workspace = {
  id: number;
  name: string;
  accent: string;
  sidebar_bg: string;
  page_bg: string;
  logo_path: string | null;
  updated_at: Date;
};

const FALLBACK: Workspace = {
  id: 1,
  name: "Strive Media Co.",
  accent: "#1c1917",
  sidebar_bg: "#eae8e3",
  page_bg: "#eae8e3",
  logo_path: null,
  updated_at: new Date(),
};

export async function getWorkspace(): Promise<Workspace> {
  try {
    return (await one<Workspace>`select * from workspace where id = 1`) ?? FALLBACK;
  } catch {
    // Before migration 006 has run the table doesn't exist; defaults keep the
    // app rendering rather than 500-ing on every page.
    return FALLBACK;
  }
}

export function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}
