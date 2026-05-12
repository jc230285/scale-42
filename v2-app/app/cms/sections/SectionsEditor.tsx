"use client";
import { useState } from "react";

type Row = { page: string; key: string; value_en: string | null };

export default function SectionsEditor({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  async function save(page: string, key: string, value: string) {
    const id = `${page}:${key}`;
    setSaving((s) => ({ ...s, [id]: true }));
    const r = await fetch("/api/cms/section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, key, value }),
    });
    setSaving((s) => ({ ...s, [id]: false }));
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(`Save failed: ${j.error ?? r.statusText}`);
    }
  }

  function isFormula(v: string | null) {
    return /\{\{[a-z0-9_]+\}\}/.test(v ?? "");
  }

  return (
    <div className="bg-white border border-line rounded-md overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-bgalt">
          <tr>
            <th className="px-3 py-2 text-left text-xs uppercase text-muted">Page</th>
            <th className="px-3 py-2 text-left text-xs uppercase text-muted">Key</th>
            <th className="px-3 py-2 text-left text-xs uppercase text-muted">Value (literal or formula)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const id = `${r.page}:${r.key}`;
            return (
              <tr key={id} className="border-t border-line">
                <td className="px-3 py-2 text-muted">{r.page}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.key}</td>
                <td className="px-1 py-0.5">
                  <input
                    defaultValue={r.value_en ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== r.value_en) {
                        setRows((rs) => rs.map((x) => (x.page === r.page && x.key === r.key ? { ...x, value_en: v } : x)));
                        save(r.page, r.key, v);
                      }
                    }}
                    className={`w-full px-2 py-1 rounded ${saving[id] ? "bg-yellow-50" : "bg-transparent"} ${isFormula(r.value_en) ? "font-mono text-accent" : ""} hover:bg-bgalt focus:bg-white focus:border focus:border-accent outline-none`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
