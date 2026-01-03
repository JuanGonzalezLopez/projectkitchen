# Changelog

## Unreleased
- Added Cloudflare Pages Functions for Turnstile-verified contact handling with Resend email delivery and IP rate limiting (KV-supported when configured).
- Wired the contact form to fetch `/api/contact`, added Turnstile widget + honeypot, UI states, and site-wide canonical/OG/JSON-LD updates using `siteUrl`; added `robots.txt` and `sitemap.xml` placeholders.
- Replaced Decap with a custom Access-protected admin at `/admin` (vanilla HTML/JS) that edits JSON content, project manifests, and uploads media via new Pages Functions (`/api/admin/status`, `/api/admin/save-json`, `/api/admin/upload`) committing directly to GitHub.
- Hardened security via `_headers` (permissions/referrer/nosniff) and middleware-enforced CSP; admin/API responses are no-store, path allowlists and file validation added for write endpoints.
