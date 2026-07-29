"use client";

/**
 * Per-platform post previews.
 *
 * Each network crops, truncates and frames a post differently, and those
 * differences are exactly what clients comment on. Showing a generic card hides
 * the two things that actually go wrong: a caption cut off at the fold, and a
 * 4:5 image squared off at the edges.
 *
 * Chrome is deliberately schematic — enough to judge framing and length,
 * without imitating any platform's branding.
 */

import { useState } from "react";
import { SaveIcon, HeartIcon, CommentIcon, RepostIcon, SendIcon, ThumbIcon } from "@/components/icons";
import type { ItemMedia } from "@/lib/types";
import { NETWORK_LABEL } from "@/components/charts/palette";
import { cn } from "@/lib/utils";

type Props = {
  platforms: string[];
  format: string;
  brandName: string;
  brandColor: string;
  handle?: string | null;
  caption: string;
  hashtags: string[];
  media: ItemMedia[];
  mediaSrc: (id: string) => string;
};

/** Where each network visually truncates a caption before "…more". */
const FOLD: Record<string, number> = {
  instagram: 125,
  facebook: 250,
  linkedin: 210,
  tiktok: 100,
  twitter: 280,
  threads: 190,
  youtube: 150,
  pinterest: 150,
};

export function PlatformPreview(props: Props) {
  const available = props.platforms.length > 0 ? props.platforms : ["instagram"];
  const [active, setActive] = useState(available[0]);
  const platform = available.includes(active) ? active : available[0];

  return (
    <div>
      {available.length > 1 && (
        <div className="mb-3 flex flex-wrap justify-center gap-1">
          {available.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setActive(p)}
              className={cn(
                "rounded-full px-3 py-1 text-small font-medium transition",
                platform === p
                  ? "bg-ink-950 text-white"
                  : "bg-ink-100 text-ink-500 hover:text-ink-900",
              )}
            >
              {NETWORK_LABEL[p] ?? p}
            </button>
          ))}
        </div>
      )}

      <Frame platform={platform} {...props} />
    </div>
  );
}

function body(caption: string, hashtags: string[]): string {
  return [caption, hashtags.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");
}

function Media({
  media,
  mediaSrc,
  ratio,
  rounded,
}: {
  media: ItemMedia[];
  mediaSrc: (id: string) => string;
  ratio: string;
  rounded?: string;
}) {
  const first = media[0];
  return (
    <div
      className={cn("w-full overflow-hidden bg-ink-100", rounded)}
      style={{ aspectRatio: ratio }}
    >
      {first && first.mime_type.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaSrc(first.id)} alt="" className="size-full object-cover" />
      ) : first && first.mime_type.startsWith("video/") ? (
        <video src={mediaSrc(first.id)} className="size-full object-cover" muted playsInline />
      ) : (
        <div className="grid size-full place-items-center text-small text-ink-400">
          No artwork yet
        </div>
      )}
    </div>
  );
}

function Truncated({
  text,
  limit,
  className,
}: {
  text: string;
  limit: number;
  className?: string;
}) {
  if (!text) {
    return <span className="text-ink-400">Caption preview…</span>;
  }
  const over = text.length > limit;
  return (
    <span className={className}>
      <span className="whitespace-pre-wrap">{over ? text.slice(0, limit) : text}</span>
      {over && (
        <>
          <span className="whitespace-pre-wrap text-ink-400">{text.slice(limit)}</span>
          {/* The fold is the point most readers stop — worth seeing while writing. */}
          <span className="ml-1 rounded bg-warn-100 px-1 text-[10px] font-semibold text-warn-600">
            cut at {limit}
          </span>
        </>
      )}
    </span>
  );
}

function Avatar({ brandName, brandColor }: { brandName: string; brandColor: string }) {
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full text-small font-bold text-white"
      style={{ background: brandColor }}
    >
      {brandName.slice(0, 1)}
    </span>
  );
}

function Frame({
  platform,
  format,
  brandName,
  brandColor,
  handle,
  caption,
  hashtags,
  media,
  mediaSrc,
}: Props & { platform: string }) {
  const text = body(caption, hashtags);
  const limit = FOLD[platform] ?? 200;
  const name = handle ?? brandName;

  // Vertical formats get a 9:16 frame regardless of network.
  const vertical = format === "story" || format === "reel" || platform === "tiktok";

  if (vertical) {
    return (
      <div className="mx-auto w-56 overflow-hidden rounded-2xl border border-ink-200 bg-ink-950">
        <div className="relative">
          <Media media={media} mediaSrc={mediaSrc} ratio="9 / 16" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/85 to-transparent p-3">
            <div className="flex items-center gap-2">
              <Avatar brandName={brandName} brandColor={brandColor} />
              <span className="truncate text-small font-semibold text-white">{name}</span>
            </div>
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-white/90">
              {text || "Caption preview…"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (platform === "linkedin") {
    return (
      <Shell>
        <div className="flex items-center gap-2 p-3">
          <Avatar brandName={brandName} brandColor={brandColor} />
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-ink-900">{brandName}</p>
            <p className="text-[11px] text-ink-400">1,234 followers · Now</p>
          </div>
        </div>
        <p className="px-3 pb-2 text-[13px] leading-relaxed text-ink-900">
          <Truncated text={text} limit={limit} />
        </p>
        <Media media={media} mediaSrc={mediaSrc} ratio="1.91 / 1" />
        <div className="flex items-center gap-4 border-t border-ink-100 px-3 py-2 text-ink-400">
          <ThumbIcon size={15} />
          <CommentIcon size={15} />
          <RepostIcon size={15} />
          <SendIcon size={15} />
        </div>
      </Shell>
    );
  }

  if (platform === "twitter" || platform === "threads") {
    return (
      <Shell>
        <div className="flex gap-2.5 p-3">
          <Avatar brandName={brandName} brandColor={brandColor} />
          <div className="min-w-0 flex-1">
            <p className="text-body">
              <span className="font-semibold text-ink-900">{brandName}</span>{" "}
              <span className="text-ink-400">@{name} · now</span>
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-900">
              <Truncated text={text} limit={limit} />
            </p>
            {media.length > 0 && (
              <div className="mt-2">
                <Media
                  media={media}
                  mediaSrc={mediaSrc}
                  ratio="16 / 9"
                  rounded="rounded-xl border border-ink-200"
                />
              </div>
            )}
            <div className="mt-2 flex items-center gap-6 text-ink-400">
              <CommentIcon size={14} />
              <RepostIcon size={14} />
              <HeartIcon size={14} />
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (platform === "facebook") {
    return (
      <Shell>
        <div className="flex items-center gap-2 p-3">
          <Avatar brandName={brandName} brandColor={brandColor} />
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-ink-900">{brandName}</p>
            <p className="text-[11px] text-ink-400">Just now · Public</p>
          </div>
        </div>
        <p className="px-3 pb-2 text-[13px] leading-relaxed text-ink-900">
          <Truncated text={text} limit={limit} />
        </p>
        <Media media={media} mediaSrc={mediaSrc} ratio="1.91 / 1" />
        <div className="flex items-center gap-4 border-t border-ink-100 px-3 py-2 text-ink-400">
          <ThumbIcon size={15} />
          <CommentIcon size={15} />
          <SendIcon size={15} />
        </div>
      </Shell>
    );
  }

  // Instagram and anything else: square by default, 4:5 for portrait posts.
  return (
    <Shell>
      <div className="flex items-center gap-2 p-2.5">
        <Avatar brandName={brandName} brandColor={brandColor} />
        <span className="truncate text-body font-semibold text-ink-900">{name}</span>
      </div>
      <Media media={media} mediaSrc={mediaSrc} ratio={format === "carousel" ? "4 / 5" : "1 / 1"} />
      <div className="flex items-center gap-3 px-2.5 pt-2.5 text-ink-700">
        <HeartIcon size={18} />
        <CommentIcon size={18} />
        <SendIcon size={18} />
        <span className="flex-1" />
        <SaveIcon size={18} />
      </div>
      <p className="px-2.5 pb-3 pt-2 text-[13px] leading-relaxed text-ink-900">
        <span className="font-semibold">{name}</span>{" "}
        <Truncated text={text} limit={limit} />
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-xl border border-ink-200 bg-white">
      {children}
    </div>
  );
}
