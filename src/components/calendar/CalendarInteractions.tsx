"use client";

/**
 * Drag-to-reschedule and per-cell creation.
 *
 * Both exist so planning happens where you're already looking. Moving a post
 * used to mean opening it, editing a date field, and closing it; now it's a
 * drag. Adding one used to mean a form at the top of the page; now the day you
 * clicked is the day it lands on.
 */

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, CloseIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import {
  createEvent,
  createIdeaFromCalendar,
  createPostOnDate,
  deleteEvent,
  reschedule,
  updateEvent,
} from "@/app/admin/c/[slug]/calendar-actions";
import { cn } from "@/lib/utils";

const DragCtx = createContext<{
  slug: string;
  dragging: string | null;
  setDragging: (id: string | null) => void;
} | null>(null);

export function CalendarProvider({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  return (
    <DragCtx.Provider value={{ slug, dragging, setDragging }}>{children}</DragCtx.Provider>
  );
}

/** Makes a post card draggable. Renders plainly if used outside the provider. */
export function Draggable({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(DragCtx);
  if (!ctx) return <>{children}</>;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
        ctx.setDragging(id);
      }}
      onDragEnd={() => ctx.setDragging(null)}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        ctx.dragging === id && "opacity-40",
      )}
    >
      {children}
    </div>
  );
}

/**
 * A day cell: drop target, and host for the + menu.
 *
 * The + only appears on hover (or focus, so it stays keyboard-reachable) —
 * 42 permanently visible buttons would compete with the content.
 */
export function DayCell({
  isoDate,
  inMonth,
  children,
  className,
}: {
  isoDate: string;
  inMonth: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useContext(DragCtx);
  const router = useRouter();
  const { push } = useToast();
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<null | "idea" | "event">(null);
  const [isPending, startTransition] = useTransition();

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData("text/plain");
    if (!ctx || !id) return;
    ctx.setDragging(null);
    startTransition(async () => {
      const res = await reschedule(ctx.slug, id, isoDate);
      if (!res.ok) push({ message: res.error ?? "Couldn't move it." });
      router.refresh();
    });
  }

  function newPost() {
    if (!ctx) return;
    setMenu(false);
    startTransition(async () => {
      const res = await createPostOnDate(ctx.slug, isoDate);
      if ("error" in res) {
        push({ message: res.error });
        return;
      }
      const params = new URLSearchParams(window.location.search);
      params.set("post", res.id);
      router.push(`${window.location.pathname}?${params}`);
      router.refresh();
    });
  }

  return (
    <div
      onDragOver={(e) => {
        if (!ctx?.dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "group/cell relative",
        className,
        over && "bg-brand-soft ring-1 ring-inset ring-brand",
        isPending && "opacity-60",
      )}
    >
      {inMonth && ctx && (
        <>
          <button
            type="button"
            aria-label={`Add on ${isoDate}`}
            onClick={() => setMenu((m) => !m)}
            className="absolute right-1 top-1 z-10 grid size-5 place-items-center rounded-md text-ink-400 opacity-0 transition hover:bg-ink-100 hover:text-ink-900 focus-visible:opacity-100 group-hover/cell:opacity-100"
          >
            <PlusIcon size={13} />
          </button>

          {menu && (
            <>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setMenu(false)}
                className="fixed inset-0 z-20 cursor-default"
              />
              <div className="popover absolute right-1 top-7 z-30 w-40 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-pop [--transform-origin:top_right]">
                <MenuRow onClick={newPost}>New post</MenuRow>
                <MenuRow onClick={() => { setMenu(false); setDialog("idea"); }}>
                  New idea
                </MenuRow>
                <MenuRow onClick={() => { setMenu(false); setDialog("event"); }}>
                  New event
                </MenuRow>
              </div>
            </>
          )}
        </>
      )}

      {children}

      {dialog === "idea" && ctx && (
        <IdeaDialog slug={ctx.slug} onClose={() => setDialog(null)} />
      )}
      {dialog === "event" && ctx && (
        <EventDialog slug={ctx.slug} isoDate={isoDate} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

/**
 * An event on the calendar. Clicking opens it for editing — an event you can
 * create but not change is worse than no event, because the calendar starts
 * lying as soon as a date moves.
 */
export function EventChip({
  slug,
  event,
}: {
  slug: string;
  event: {
    id: string;
    title: string;
    notes: string;
    color: string;
    starts_on: string;
    ends_on: string | null;
  };
}) {
  const ctx = useContext(DragCtx);
  const [open, setOpen] = useState(false);

  // Read-only outside admin (the client portal renders the same calendar).
  if (!ctx) {
    return (
      <span
        title={event.notes || event.title}
        className="mb-1 block truncate rounded px-1.5 py-0.5 text-small font-medium text-ink-900"
        style={{ background: event.color }}
      >
        {event.title}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={event.notes || `Edit “${event.title}”`}
        className="mb-1 block w-full truncate rounded px-1.5 py-0.5 text-left text-small font-medium text-ink-900 transition hover:brightness-95"
        style={{ background: event.color }}
      >
        {event.title}
      </button>
      {open && (
        <EventDialog
          slug={slug}
          isoDate={event.starts_on}
          existing={event}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MenuRow({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-body text-ink-700 transition hover:bg-ink-100"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function Shell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 bg-ink-950/40"
      />
      {/* Modals stay centre-origin: they aren't anchored to a trigger. */}
      <div className="animate-rise relative w-full max-w-md overflow-hidden rounded-[20px] bg-white shadow-pop">
        <header className="flex items-center justify-between px-5 py-3.5">
          <h2 className="text-h2 font-medium text-ink-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <CloseIcon size={16} />
          </button>
        </header>
        <div className="px-5 pb-4">{children}</div>
        <footer className="flex items-center justify-end gap-2 px-5 pb-4">{footer}</footer>
      </div>
    </div>
  );
}

const fieldCls =
  "w-full rounded-xl bg-ink-50 px-3 py-2.5 text-body outline-none ring-1 ring-inset ring-transparent focus:bg-white focus:ring-ink-300";

function IdeaDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  function save() {
    startTransition(async () => {
      const res = await createIdeaFromCalendar(slug, { title, notes, labels });
      if (!res.ok) {
        push({ message: res.error ?? "Couldn't save." });
        return;
      }
      push({ message: "Idea captured" });
      onClose();
      router.refresh();
    });
  }

  return (
    <Shell
      title="New idea"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="cta text-ink-500 hover:bg-ink-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending || !title.trim()}
            className="cta bg-ink-950 text-white disabled:opacity-40"
          >
            {isPending ? "Saving…" : "Save idea"}
          </button>
        </>
      }
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title of your idea"
        className="w-full border-0 bg-transparent p-0 text-h2 font-medium text-ink-900 outline-none placeholder:text-ink-300"
      />

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {labels.map((l) => (
          <span key={l} className="pill bg-brand-soft px-2 text-ink-700">
            {l}
            <button
              type="button"
              aria-label={`Remove ${l}`}
              onClick={() => setLabels(labels.filter((x) => x !== l))}
              className="text-ink-400 hover:text-stop-600"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
              e.preventDefault();
              setLabels([...new Set([...labels, draft.trim()])]);
              setDraft("");
            }
          }}
          placeholder={labels.length ? "" : "Labels"}
          className="min-w-24 flex-1 border-0 bg-transparent px-1 py-0.5 text-body outline-none placeholder:text-ink-400"
        />
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        placeholder="Start writing, or press / for commands"
        className="mt-3 w-full resize-y border-0 bg-transparent p-0 text-body leading-relaxed text-ink-900 outline-none placeholder:text-ink-300"
      />
    </Shell>
  );
}

/** Pastel palette plus a hex field, so the common case needs no typing. */
const EVENT_COLORS = [
  "#f6c7c7", "#f8ddb0", "#f6f0ae", "#c4e7c8",
  "#b8dff0", "#c9c8f2", "#eec9ef", "#d9d6d0",
];

/**
 * One dialog for both creating and editing.
 *
 * `existing` present means edit: the fields prefill and Delete appears. Keeping
 * it as one component means the two paths can never drift apart in layout or
 * validation.
 */
export function EventDialog({
  slug,
  isoDate,
  existing,
  onClose,
}: {
  slug: string;
  isoDate: string;
  existing?: {
    id: string;
    title: string;
    notes: string;
    color: string;
    starts_on: string;
    ends_on: string | null;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [color, setColor] = useState(existing?.color ?? EVENT_COLORS[0]);
  const [startsOn, setStartsOn] = useState(existing?.starts_on ?? isoDate);
  const [endsOn, setEndsOn] = useState(existing?.ends_on ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function save() {
    startTransition(async () => {
      const values = { title, color, startsOn, endsOn, notes };
      const res = existing
        ? await updateEvent(slug, existing.id, values)
        : await createEvent(slug, values);
      if (!res.ok) {
        push({ message: res.error ?? "Couldn't save." });
        return;
      }
      push({ message: existing ? "Event updated" : "Event added" });
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!existing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    startTransition(async () => {
      await deleteEvent(slug, existing.id);
      push({ message: "Event deleted" });
      onClose();
      router.refresh();
    });
  }

  return (
    <Shell
      title={existing ? "Edit event" : "New event"}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className={cn(
                "cta mr-auto",
                confirmDelete
                  ? "bg-stop-100 text-stop-600"
                  : "text-ink-400 hover:bg-stop-100 hover:text-stop-600",
              )}
            >
              {confirmDelete ? "Click again to delete" : "Delete"}
            </button>
          )}
          <button type="button" onClick={onClose} className="cta text-ink-500 hover:bg-ink-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending || !title.trim()}
            className="cta bg-ink-950 text-white disabled:opacity-40"
          >
            {isPending ? "Saving…" : existing ? "Save changes" : "Create event"}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1 block text-small font-medium text-ink-500">Title</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Campaign launch, holiday, off week…"
          className={fieldCls}
        />
      </label>

      <fieldset className="mt-3">
        <legend className="mb-1.5 text-small font-medium text-ink-500">Colour</legend>
        <div className="flex flex-wrap items-center gap-2">
          {EVENT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              style={{ background: c }}
              className={cn(
                "size-7 rounded-lg ring-offset-2 transition",
                color === c && "ring-2 ring-ink-900",
              )}
            />
          ))}
          <label className="ml-1 flex items-center gap-1.5">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Custom colour"
              className="size-7 cursor-pointer rounded-lg border-0 bg-transparent p-0"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Hex code"
              className="w-20 rounded-lg bg-ink-50 px-2 py-1 text-small uppercase outline-none ring-1 ring-inset ring-transparent focus:bg-white focus:ring-ink-300"
            />
          </label>
        </div>
      </fieldset>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-small font-medium text-ink-500">Starts</span>
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-small font-medium text-ink-500">
            Ends <span className="text-ink-400">(optional)</span>
          </span>
          <input
            type="date"
            value={endsOn}
            min={startsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className={fieldCls}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-small font-medium text-ink-500">
          Notes <span className="text-ink-400">(optional)</span>
        </span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything the team should know"
          className={fieldCls}
        />
      </label>
    </Shell>
  );
}
