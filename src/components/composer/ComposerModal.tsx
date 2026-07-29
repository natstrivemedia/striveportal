"use client";

/**
 * The post editor, as a modal over the calendar.
 *
 * Editing a post is a detour, not a destination — you are looking at a month,
 * you open one day, you go back to the month. A modal keeps that context on
 * screen behind you; a full page throws it away and makes you navigate back.
 *
 * Layout: a platform rail outside the card, Post/Internal tabs, the title as a
 * page heading, labelled property rows, then the caption as the body.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClockIcon, DotIcon, PreviewIcon, HashtagIcon, MediaAddIcon, PillarIcon, RefreshIcon, MessageIcon, PlusIcon, TagIcon, TrashIcon, VideoIcon as TypeIcon, CloseIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import {
  PLATFORMS,
  type ContentPillar,
  type ItemMedia,
  type ItemStatus,
} from "@/lib/types";
import { NETWORK_LABEL } from "@/components/charts/palette";
import { PlatformPreview } from "./PlatformPreview";
import { cn } from "@/lib/utils";

export type ComposerValues = {
  title: string;
  caption: string;
  platforms: string[];
  hashtags: string[];
  labels: string[];
  format: string;
  pillarId: string | null;
  scheduledFor: string;
  status: ItemStatus;
  internalNote: string;
};

const PLATFORM_MARK: Record<string, string> = {
  instagram: "IG", facebook: "FB", tiktok: "TT", linkedin: "LI",
  youtube: "YT", twitter: "X", threads: "TH", pinterest: "PI",
};

const FORMATS = [
  { v: "post", label: "Post" },
  { v: "video", label: "Video" },
  { v: "story", label: "Story" },
  { v: "carousel", label: "Carousel" },
];

const ADMIN_STATUSES: { value: ItemStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
];

const STATUS_DOT: Record<ItemStatus, string> = {
  draft: "bg-ink-400", requested: "bg-brand", in_review: "bg-warn-600",
  approved: "bg-ok-600", changes_requested: "bg-stop-600",
  scheduled: "bg-ink-700", published: "bg-ink-900",
};

const CAPTION_LIMIT = 2200;

export function ComposerModal({
  mode,
  itemId,
  brandName,
  brandColor,
  handle,
  initial,
  media,
  closeHref,
  uploadToken,
  onSave,
  primaryLabel,
  primarySetsStatus,
  activity,
  pillars = [],
  initialTab,
  variants = {},
  onSaveVariant,
}: {
  mode: "admin" | "client";
  itemId: string;
  brandName: string;
  brandColor: string;
  handle?: string | null;
  initial: ComposerValues;
  media: ItemMedia[];
  closeHref: string;
  uploadToken?: string;
  onSave: (values: ComposerValues) => Promise<{ ok: boolean; error?: string }>;
  primaryLabel: string;
  /** When the primary button also advances the post, e.g. draft → in review. */
  primarySetsStatus?: ItemStatus;
  /** Comments and approval history, rendered server-side. */
  activity?: React.ReactNode;
  /** This client's content pillars. Empty hides the row entirely. */
  pillars?: ContentPillar[];
  /** Open on a specific tab, e.g. straight into the conversation. */
  initialTab?: "post" | "internal" | "activity";
  /** Existing per-platform caption overrides, keyed by platform. */
  variants?: Record<string, { caption: string; hashtags: string[] }>;
  onSaveVariant?: (
    platform: string,
    caption: string,
    hashtags: string[],
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  // `?tab=activity` lets the list's comment bubble open straight into the
  // conversation rather than dropping you on the editor.
  const [tab, setTab] = useState<"post" | "internal" | "activity">(
    initialTab === "activity" && activity ? "activity" : "post",
  );
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [v, setV] = useState<ComposerValues>(initial);
  const [tagDraft, setTagDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");

  const set = <K extends keyof ComposerValues>(k: K, value: ComposerValues[K]) =>
    setV((prev) => ({ ...prev, [k]: value }));

  const close = () => router.push(closeHref);

  // Escape closes, matching every other modal the user has ever used.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeHref]);

  const mediaSrc = (id: string) =>
    uploadToken ? `/api/media/${id}?t=${encodeURIComponent(uploadToken)}` : `/api/media/${id}`;

  async function upload(files: FileList | File[] | null) {
    if (!files || (files as FileList).length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files as FileList)) {
        const body = new FormData();
        body.set("itemId", itemId);
        body.set("file", file);
        if (uploadToken) body.set("token", uploadToken);
        const res = await fetch("/api/upload", { method: "POST", body });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          push({ message: err.error ?? `Upload failed (${res.status})` });
        }
      }
      router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeMedia(mediaId: string) {
    const qs = new URLSearchParams({ mediaId });
    if (uploadToken) qs.set("token", uploadToken);
    await fetch(`/api/upload?${qs}`, { method: "DELETE" });
    router.refresh();
  }

  function addChips(
    raw: string,
    key: "hashtags" | "labels",
    clear: (s: string) => void,
  ) {
    const next = raw
      .split(/[,\n]+/)
      .map((t) => t.replace(/^#+/, "").trim())
      .filter(Boolean);
    if (next.length === 0) return;
    set(key, Array.from(new Set([...v[key], ...next])));
    clear("");
  }

  function save() {
    startTransition(async () => {
      const payload = primarySetsStatus ? { ...v, status: primarySetsStatus } : v;
      const res = await onSave(payload);
      if (!res.ok) {
        push({ message: res.error ?? "Couldn't save" });
        return;
      }
      push({ message: primarySetsStatus === "in_review" ? "Sent for approval" : "Saved" });
      router.push(closeHref);
      router.refresh();
    });
  }

  const captionCount = v.caption.length;
  const over = captionCount > CAPTION_LIMIT;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="fixed inset-0 bg-ink-950/40"
      />

      <div className="relative flex w-full max-w-4xl gap-3">
        {/* Platform rail */}
        <div className="hidden shrink-0 flex-col gap-2 pt-2 sm:flex">
          {v.platforms.map((p) => (
            <button
              key={p}
              type="button"
              title={NETWORK_LABEL[p] ?? p}
              onClick={() => set("platforms", v.platforms.filter((x) => x !== p))}
              className="grid size-11 place-items-center rounded-xl bg-white text-[11px] font-bold text-ink-700 shadow-lift ring-2 ring-brand"
            >
              {PLATFORM_MARK[p] ?? p.slice(0, 2).toUpperCase()}
            </button>
          ))}
          <details className="relative">
            <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-xl bg-white/70 text-ink-400 shadow-lift transition hover:text-ink-900">
              <PlusIcon size={17} />
            </summary>
            <div className="popover absolute left-0 top-12 z-10 w-40 rounded-xl border border-ink-200 bg-white p-1 shadow-pop [--transform-origin:top_left]">
              {PLATFORMS.filter((p) => !v.platforms.includes(p)).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set("platforms", [...v.platforms, p])}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-body text-ink-700 transition hover:bg-ink-100"
                >
                  {NETWORK_LABEL[p] ?? p}
                </button>
              ))}
            </div>
          </details>
        </div>

        {/* Card */}
        <div className="animate-rise flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-pop">
          <header className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
            <div className="flex items-center gap-0.5 rounded-lg bg-ink-100 p-0.5">
              {(["post", "internal", "activity"] as const)
                .filter((t) => {
                  if (t === "internal") return mode === "admin";
                  if (t === "activity") return Boolean(activity);
                  return true;
                })
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "rounded-md px-3 py-1 text-[13px] font-medium capitalize transition",
                      tab === t ? "bg-white text-ink-900 shadow-lift" : "text-ink-500",
                    )}
                  >
                    {t}
                  </button>
                ))}
            </div>

            <span className="flex-1" />

            <span className="hidden items-center gap-1.5 text-small text-ink-400 sm:flex">
              <MessageIcon size={14} />
              {brandName}
            </span>
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition",
                preview ? "bg-ink-950 text-white" : "text-ink-500 hover:bg-ink-100",
              )}
            >
              <PreviewIcon size={14} /> Preview
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid size-8 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
            >
              <CloseIcon size={17} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
            {preview ? (
              <PlatformPreview
                platforms={v.platforms}
                format={v.format}
                brandName={brandName}
                brandColor={brandColor}
                handle={handle}
                caption={v.caption}
                hashtags={v.hashtags}
                media={media}
                mediaSrc={mediaSrc}
              />
            ) : tab === "post" ? (
              <>
                <input
                  value={v.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Untitled"
                  aria-label="Title"
                  className="w-full border-0 bg-transparent p-0 text-[28px] font-bold text-ink-900 outline-none placeholder:text-ink-300"
                />

                <dl className="mt-5 flex flex-col">
                  <Row icon={<DotIcon size={15} />} label="Status">
                    {mode === "admin" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-ink-100 py-1 pl-2 pr-1">
                        <span className={cn("size-1.5 rounded-full", STATUS_DOT[v.status])} />
                        <select
                          value={v.status}
                          onChange={(e) => set("status", e.target.value as ItemStatus)}
                          className="border-0 bg-transparent py-0 pl-0 pr-5 text-[13px] font-medium text-ink-900 outline-none"
                        >
                          {ADMIN_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-soft px-2 py-1 text-[13px] font-medium text-ink-700">
                        <span className="size-1.5 rounded-full bg-brand" />
                        Request — we review this
                      </span>
                    )}
                  </Row>

                  <Row icon={<TypeIcon size={15} />} label="Type">
                    <div className="flex flex-wrap gap-1">
                      {FORMATS.map((f) => (
                        <button
                          key={f.v}
                          type="button"
                          onClick={() => set("format", f.v)}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-[13px] font-medium transition",
                            v.format === f.v
                              ? "bg-brand-soft text-ink-900"
                              : "text-ink-500 hover:bg-ink-100",
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </Row>

                  <Row icon={<ClockIcon size={15} />} label="Schedule">
                    <input
                      type="datetime-local"
                      value={v.scheduledFor}
                      onChange={(e) => set("scheduledFor", e.target.value)}
                      className="rounded-md border-0 bg-transparent px-1 py-0.5 text-[13px] text-ink-900 outline-none hover:bg-ink-100 focus:bg-ink-100"
                    />
                  </Row>

                  {pillars.length > 0 && (
                    <Row icon={<PillarIcon size={15} />} label="Pillar">
                      <div className="flex flex-wrap gap-1">
                        {pillars.map((p) => {
                          const on = v.pillarId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => set("pillarId", on ? null : p.id)}
                              className={cn(
                                "rounded-md px-2.5 py-1 text-[13px] font-medium transition",
                                on ? "text-white" : "text-ink-500 hover:bg-ink-100",
                              )}
                              style={on ? { background: p.color } : undefined}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </Row>
                  )}

                  <Row icon={<TagIcon size={15} />} label="Labels">
                    <ChipInput
                      values={v.labels}
                      draft={labelDraft}
                      setDraft={setLabelDraft}
                      onCommit={(raw) => addChips(raw, "labels", setLabelDraft)}
                      onRemove={(x) => set("labels", v.labels.filter((l) => l !== x))}
                      placeholder="Empty"
                    />
                  </Row>

                  <Row icon={<HashtagIcon size={15} />} label="Hashtags">
                    <ChipInput
                      values={v.hashtags}
                      prefix="#"
                      draft={tagDraft}
                      setDraft={setTagDraft}
                      onCommit={(raw) => addChips(raw, "hashtags", setTagDraft)}
                      onRemove={(x) => set("hashtags", v.hashtags.filter((h) => h !== x))}
                      placeholder="Empty"
                    />
                  </Row>

                  <Row icon={<MediaAddIcon size={15} />} label="Media">
                    <div className="flex flex-wrap items-start gap-2">
                      {media.map((m) => (
                        <div key={m.id} className="group relative">
                          <span className="grid size-16 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-ink-100 text-[9px] font-semibold text-ink-500">
                            {m.mime_type.startsWith("image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={mediaSrc(m.id)} alt="" className="size-full object-cover" />
                            ) : (
                              m.mime_type.split("/")[1]?.slice(0, 4).toUpperCase()
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeMedia(m.id)}
                            aria-label="Remove attachment"
                            className="absolute -right-1.5 -top-1.5 rounded-full bg-stop-600 p-0.5 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                          >
                            <TrashIcon size={10} />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          void upload(e.dataTransfer.files);
                        }}
                        className={cn(
                          "grid h-24 w-28 place-items-center rounded-lg border border-dashed px-2 text-center transition",
                          dragging
                            ? "border-brand bg-brand-soft"
                            : "border-ink-300 text-ink-400 hover:border-ink-900 hover:text-ink-900",
                        )}
                      >
                        {uploading ? (
                          <RefreshIcon size={18} className="animate-spin" />
                        ) : (
                          <span className="flex flex-col items-center gap-1">
                            <MediaAddIcon size={18} />
                            <span className="text-[11px] leading-tight">
                              Drag &amp; drop or{" "}
                              <span className="font-semibold text-brand underline">
                                select media
                              </span>
                            </span>
                          </span>
                        )}
                      </button>

                      <input
                        ref={fileRef}
                        type="file"
                        multiple
                        accept="image/*,video/mp4,video/quicktime,application/pdf"
                        onChange={(e) => upload(e.target.files)}
                        className="hidden"
                      />
                    </div>
                  </Row>
                </dl>

                <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
                  <span className="flex items-center gap-2 text-body text-ink-500">
                    <span className="text-ink-400">☰</span> Caption
                  </span>
                  <span
                    className={cn(
                      "rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-medium tabular-nums",
                      over ? "text-stop-600" : "text-ink-500",
                    )}
                  >
                    {captionCount}/{CAPTION_LIMIT}
                  </span>
                </div>

                <textarea
                  value={v.caption}
                  onChange={(e) => set("caption", e.target.value)}
                  rows={8}
                  aria-label="Caption"
                  placeholder="Write your content here…"
                  className="mt-2 w-full resize-y border-0 bg-transparent p-0 text-body leading-relaxed text-ink-900 outline-none placeholder:text-ink-300"
                />

                {mode === "admin" && onSaveVariant && v.platforms.length > 1 && (
                  <VariantEditor
                    platforms={v.platforms}
                    master={v.caption}
                    variants={variants}
                    onSave={onSaveVariant}
                  />
                )}
              </>
            ) : tab === "activity" ? (
              activity
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-body text-ink-500">
                  Nothing on this tab is ever shown to {brandName}.
                </p>
                <label>
                  <span className="mb-1.5 block text-small font-medium text-ink-500">
                    Internal note
                  </span>
                  <textarea
                    value={v.internalNote}
                    onChange={(e) => set("internalNote", e.target.value)}
                    rows={6}
                    placeholder="Context for the team — where the footage came from, what to watch for…"
                    className="w-full resize-y rounded-xl border border-ink-200 bg-ink-50 p-3 text-body outline-none focus:border-ink-900 focus:bg-white"
                  />
                </label>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-ink-100 px-4 py-3">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-ink-500 transition hover:bg-ink-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-[var(--brand-on,#fff)] transition active:scale-[0.98] disabled:opacity-60"
            >
              {isPending ? "Saving…" : primaryLabel}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-channel caption overrides.
 *
 * A post going to three networks is usually three pieces of writing — LinkedIn
 * wants context, Instagram wants a hook, X wants brevity. Collapsed by default
 * so the common case (one caption everywhere) stays a single box, and each
 * channel falls back to the master until you deliberately override it.
 */
function VariantEditor({
  platforms,
  master,
  variants,
  onSave,
}: {
  platforms: string[];
  master: string;
  variants: Record<string, { caption: string; hashtags: string[] }>;
  onSave: (
    platform: string,
    caption: string,
    hashtags: string[],
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { push } = useToast();
  const [open, setOpen] = useState(() => Object.keys(variants).length > 0);
  const [active, setActive] = useState(platforms[0]);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(variants).map(([k, val]) => [k, val.caption])),
  );
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-xl border border-dashed border-ink-300 py-2.5 text-body text-ink-500 transition hover:border-ink-900 hover:text-ink-900"
      >
        Write a different caption per channel
      </button>
    );
  }

  const current = drafts[active] ?? "";
  const overridden = current.trim().length > 0;

  return (
    <div className="mt-4 rounded-xl bg-ink-50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {platforms.map((p) => {
          const has = (drafts[p] ?? "").trim().length > 0;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setActive(p)}
              className={cn(
                "rounded-md px-2.5 py-1 text-small font-medium transition",
                active === p ? "bg-white text-ink-900 shadow-lift" : "text-ink-500",
              )}
            >
              {NETWORK_LABEL[p] ?? p}
              {has && <span className="ml-1 text-brand">•</span>}
            </button>
          );
        })}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1 text-small text-ink-400 transition hover:text-ink-900"
        >
          Hide
        </button>
      </div>

      <textarea
        value={current}
        onChange={(e) => setDrafts({ ...drafts, [active]: e.target.value })}
        rows={5}
        aria-label={`${active} caption`}
        placeholder={master ? `Falls back to: ${master.slice(0, 80)}…` : "Same as the main caption"}
        className="w-full resize-y rounded-lg bg-white p-2.5 text-body leading-relaxed text-ink-900 outline-none ring-1 ring-inset ring-transparent focus:ring-ink-300 placeholder:text-ink-400"
      />

      <div className="mt-2 flex items-center gap-2">
        <span className="flex-1 text-small text-ink-400">
          {overridden
            ? `${current.length} characters · overrides the main caption`
            : "Empty — this channel uses the main caption"}
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await onSave(active, current, []);
              push({
                message: res.ok
                  ? overridden
                    ? `${NETWORK_LABEL[active] ?? active} caption saved`
                    : `${NETWORK_LABEL[active] ?? active} reset to the main caption`
                  : (res.error ?? "Couldn't save"),
              });
            })
          }
          className="rounded-lg bg-ink-950 px-3 py-1.5 text-small font-medium text-white transition disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save channel"}
        </button>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <dt className="flex w-32 shrink-0 items-center gap-2 pt-1 text-body text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function ChipInput({
  values,
  draft,
  setDraft,
  onCommit,
  onRemove,
  placeholder,
  prefix = "",
}: {
  values: string[];
  draft: string;
  setDraft: (s: string) => void;
  onCommit: (raw: string) => void;
  onRemove: (value: string) => void;
  placeholder: string;
  prefix?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((x) => (
        <span
          key={x}
          className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-[13px] font-medium text-ink-700"
        >
          {prefix}
          {x}
          <button
            type="button"
            aria-label={`Remove ${prefix}${x}`}
            onClick={() => onRemove(x)}
            className="text-ink-400 transition hover:text-stop-600"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            onCommit(draft);
          } else if (e.key === "Backspace" && !draft && values.length) {
            onRemove(values[values.length - 1]);
          }
        }}
        onBlur={() => onCommit(draft)}
        placeholder={values.length ? "" : placeholder}
        className="min-w-20 flex-1 border-0 bg-transparent px-1 py-0.5 text-[13px] outline-none placeholder:text-ink-400"
      />
    </div>
  );
}

