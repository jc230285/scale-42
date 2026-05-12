"use client";

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced 10-min-throttled auto-publish — call after any CMS write. */
export function scheduleAutoPublish() {
  if (typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    fetch("/api/publish/maybe", { method: "POST" }).catch(() => {});
  }, 5000);
}
