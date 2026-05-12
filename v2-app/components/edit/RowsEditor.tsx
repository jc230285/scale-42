"use client";
import { useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";

export type Col = {
  key: string;
  label: string;
  type?: "text" | "number" | "bool" | "longtext" | "html";
  w?: string;
};

type Row = Record<string, any>;

export default function RowsEditor({
  table,
  initial,
  cols,
  filterKeys,
  defaults,
  pk = "id",
  reorder = true,
}: {
  table: string;
  initial: Row[];
  cols: Col[];
  filterKeys: string[];
  defaults: Row;
  pk?: string;
  reorder?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "order_idx",
    dir: "asc",
  });
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ id: any; key: string } | null>(null);

  const sb = getBrowserClient();

  const view = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let v = rows.slice();
    if (f) {
      v = v.filter((r) =>
        filterKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(f)),
      );
    }
    v.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number")
        return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return v;
  }, [rows, sort, filter, filterKeys]);

  async function save(id: any, key: string, value: any) {
    setSaving((s) => ({ ...s, [id + key]: true }));
    const { error } = await sb.from(table).update({ [key]: value }).eq(pk, id);
    setSaving((s) => ({ ...s, [id + key]: false }));
    if (error) {
      alert(`Save failed: ${error.message}`);
      setRows((r) => r.slice());
    }
  }

  function updateLocal(id: any, key: string, value: any) {
    setRows((r) => r.map((x) => (x[pk] === id ? { ...x, [key]: value } : x)));
  }

  function toggleSort(key: string) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  async function addNew() {
    const payload: Row = { ...defaults, order_idx: rows.length };
    const { data, error } = await sb.from(table).insert(payload).select().single();
    if (error) return alert(error.message);
    setRows((r) => [...r, data]);
  }

  async function remove(id: any, label: string) {
    if (!confirm(`Delete "${label}"?`)) return;
    const { error } = await sb.from(table).delete().eq(pk, id);
    if (error) return alert(error.message);
    setRows((r) => r.filter((x) => x[pk] !== id));
  }

  async function move(id: any, dir: -1 | 1) {
    const sorted = [...rows].sort((a, b) => (a.order_idx ?? 0) - (b.order_idx ?? 0));
    const i = sorted.findIndex((r) => r[pk] === id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    const aIdx = a.order_idx ?? i;
    const bIdx = b.order_idx ?? j;
    await Promise.all([
      sb.from(table).update({ order_idx: bIdx }).eq(pk, a[pk]),
      sb.from(table).update({ order_idx: aIdx }).eq(pk, b[pk]),
    ]);
    setRows((r) =>
      r.map((x) =>
        x[pk] === a[pk]
          ? { ...x, order_idx: bIdx }
          : x[pk] === b[pk]
          ? { ...x, order_idx: aIdx }
          : x,
      ),
    );
  }

  return (
    <div>
      <div className="flex gap-3 mb-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="border border-line rounded-md px-3 py-2 text-sm flex-1 max-w-md bg-white"
        />
        <button
          onClick={addNew}
          className="bg-ink text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-accent"
        >
          + Add
        </button>
      </div>

      <div className="bg-white border border-line rounded-md overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-bgalt sticky top-0 border-b border-line">
            <tr>
              {reorder && <th className="px-2 w-12"></th>}
              {cols.map((c) => (
                <th
                  key={c.key}
                  className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wider text-muted cursor-pointer hover:text-ink select-none"
                  style={{ minWidth: c.w }}
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r[pk]} className="border-b border-line hover:bg-bgalt/50 align-top">
                {reorder && (
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => move(r[pk], -1)}
                      className="text-muted hover:text-ink text-xs px-1"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(r[pk], 1)}
                      className="text-muted hover:text-ink text-xs px-1"
                      title="Move down"
                    >
                      ▼
                    </button>
                  </td>
                )}
                {cols.map((c) => {
                  const val = r[c.key];
                  const k = r[pk] + c.key;
                  if (c.type === "bool") {
                    return (
                      <td key={c.key} className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={!!val}
                          onChange={(e) => {
                            updateLocal(r[pk], c.key, e.target.checked);
                            save(r[pk], c.key, e.target.checked);
                          }}
                        />
                      </td>
                    );
                  }
                  if (c.type === "longtext" || c.type === "html") {
                    const isEditing =
                      editing && editing.id === r[pk] && editing.key === c.key;
                    if (!isEditing) {
                      const preview = String(val ?? "").slice(0, 80);
                      return (
                        <td
                          key={c.key}
                          className="px-3 py-1.5 text-muted cursor-pointer hover:bg-bgalt"
                          onClick={() => setEditing({ id: r[pk], key: c.key })}
                        >
                          {preview || <span className="text-muted/50">click to edit</span>}
                          {String(val ?? "").length > 80 ? "…" : ""}
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} className="px-1 py-0.5" colSpan={1}>
                        <textarea
                          autoFocus
                          defaultValue={val ?? ""}
                          rows={c.type === "html" ? 12 : 4}
                          onBlur={(e) => {
                            const next = e.target.value;
                            setEditing(null);
                            if (next !== (val ?? "")) {
                              updateLocal(r[pk], c.key, next);
                              save(r[pk], c.key, next);
                            }
                          }}
                          className={`w-full px-2 py-1 rounded border border-accent ${
                            saving[k] ? "bg-yellow-50" : "bg-white"
                          } font-mono text-xs outline-none`}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className="px-1 py-0.5">
                      <input
                        type={c.type === "number" ? "number" : "text"}
                        defaultValue={val ?? ""}
                        onBlur={(e) => {
                          const next =
                            c.type === "number"
                              ? e.target.value === ""
                                ? null
                                : Number(e.target.value)
                              : e.target.value;
                          if (next !== val) {
                            updateLocal(r[pk], c.key, next);
                            save(r[pk], c.key, next);
                          }
                        }}
                        className={`w-full px-2 py-1 rounded ${
                          saving[k] ? "bg-yellow-50" : "bg-transparent"
                        } hover:bg-bgalt focus:bg-white focus:border focus:border-accent outline-none`}
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-1.5">
                  <button
                    onClick={() =>
                      remove(r[pk], r.name || r.title_en || r.slug || r[pk])
                    }
                    className="text-red-600 text-xs hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted mt-2">
        Edits auto-save on blur. Yellow = saving. ▲▼ reorders.
      </p>
    </div>
  );
}
