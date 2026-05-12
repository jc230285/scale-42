"use client";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";

export function EditToolbar() {
  const [user, setUser] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const sb = getBrowserClient();
    sb.auth.getUser().then(({ data }) => setUser(data.user?.email ?? ""));
  }, []);

  async function logout() {
    await getBrowserClient().auth.signOut();
    window.location.href = "/login";
  }

  async function publish() {
    if (!confirm("Publish all changes to live? This commits a static snapshot to master and redeploys scale-42.com.")) return;
    setBusy(true);
    setStatus("Publishing…");
    try {
      const r = await fetch("/api/publish", { method: "POST" });
      const j = await r.json();
      setStatus(r.ok ? "Published — live redeploying" : `Failed: ${j.error || r.status}`);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(""), 4000);
    }
  }

  return (
    <div className="edit-toolbar">
      <span className="dot" />
      <span>CMS · draft</span>
      {user ? <span className="opacity-70">{user}</span> : null}
      <button onClick={publish} disabled={busy}>{busy ? "…" : "Publish →"}</button>
      <button onClick={logout} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.3)" }}>Sign out</button>
      {status ? <span className="opacity-90">{status}</span> : null}
    </div>
  );
}
