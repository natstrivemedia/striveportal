/**
 * Chart palette — the validated categorical slots, assigned in fixed order.
 *
 * Verified with the dataviz validator against the white chart surface:
 *   lightness band PASS · chroma floor PASS
 *   CVD separation PASS (worst adjacent ΔE 9.1, protan)
 *   normal-vision floor PASS (worst adjacent ΔE 22.9)
 *   contrast WARN on aqua (2.82) and yellow (2.17) vs #ffffff
 *
 * That contrast warning is not dismissable: it obligates relief, which is why
 * every line chart here ships direct end-labels and a legend rather than relying
 * on the stroke colour alone to identify a series.
 *
 * Networks are assigned to slots by a fixed map, not by iteration order, so a
 * client who drops LinkedIn never sees Instagram change colour.
 */

export const SERIES_SLOTS = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
] as const;

const NETWORK_SLOT: Record<string, number> = {
  instagram: 0,
  facebook: 1,
  linkedin: 2,
  tiktok: 3,
  youtube: 4,
  twitter: 5,
  threads: 5,
  pinterest: 5,
};

export function networkColor(network: string): string {
  const slot = NETWORK_SLOT[network.toLowerCase()];
  return SERIES_SLOTS[slot ?? 0];
}

export const NETWORK_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X",
  threads: "Threads",
  pinterest: "Pinterest",
};

export function networkLabel(network: string): string {
  return NETWORK_LABEL[network.toLowerCase()] ?? network;
}

/** Chart chrome — recessive by design so the data carries the contrast. */
export const CHROME = {
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  ink: "#0b0b0b",
  surface: "#ffffff",
} as const;
