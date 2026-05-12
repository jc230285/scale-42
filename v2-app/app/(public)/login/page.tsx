"use client";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function signIn() {
    setBusy(true);
    setErr("");
    const sb = getBrowserClient();
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "/";
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) { setErr(error.message); setBusy(false); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bgalt p-4">
      <div className="bg-white border border-line rounded-xl shadow-sm p-8 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-ink flex items-center justify-center text-white font-display font-bold">S42</div>
          <div>
            <div className="font-display font-semibold text-ink">Scale42</div>
            <div className="text-xs text-muted uppercase tracking-wider">CMS · Preview</div>
          </div>
        </div>
        <h1 className="font-display text-2xl text-ink mb-2">Sign in</h1>
        <p className="text-sm text-muted mb-6">Google login required. Access is restricted to allowlisted users and the <code className="bg-bgalt px-1 py-0.5 rounded">@scale-42.com</code> domain.</p>
        <button
          onClick={signIn}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-ink text-white font-semibold rounded-lg py-3 hover:bg-accent transition disabled:opacity-50"
        >
          {busy ? "Redirecting…" : "Continue with Google"}
        </button>
        {err ? <p className="text-red-600 text-sm mt-3">{err}</p> : null}
        <p className="text-xs text-muted mt-6">Not on the allowlist? Ask James to add you.</p>
      </div>
    </main>
  );
}
