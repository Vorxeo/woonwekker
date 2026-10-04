# Deploy Woonwekker on Vercel (Mollie Bellen + Google OAuth)

> **Framework Preset must be Other** (not Node / Next.js). Build Command empty or the noop `npm run build`; Output Directory `dist`; Root Directory `.`. Vercel serves the committed static `dist/` plus `/api` serverless functions. **Never** use `npm start` / `server.cjs` on Vercel — that is local-box only. A Node preset will try to execute browser bundles (e.g. `dist/app.js`) as serverless and fail with `FUNCTION_INVOCATION_FAILED` / `copy is not defined`.

> **Hobby plan:** ≤12 Serverless Functions per deployment. Auth status/me/logout/signup/confirm share `api/auth/actions.js`; keep google + callback as separate files. Do not add more `api/*.js` files without consolidating.

Create/link the project if needed (project already exists as `woonwekker` / `prj_Fb9aShowEkreEPvJrEoVkQoRZqhV`):

```bash
cd /workspace/woonwekker
npx vercel link          # or: vercel project add woonwekker
npx vercel env add MOLLIE_API_KEY production   # or Mollie_Api_Key / mollie_api_key; live_/test_ — server-only
npx vercel env add WW_ENTITLEMENT_SECRET production
npx vercel env add GOOGLE_CLIENT_ID production
npx vercel env add GOOGLE_CLIENT_SECRET production
npx vercel env add RESEND_API_KEY production
npx vercel env add RESEND_FROM production   # optional; default Woonwekker <noreply@woonwekker.nl>
npx vercel --prod
```

## Env (Production, server-only)
| Key | Required | Notes |
|-----|----------|-------|
| `MOLLIE_API_KEY`, `Mollie_Api_Key`, or `mollie_api_key` | yes (any) | Mollie dashboard; enable **iDEAL** (do not hardcode methods in code). The Vercel name `mollie_api_key` is accepted. |
| `WW_ENTITLEMENT_SECRET` | yes on Vercel | HMAC for httpOnly `ww_bellen` cookie (+ session/state if `WW_AUTH_SECRET` unset) |
| `WW_PUBLIC_BASE` | optional | Public site origin for Mollie redirect/webhook + Google redirect default |
| `GOOGLE_CLIENT_ID` or `woonwekker_google_oauth_clientid` | for Google login | OAuth Web client — Consent **External** (any Google account; no `hd=`) |
| `GOOGLE_CLIENT_SECRET` or `woonwekker_google_oauth_clientsecret` | for Google login | Server-only; never ship to frontend |
| `GOOGLE_REDIRECT_URI` | optional | Default `${WW_PUBLIC_BASE}/api/auth/google/callback` |
| `WW_AUTH_SECRET` | optional | Prefer separate secret for `ww_session` / OAuth state / confirm tokens; else entitlement secret |
| `RESEND_API_KEY` | for email signup | Resend API key (server-only). Without it signup → 503 |
| `RESEND_FROM` | optional | Default `Woonwekker <noreply@woonwekker.nl>` — must be verified domain |

### Google Cloud Console
1. APIs & Services → Credentials → Create OAuth client ID → **Web application**
2. Authorized redirect URIs: `https://YOUR_DOMAIN/api/auth/google/callback` (and local `http://127.0.0.1:4174/api/auth/google/callback` for box/dev)
3. OAuth consent screen: **External** — do not restrict to a Workspace domain

### Resend (email confirmation)
1. Resend dashboard → Domains → add **woonwekker.nl** → publish SPF/DKIM DNS
2. Create API key → set `RESEND_API_KEY` on Vercel Production (server-only)
3. Optional `RESEND_FROM` must use that verified domain
4. Flow: `POST /api/auth/signup` emails a signed 24h link → `GET /api/auth/confirm?token=` sets `ww_session` (same cookie as Google). **No password stored server-side** (no DB). Google login skips confirmation.

## Layout
- `dist/` — static site (`outputDirectory`)
- `api/*` — serverless checkout / webhook / entitlement / listings / Google auth
- `lib/ww-gate.cjs` — Mollie + entitlement; `lib/ww-auth.cjs` — Google OAuth + session
- `data/listings.full.json` — private full feed (hardlinked with `dist/listings.full.json`); HTTP blocked via rewrite to `/api/not-found`
- Public `dist/listings.json` is URL-redacted; `/listings.json` rewrites to `/api/listings` (entitlement-aware)

## Fail-closed
If none of `MOLLIE_API_KEY`, `Mollie_Api_Key`, or `mollie_api_key` is set at runtime: `POST /api/checkout` → 503, no entitlement cookie, no source URLs.
If neither client id name nor either client secret name is set: `GET /api/auth/google` → 503 JSON, `/api/auth/status` → `googleConfigured:false`. Google login ≠ Bellen unlock (`ww_bellen` untouched).
If `RESEND_API_KEY` missing: `POST /api/auth/signup` → 503, never pretends email was sent. `resendConfigured:false` on status.
