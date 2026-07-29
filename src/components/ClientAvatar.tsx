import { cn } from "@/lib/utils";

/**
 * A client's mark: their uploaded logo, falling back to the first letter on
 * their brand colour. One component so the fallback is identical everywhere
 * and adding a logo updates every surface at once.
 */
export function ClientAvatar({
  id,
  name,
  color,
  hasLogo,
  size = 36,
  className,
  rounded = "rounded-xl",
}: {
  id: string;
  name: string;
  color: string;
  hasLogo: boolean;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  if (hasLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/logo/${id}`}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn("shrink-0 object-contain", rounded, className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
      className={cn(
        "grid shrink-0 place-items-center font-bold text-white",
        rounded,
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
