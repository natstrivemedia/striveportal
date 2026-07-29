"use client";

import { useState } from "react";
import type { Workspace } from "@/lib/workspace";

/**
 * Live-previewing branding form.
 *
 * The preview updates as you type rather than after saving, because picking a
 * colour is a judgement you make by looking, not by reading a hex code.
 */
export function AppearanceForm({
  workspace,
  onSave,
  onRemoveLogo,
}: {
  workspace: Workspace;
  onSave: (formData: FormData) => Promise<void>;
  onRemoveLogo: () => Promise<void>;
}) {
  const [name, setName] = useState(workspace.name);
  const [accent, setAccent] = useState(workspace.accent);
  const [sidebarBg, setSidebarBg] = useState(workspace.sidebar_bg);
  const [pageBg, setPageBg] = useState(workspace.page_bg);

  return (
    <form action={onSave} className="mt-6 flex flex-col gap-6">
      {/* Preview */}
      <div className="overflow-hidden rounded-[20px]" style={{ background: pageBg }}>
        <div className="flex gap-2 p-3">
          <div className="w-32 rounded-xl p-2" style={{ background: sidebarBg }}>
            <div className="flex items-center gap-1.5">
              <span
                className="grid size-5 place-items-center rounded text-[9px] font-medium text-white"
                style={{ background: accent }}
              >
                {name.slice(0, 1)}
              </span>
              <span className="truncate text-[10px] text-ink-900">{name}</span>
            </div>
            <div className="mt-2 h-5 rounded-md" style={{ background: accent }} />
            <div className="mt-1.5 h-4 rounded-md bg-white/70" />
            <div className="mt-1 h-4 rounded-md bg-white/40" />
          </div>
          <div className="flex-1 rounded-xl bg-white p-3">
            <div className="h-3 w-24 rounded bg-ink-200" />
            <div className="mt-2 h-12 rounded-lg bg-ink-50" />
          </div>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-small font-medium text-ink-500">Workspace name</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl bg-ink-50 px-3 py-2.5 text-body outline-none ring-1 ring-inset ring-transparent focus:bg-white focus:ring-ink-300"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <ColorField label="Accent" name="accent" value={accent} onChange={setAccent} />
        <ColorField label="Sidebar" name="sidebar_bg" value={sidebarBg} onChange={setSidebarBg} />
        <ColorField label="Page" name="page_bg" value={pageBg} onChange={setPageBg} />
      </div>

      <div>
        <span className="mb-1.5 block text-small font-medium text-ink-500">Workspace icon</span>
        <div className="flex flex-wrap items-center gap-3">
          {workspace.logo_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/workspace-logo" alt="" className="size-12 rounded-xl object-contain" />
          ) : (
            <span
              className="grid size-12 place-items-center rounded-xl text-body font-medium text-white"
              style={{ background: accent }}
            >
              {name.slice(0, 1)}
            </span>
          )}
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="text-body file:mr-3 file:rounded-full file:border-0 file:bg-ink-100 file:px-4 file:py-2 file:text-body file:font-medium file:text-ink-700 hover:file:bg-ink-200"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" className="cta bg-ink-950 text-white">
          Save appearance
        </button>
        {workspace.logo_path && (
          <button
            type="submit"
            formAction={onRemoveLogo}
            className="cta text-ink-400 hover:bg-stop-100 hover:text-stop-600"
          >
            Remove icon
          </button>
        )}
      </div>
    </form>
  );
}

function ColorField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-small font-medium text-ink-500">{label}</span>
      <span className="flex items-center gap-2 rounded-xl bg-ink-50 px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} colour`}
          className="size-7 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} hex`}
          className="w-full min-w-0 bg-transparent text-body uppercase outline-none"
        />
      </span>
    </label>
  );
}
