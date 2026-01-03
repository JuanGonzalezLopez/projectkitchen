# Project Kitchen

Static, JSON-driven marketing site for a remodeling business. Hosted on Cloudflare Pages with Pages Functions for secure contact handling, Turnstile spam protection, and Decap CMS editing.

## Hosting (Cloudflare Pages)
- Build command: none (static site).
- Output directory: `/`.
- Functions: `/functions` (contact form, Turnstile public config, GitHub OAuth).
- Set `siteUrl` in `data/content.json` to your Pages or custom domain so canonical, OG, and JSON-LD stay correct.

## Content architecture
- `data/content.json` — hero/about/contact copy, `siteUrl`, optional `turnstileSiteKey` fallback.
- `data/services.json` — services grid items.
- `data/projects.json` — project list with manifest paths and base paths.
- `assets/projects/<slug>/manifest.json` — per-project details plus image lists (supports `webp`).
- `admin/` — Decap CMS entry point and configuration.
- `assets/uploads/` — default media bucket for CMS uploads.

## Local development
- Static preview: `python3 -m http.server 8000` from the repo root. JSON fetches work; `/api` Functions are not available, so the contact form will show an error state.
- Full stack: `npx wrangler pages dev .` to emulate Cloudflare Pages + Functions locally (requires Wrangler).

## Contact form + spam protection
- Frontend posts to `POST /api/contact` via `fetch`, shows idle/sending/success/error states, and includes a honeypot field.
- Turnstile widget renders with `TURNSTILE_SITE_KEY` pulled from `/api/public-config`.
- Server validation: required fields and length checks, Turnstile verification with `TURNSTILE_SECRET_KEY`, IP rate limiting (KV-backed when available, in-memory fallback otherwise), then email delivery through Resend.
- JSON responses: `200 { ok: true }`, `400/429/500 { ok: false, error: "<message>" }`.
- Static local preview will report an error because Functions are not running; deploy or run `wrangler pages dev` to exercise the endpoint.

## Environment variables (Cloudflare Pages)
- Required: `TURNSTILE_SECRET_KEY`, `EMAIL_API_KEY` (Resend), `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
- Turnstile public key: `TURNSTILE_SITE_KEY` (used by `/api/public-config` and rendered on the form).
- Optional: `RATE_LIMIT_KV` binding for persistent IP rate limiting.
- Redeploy after editing environment variables so Functions receive the updates.

## Turnstile setup
1) Create a Turnstile widget in the Cloudflare dashboard.  
2) Add the site key and secret key as environment variables in Cloudflare Pages (Production + Preview).  
3) Optionally set `turnstileSiteKey` in `data/content.json` as a public fallback.

## Email provider (Resend)
- Verify a domain/sender in Resend and use the API key in `EMAIL_API_KEY`.
- Set `CONTACT_FROM_EMAIL` (verified sender) and `CONTACT_TO_EMAIL` (recipient).
- Resend is called directly via REST in `functions/api/contact.js`; no npm dependency is needed.

## Decap CMS (Git-based)
- Admin UI lives at `/admin`. Drag-and-drop uploads are saved to `assets/projects/<slug>` (for manifests) or `assets/uploads`.
- Collections: `data/content.json`, `data/services.json`, `data/projects.json`, and `assets/projects/**/manifest.json`.
- Adding a project via CMS: upload images into a new slug folder, create/edit its manifest in “Project Manifests,” then add the slug entry in “Projects Index.”
- Decap CMS is vendored locally at `admin/decap-cms.js` to avoid third-party script CDNs and work with a strict CSP.
- `/admin` uses a route-scoped CSP that allows `unsafe-eval` (required by Decap); the public site CSP remains strict without `unsafe-eval`.
- CSP is applied via `functions/_middleware.js` to ensure a single policy per response (admin vs public) and avoid merged headers on Cloudflare Pages.
- GitHub OAuth flow is handled by `/api/auth` (Pages Function):
  1) Create a GitHub OAuth App with Homepage URL = your site and Authorization callback URL = `<siteUrl>/api/auth`.
  2) Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in Cloudflare Pages.
  3) Update `admin/config.yml` `base_url` to your deployed domain.
  4) Deploy and log in through the CMS popup.

## Security
- `_headers` enforces CSP, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and a restrictive Permissions-Policy; `/admin` uses a slightly more permissive CSP for CMS assets.
- Contact flow adds Turnstile + honeypot + rate limiting; without a KV binding, rate limiting is per-instance (best-effort).
- Secrets stay in environment variables; only the public Turnstile key is exposed via `/api/public-config`.

## Domain readiness & SEO
- Canonical link, `og:url`, and JSON-LD use `siteUrl` from `data/content.json`; `og:image` falls back to the first project image.
- `robots.txt` and `sitemap.xml` ship with the Pages domain; update them when you connect a custom domain.

## Compatibility
- Static assets work with `python -m http.server`.
- Production deploy targets Cloudflare Pages (free tier) with no build step and output `/`.

## Testing checklist
- Visit `/admin/` to confirm Decap CMS loads; log in with GitHub and ensure auth completes.
- Create/edit content via CMS and verify commits land in the repo.
- Submit the contact form (with Turnstile) and confirm the Resend email is delivered.
- Confirm `/api/public-config` returns the public Turnstile key and `/api/contact` returns JSON statuses.
