// One of: 'cms' (login + inline edit), 'preview' (login + view drafts), 'live' (public static)
// Set per-deploy via NEXT_PUBLIC_MODE env var. Falls back to 'preview' in dev.

export type Mode = "cms" | "preview" | "live";

export function getMode(): Mode {
  const m = (process.env.NEXT_PUBLIC_MODE || "preview").toLowerCase();
  if (m === "cms" || m === "preview" || m === "live") return m;
  return "preview";
}

export const isCms = () => getMode() === "cms";
export const isPreview = () => getMode() === "preview";
export const isLive = () => getMode() === "live";

// Both cms and preview need authentication; live does not.
export const requiresAuth = () => getMode() !== "live";
