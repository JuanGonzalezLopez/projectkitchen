# Changelog

## Unreleased
- Added Cloudflare Pages Functions for Turnstile-verified contact handling with Resend email delivery and IP rate limiting (KV-supported when configured).
- Wired the contact form to fetch `/api/contact`, added Turnstile widget + honeypot, UI states, and site-wide canonical/OG/JSON-LD updates using `siteUrl`; added `robots.txt` and `sitemap.xml` placeholders.
- Introduced Decap CMS (`/admin`) with GitHub OAuth via `/api/auth`, collections for JSON content and project manifests, and media uploads into project folders; ensured `/admin` routes to the CMS via `_redirects` and vendored `admin/decap-cms.js` to satisfy strict CSP without CDNs.
- Hardened security via `_headers` (permissions/referrer/nosniff) and middleware-enforced CSP to avoid merged headers; `/admin` gets a scoped CSP (includes `unsafe-eval` for Decap), public site stays strict without `unsafe-eval`.
