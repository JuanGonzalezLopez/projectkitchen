# Project Kitchen

Static, JSON-driven marketing site for a remodeling business. Hosted on Cloudflare Pages with Pages Functions for secure contact handling, Turnstile spam protection, and a custom Cloudflare-Access-protected admin panel that commits content directly to GitHub.

## Hosting (Cloudflare Pages)
- Build command: none (static site).
- Output directory: `/`.
- Functions live in `/functions` (contact form, public config, admin endpoints).
- Set `siteUrl` in `data/content.json` to your Pages or custom domain so canonical, OG, and JSON-LD stay correct.

## Content architecture
- `data/content.json` — hero/about/contact copy, `siteUrl`, optional `turnstileSiteKey`.
- `data/services.json` — services grid items.
- `data/projects.json` — project list with manifest paths and base paths.
- `assets/projects/<slug>/manifest.json` — per-project details plus image lists (supports `webp`).
- `assets/uploads/` — default media bucket for admin uploads.
- `admin/` — custom admin panel (no Decap).

## Local development
- Static preview: `python3 -m http.server 8000` from the repo root. JSON fetches work; `/api` Functions are not available, so the contact form will show an error state.
- Full stack: `npx wrangler pages dev .` to emulate Cloudflare Pages + Functions locally (requires Wrangler).

## Contact form + spam protection
- Frontend posts to `POST /api/contact` via `fetch`, shows idle/sending/success/error states, and includes a honeypot field.
- Turnstile widget renders with `TURNSTILE_SITE_KEY` pulled from `/api/public-config`.
- Server validation: required fields and length checks, Turnstile verification with `TURNSTILE_SECRET_KEY`, IP rate limiting (KV-backed when available, in-memory fallback otherwise), then email delivery through Resend.
- JSON responses: `200 { ok: true }`, `400/429/500 { ok: false, error: "<message>" }`.
- Static local preview will report an error because Functions are not running; deploy or run `wrangler pages dev` to exercise the endpoint.

## Admin panel (Cloudflare Access + GitHub commits)
- Custom admin lives at `/admin` (plain HTML/JS, protected by Cloudflare Access).
- Edits and saves:
  - `data/content.json`
  - `data/services.json`
  - `data/projects.json`
  - `assets/projects/<slug>/manifest.json`
- Uploads images to `assets/uploads/` or `assets/projects/<slug>/`.
- All changes are committed to GitHub via Pages Functions under `/api/admin/*`.
- Call `/api/admin/status` to verify auth; the UI shows “Auth OK” when Access headers are present.

## Environment variables (Cloudflare Pages)
- Contact/Turnstile: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `EMAIL_API_KEY` (Resend), `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`.
- GitHub (admin commits): `GITHUB_TOKEN` (fine-grained PAT scoped to this repo), `GITHUB_REPO` (e.g., JuanGonzalezLopez/projectkitchen), `GITHUB_BRANCH` (main).
- Admin auth: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ADMIN_EMAIL_ALLOWLIST` (comma-separated).
- Optional fallback basic auth: `ADMIN_BASIC_USER`, `ADMIN_BASIC_PASS`.
- Optional: `RATE_LIMIT_KV` binding for persistent IP rate limiting.
- Redeploy after editing environment variables so Functions receive the updates.

## Cloudflare Access setup for /admin
1) In Cloudflare Zero Trust → Access → Applications, create a Self-hosted app:
   - Application domain: your site (e.g., projectkitchen.pages.dev)
   - Session duration: your preference
   - Policy: Include emails in `ADMIN_EMAIL_ALLOWLIST`
   - Set AUD value; copy it to `CF_ACCESS_AUD`
2) Note your team domain (e.g., `yourteam.cloudflareaccess.com`) and set `CF_ACCESS_TEAM_DOMAIN`.
3) Deploy; `/admin` will show “Auth OK” when Access headers are present.

## Admin usage
- Open `/admin` (after Access auth). Status badge should show “Auth OK”.
- Edit Site Content, Services, Projects, or a selected Project Manifest; click Save to commit to GitHub.
- Upload images via the Media tab to `assets/uploads/` or a specific project folder; use returned paths in manifests.

## Security
- `_headers` plus `functions/_middleware.js` apply CSP, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and Permissions-Policy.
- Admin writes are gated by Cloudflare Access (plus optional basic auth), path allowlists, file-type/size checks, and rate limiting; secrets stay in environment variables.
- Contact flow adds Turnstile + honeypot + rate limiting; without a KV binding, rate limiting is per-instance (best-effort).

## Domain readiness & SEO
- Canonical link, `og:url`, and JSON-LD use `siteUrl` from `data/content.json`; `og:image` falls back to the first project image.
- `robots.txt` and `sitemap.xml` ship with the Pages domain; update them when you connect a custom domain.

## Compatibility
- Static assets work with `python -m http.server`.
- Production deploy targets Cloudflare Pages (free tier) with no build step and output `/`.

## Testing checklist
- Visit `/admin/` to confirm Access-protected admin loads and status reads “Auth OK”.
- Edit/save content and verify commits land in GitHub.
- Upload a sample image and confirm the returned path is usable.
- Submit the contact form (with Turnstile) and confirm the Resend email is delivered.
- Confirm `/api/public-config` returns the public Turnstile key and `/api/contact` returns JSON statuses.
