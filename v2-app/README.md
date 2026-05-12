# Scale42 v2 — CMS + Preview (Next.js + Supabase)

Same codebase deploys to two hostnames via Coolify, differentiated by `NEXT_PUBLIC_MODE`:

| Domain | `NEXT_PUBLIC_MODE` | Auth | Data |
|---|---|---|---|
| `cms.scale-42.com` | `cms` | required | Supabase (read + write inline) |
| `preview.scale-42.com` | `preview` | required | Supabase (read all incl. drafts) |

When the editor clicks **Publish**, `app/api/publish/route.ts` snapshots `S42_*` published rows into `content/*.json` on `master`, commits, pushes, and Coolify auto-deploys the existing static `scale-42-prod` app at `scale-42.com`.

## Local dev

```bash
cd v2-app
npm install
cp .env.example .env.local   # then fill in
npm run dev
```

## Env vars

```
NEXT_PUBLIC_SUPABASE_URL=https://cijleqzgvdpdfkwyxsyk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_MODE=cms                     # or "preview"
SUPABASE_SERVICE_KEY=sb_secret_...        # CMS app only — never set on preview
```

## Docker (Coolify)

`Dockerfile` produces a Next.js standalone build. The mode is baked at build time via `NEXT_PUBLIC_MODE` (build arg in Coolify) so each app deploys its own image.
