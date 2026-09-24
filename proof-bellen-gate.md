# Proof: Bellen source gate (Mollie + Vercel-ready, fail-closed)

Date: 2026-09-24 (Europe/Amsterdam).  
Local proof server: `node /workspace/woonwekker/server.cjs` → `http://127.0.0.1:4174/`  
Mollie key: **not set** (Vercel Production env later) → unlock impossible.

## Approach
- Shared helpers in `lib/ww-gate.cjs` used by local `server.cjs` and Vercel `api/*`.
- Authority = httpOnly HMAC cookie `ww_bellen` set **only** after Mollie payment `status === paid` (return URL + webhook).
- `GET /listings.json` (→ `/api/listings`) strips `url` unless entitled.
- `openProperty` never puts source URL in DOM for Kijken; CTA `.ww-detail-locked` / `data-ww-lock="source"`.
- `process.env.MOLLIE_API_KEY` only; fail-closed if missing. No fake unlock. No secrets committed.

## Feed (preserved)
| File | Count | urls |
|------|------:|----:|
| `dist/listings.full.json` (= `data/listings.full.json` hardlink) | 1428 | 1428 |
| `dist/listings.json` (on-disk redacted) | 1428 | 0 |

## Vercel-ready structure
```
api/checkout.js              POST  create Mollie first payment €18,50 + mandate
api/checkout/return.js       GET   verify paid → Set-Cookie → redirect /account/
api/mollie/webhook.js        POST  Mollie webhook (grant on paid)
api/entitlement.js           GET   {plan, source, mollieConfigured}
api/listings.js              GET   full or redacted listings
api/listing/[id].js          GET   {url} if entitled else 402
api/billing-portal.js        GET/POST cancel subscription
api/not-found.js             404 for private paths
lib/ww-gate.cjs              shared Mollie + cookie helpers
vercel.json                  outputDirectory=dist; rewrite listings.json; block listings.full.json + /data/*
data/listings.full.json      private full feed (not publicly reachable)
DEPLOY-VERCEL.md             create/link project + env instructions
.env.example                 Vercel-first; local .env optional
```
No Woonwekker Vercel project created/deployed in this pass (Jhow/parent sets `MOLLIE_API_KEY` on Production when linking).

## Verified commands (fail-closed / locked)

```
$ curl -sS http://127.0.0.1:4174/api/entitlement
{"plan":"kijken","source":null,"mollieConfigured":false}

$ curl -sS -X POST http://127.0.0.1:4174/api/checkout -H 'Content-Type: application/json' -d '{}'
{"error":"payments_unavailable","message":"Mollie not configured. Set MOLLIE_API_KEY in Vercel Production env (server-only). Unlock remains closed."}

$ curl -sS http://127.0.0.1:4174/listings.json | node -e '…'
{ count: 1428, withUrl: 0 }

$ curl -sS -w " HTTP %{http_code}\n" http://127.0.0.1:4174/api/listing/0
{"error":"payment_required","plan":"kijken"} HTTP 402

$ curl -sS -w " HTTP %{http_code}\n" http://127.0.0.1:4174/listings.full.json
Not found HTTP 404

$ curl -sS -H 'Cookie: ww_bellen=forged.x' http://127.0.0.1:4174/api/entitlement
{"plan":"kijken","source":null,"mollieConfigured":false}
```

### Kijken UI
- `wwIsBellen() === false`; listing objects have no `url` after fetch.
- Detail: locked CTA (`sourceLocked` / `unlockSource`); only `/prijzen/` href; no `funda.nl/detail|pararius|kamernet` listing paths.
- Screenshots: `proof-bellen/kijken-detail-locked.png`, `proof-bellen/locked-cta.png`.

### Unlocked path
**Not live-verified** — no `MOLLIE_API_KEY` in this environment. After key is set on Vercel Production and iDEAL enabled in Mollie Dashboard, `POST /api/checkout` → Mollie → paid → cookie → `/listings.json` includes `url`.

## Client files (prior gate work)
- `dist/app.js` — `wwIsBellen`, hard gate, checkout CTAs
- `dist/account.js` — plan display-only; `hasBellenAccess` → `wwIsBellen`
- `dist/enhancements.css` — `.ww-detail-locked` hooks (Uixis owns polish)

## Not synced to Jhow PC pending parent release.
