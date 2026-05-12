"use client";
import { useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { scheduleAutoPublish } from "@/lib/autoPublish";

type Site = Record<string, any>;
type SortKey = string;

const COLS: { key: string; label: string; type?: "text" | "number" | "bool"; w?: string }[] = [
  { key: "name", label: "Name", w: "200px" },
  { key: "country", label: "Country", w: "120px" },
  { key: "status", label: "Status", w: "120px" },
  { key: "initial_mw", label: "Initial MW", type: "number", w: "100px" },
  { key: "target_mw", label: "Target MW", type: "number", w: "100px" },
  { key: "max_capacity_mw", label: "Max MW", type: "number", w: "100px" },
  { key: "power", label: "Power", w: "160px" },
  { key: "lat", label: "Lat", type: "number", w: "90px" },
  { key: "lng", label: "Lng", type: "number", w: "90px" },
  { key: "published", label: "Published", type: "bool", w: "90px" },
];

export default function SitesTableClient({ initial }: { initial: Site[] }) {
  const [rows, setRows] = useState<Site[]>(initial);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "order_idx", dir: "asc" });
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const sb = getBrowserClient();

  const view = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let v = rows.slice();
    if (f) v = v.filter(r =>
      ["name", "country", "power", "status", "public_location"]
        .some(k => String(r[k] ?? "").toLowerCase().includes(f))
    );
    v.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return v;
  }, [rows, sort, filter]);

  async function save(id: string, key: string, value: any) {
    setSaving(s => ({ ...s, [id + key]: true }));
    const { error } = await sb.from("S42_sites").update({ [key]: value }).eq("id", id);
    setSaving(s => ({ ...s, [id + key]: false }));
    if (error) {
      console.error(error);
      alert(`Save failed: ${error.message}`);
      setRows(r => r.slice());
      return;
    }
    scheduleAutoPublish();
  }

  function updateLocal(id: string, key: string, value: any) {
    setRows(r => r.map(x => x.id === id ? { ...x, [key]: value } : x));
  }

  function toggleSort(key: string) {
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  async function addNew() {
    const { data, error } = await sb.from("S42_sites").insert({ name: "New site", published: false, order_idx: rows.length }).select().single();
    if (error) return alert(error.message);
    setRows(r => [...r, data]);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete ${name}?`)) return;
    const { error } = await sb.from("S42_sites").delete().eq("id", id);
    if (error) return alert(error.message);
    setRows(r => r.filter(x => x.id !== id));
  }

  return (
    <div>
      <div className="flex gap-3 mb-3">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by name, country, power…"
          className="border border-line rounded-md px-3 py-2 text-sm flex-1 max-w-md bg-white"
        />
        <button onClick={addNew} className="bg-ink text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-accent">+ Add site</button>
      </div>

      <div className="bg-white border border-line rounded-md overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-bgalt sticky top-0 border-b border-line">
            <tr>
              {COLS.map(c => (
                <th
                  key={c.key}
                  className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wider text-muted cursor-pointer hover:text-ink select-none"
                  style={{ minWidth: c.w }}
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label}{sort.key === c.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {view.map(r => (
              <tr key={r.id} className="border-b border-line hover:bg-bgalt/50">
                {COLS.map(c => {
                  const val = r[c.key];
                  const k = r.id + c.key;
                  if (c.type === "bool") {
                    return (
                      <td key={c.key} className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={!!val}
                          onChange={e => { updateLocal(r.id, c.key, e.target.checked); save(r.id, c.key, e.target.checked); }}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className="px-1 py-0.5">
                      <input
                        type={c.type === "number" ? "number" : "text"}
                        defaultValue={val ?? ""}
                        onBlur={e => {
                          const next = c.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value;
                          if (next !== val) { updateLocal(r.id, c.key, next); save(r.id, c.key, next); }
                        }}
                        className={`w-full px-2 py-1 rounded ${saving[k] ? "bg-yellow-50" : "bg-transparent"} hover:bg-bgalt focus:bg-white focus:border focus:border-accent outline-none`}
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-1.5">
                  <button onClick={() => remove(r.id, r.name)} className="text-red-600 text-xs hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted mt-2">Edits auto-save on blur. Yellow = saving.</p>
    </div>
  );
}
