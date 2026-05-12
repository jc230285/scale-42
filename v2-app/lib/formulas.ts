type SiteRow = { target_mw?: number | null; initial_mw?: number | null; max_capacity_mw?: number | null; country?: string | null; status?: string | null };
type NewsRow = { published?: boolean };
type PeopleRow = { published?: boolean };

export type FormulaData = {
  sites?: SiteRow[];
  news?: NewsRow[];
  people?: PeopleRow[];
};

function sum(rows: SiteRow[] | undefined, key: "target_mw" | "initial_mw" | "max_capacity_mw") {
  return (rows ?? []).reduce((a, r) => a + (Number(r[key]) || 0), 0);
}

/** Round to a sensible step: 100 for big numbers, 10 for medium, integer otherwise. */
function roundNice(n: number) {
  if (n >= 1000) return Math.round(n / 100) * 100;
  if (n >= 100) return Math.round(n / 10) * 10;
  return Math.round(n);
}

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

const TOKEN_HANDLERS: Record<string, (d: FormulaData) => string> = {
  sum_target_mw:        (d) => fmt(roundNice(sum(d.sites, "target_mw"))),
  sum_initial_mw:       (d) => fmt(roundNice(sum(d.sites, "initial_mw"))),
  sum_max_capacity_mw:  (d) => fmt(roundNice(sum(d.sites, "max_capacity_mw"))),
  count_sites:          (d) => String((d.sites ?? []).length),
  count_active_sites:   (d) => String((d.sites ?? []).filter((s) => (s.status || "").toLowerCase() === "live").length),
  count_countries:      (d) => String(new Set((d.sites ?? []).map((s) => (s.country || "").trim()).filter(Boolean)).size),
  count_news:           (d) => String((d.news ?? []).length),
  count_people:         (d) => String((d.people ?? []).length),
};

export const SUPPORTED_TOKENS = Object.keys(TOKEN_HANDLERS);

/** Replace every {{token}} in text with the computed value. Unknown tokens are
 *  left intact so authors can see the typo. */
export function evalFormulas(text: string, data: FormulaData): string {
  return text.replace(/\{\{([a-z0-9_]+)\}\}/g, (m, token: string) => {
    const handler = TOKEN_HANDLERS[token];
    return handler ? handler(data) : m;
  });
}
