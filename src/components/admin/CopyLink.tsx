"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";

/** Copying the portal link is the single most-used admin action — it's how a
 *  client gets in. Keep it one click with visible confirmation. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API needs a secure context; fall back to selection.
      window.prompt("Copy this link", url);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 cta bg-ink-100 text-ink-700 transition hover:bg-ink-200"
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      {copied ? "Copied" : "Copy portal link"}
    </button>
  );
}
