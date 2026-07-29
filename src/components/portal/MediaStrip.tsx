import { CaptionIcon, MediaIcon } from "@/components/icons";
import type { ItemMedia } from "@/lib/types";

/**
 * Media is served through /api/media/[id], which re-checks entitlement per
 * request, so plain <img> is used rather than next/image — there is no public
 * URL for the optimizer to fetch.
 */
function src(mediaId: string, token: string) {
  return `/api/media/${mediaId}?t=${encodeURIComponent(token)}`;
}

export function MediaStrip({
  media,
  token,
  title,
}: {
  media: ItemMedia[];
  token: string;
  title?: string | null;
}) {
  if (media.length === 0) {
    return (
      <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-ink-200 bg-white text-ink-400">
        <MediaIcon size={28} />
        <p className="px-6 text-center text-body">
          {title ? `“${title}” — artwork coming` : "Artwork coming"}
        </p>
      </div>
    );
  }

  if (media.length === 1) {
    return <MediaOne item={media[0]} token={token} />;
  }

  // Carousels scroll horizontally with snap points — the gesture a client
  // already knows from Instagram.
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
      {media.map((m) => (
        <div key={m.id} className="w-[85%] shrink-0 snap-center sm:w-[60%]">
          <MediaOne item={m} token={token} />
        </div>
      ))}
    </div>
  );
}

function MediaOne({ item, token }: { item: ItemMedia; token: string }) {
  const url = src(item.id, token);

  if (item.mime_type.startsWith("video/")) {
    return (
      <video
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-[20px] bg-ink-950"
        src={url}
      />
    );
  }

  if (item.mime_type === "application/pdf") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-[20px] border border-ink-200 bg-white p-4 transition hover:border-brand"
      >
        <span className="rounded-xl bg-stop-100 p-3 text-stop-600">
          <CaptionIcon size={22} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold text-ink-900">
            {item.file_name ?? "Document"}
          </span>
          <span className="block text-small text-ink-500">
            PDF{item.page_count ? ` · ${item.page_count} pages` : ""} · tap to open
          </span>
        </span>
      </a>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={item.file_name ?? ""}
      width={item.width ?? undefined}
      height={item.height ?? undefined}
      className="w-full rounded-[20px] border border-ink-200 bg-white object-cover"
    />
  );
}
