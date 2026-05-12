"use client";
import { useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";

interface Props {
  table: string;
  id: string | number;
  field: string;
  value: string | null;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  placeholder?: string;
}

/**
 * Inline-editable text. Renders read-only in preview/live mode; contenteditable in cms.
 * Saves to Supabase on blur. Falls back to the original value on error.
 */
export function EditableText({ table, id, field, value, className, as = "span", placeholder }: Props) {
  const Tag = as as any;
  const mode = typeof document !== "undefined" ? document.body?.dataset?.mode : undefined;
  const editable = mode === "cms";
  const ref = useRef<HTMLElement>(null);
  const [savedValue, setSavedValue] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSavedValue(value ?? ""); }, [value]);

  if (!editable) {
    return <Tag className={className}>{savedValue || placeholder || ""}</Tag>;
  }

  async function commit() {
    const next = (ref.current?.innerText ?? "").trim();
    if (next === savedValue) return;
    setSaving(true);
    const { error } = await getBrowserClient().from(table).update({ [field]: next }).eq("id", id);
    setSaving(false);
    if (error) {
      console.error("save error", error);
      if (ref.current) ref.current.innerText = savedValue;
    } else {
      setSavedValue(next);
    }
  }

  return (
    <Tag
      ref={ref as any}
      className={`${className ?? ""} edit-chrome ${saving ? "opacity-60" : ""}`}
      contentEditable
      suppressContentEditableWarning
      onBlur={commit}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Escape") { (e.target as HTMLElement).blur(); }
        if (e.key === "Enter" && !e.shiftKey && as !== "p" && as !== "div") {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }}
      data-placeholder={placeholder}
    >
      {savedValue}
    </Tag>
  );
}
