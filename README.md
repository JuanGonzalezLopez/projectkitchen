Project: Simple static business site for home remodeling

Purpose: Clean, low-cost website scaffold suitable for hosting on GitHub Pages.

Contents:
- `index.html` - single-page site with hero, services, featured project carousel, about, and contact form.
- `css/styles.css` - custom styles (color system, cards, hero, typography).
- `assets/projects/<project>/` - one folder per project with images + `manifest.json`.
- `data/` - JSON used for content (services, hero/about/contact, project index).

Dependencies:
- Google Fonts: Inter + Space Grotesk (loaded from fonts.googleapis.com).
- Otherwise pure HTML/CSS/JS; no frameworks. Images live in `assets/`.

Local preview (important):
- Serve over HTTP so the JSON fetches work (file:// blocks fetch). From the `website/` folder run: `python3 -m http.server 8000` and open http://localhost:8000.

How to update content quickly:
- Projects (auto): create a folder under `assets/projects/<slug>/` with your images and a `manifest.json`:
  ```json
  {
    "title": "Old San Juan Kitchen",
    "location": "San Juan, PR",
    "description": "Custom cabinets, quartz counters...",
    "images": [
      { "src": "kitchen-1.png", "alt": "Alt text" },
      { "src": "kitchen-2.png", "alt": "Alt text" }
    ]
  }
  ```
  Then add an entry to `data/projects.json`:
  ```json
  { "slug": "kitchen-refresh", "name": "Old San Juan Kitchen", "manifest": "assets/projects/kitchen-refresh/manifest.json", "basePath": "assets/projects/kitchen-refresh/" }
  ```
  The carousel + project list will pick it up automatically.
- Services: edit `data/services.json` (tag, title, description) to change the “What we do” cards.
- Hero/About/Contact text: edit `data/content.json`.
- Business info: replace `[Business Name]`, phone, and email in `index.html`. Update JSON-LD block near the footer (name, phone, email, `url`) to match.
- Contact form: replace the `action` value (`https://formspree.io/f/{your-form-id}`) with your Formspree or Netlify Forms endpoint. A guard prevents submits while the placeholder is present.

Security & best practices:
- Serve optimized images (webp/avif) sized to match their rendered dimensions.
- Use a serverless form provider (Formspree, Netlify Forms, Formsubmit) or a small backend; never commit API keys or credentials.
- Enable branch protection for the repo; use least-privilege tokens for deployments if you add CI.
- Keep only public-friendly images in the repo.

Update without VS Code:
- Use the GitHub web editor: open `data/services.json`, `data/content.json`, or `data/projects.json` in the repo UI, click “Edit,” commit to main.
- To add a project: upload images into a new `assets/projects/<slug>/` folder via the GitHub web UI, add a `manifest.json` there, then edit `data/projects.json` to reference it.
- Quick edits: press `.` in the GitHub repo to open `github.dev` (VS Code web) and edit JSON files in the browser.

Notes:
- Images now have WebP versions; manifests support `webp` fields alongside `src`. The carousel prefers WebP when present.
- Form action is prefilled with a Formspree endpoint placeholder (`https://formspree.io/f/mzzbkbyd`). Replace it with your own to receive submissions.

Performance tips:
- `loading="lazy"` is on large images; keep it when adding new ones.
- Add `srcset`/`sizes` if you export multiple responsive versions of each image.

Deploy (GitHub Pages):
1. Create a new GitHub repo and push this `website/` folder as the repository root or `gh-pages` branch.
2. In repository Settings -> Pages, set the source to `main` branch / `root` or `gh-pages` branch.
3. GitHub will serve the static site for free.

Local preview tips (WSL + VS Code):
- If you're editing in WSL and images don't show when opening `index.html` directly, run a simple static server from the `website/` folder so the browser can resolve paths consistently.

	Example (from WSL bash in the project root):

```bash
# using Python 3
cd /home/juanm/documents/projects/projectkitchen/website
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your host browser. This approach serves files over HTTP and avoids file:// path issues between WSL and Windows.
