# Brotato Master Guide

Mobile-first interactive guide for Brotato with:

- All characters from the wiki character template (base + DLC)
- All weapons from the wiki weapon template
- Search + DLC filter
- Character strategy and stat-priority helper
- Weapon tier quick view

## Run

1. Generate data:

```bash
node ./scripts/build-data.mjs
```

2. Serve locally:

```bash
python3 -m http.server 8000
```

3. Open [http://localhost:8000](http://localhost:8000)

## iPhone Usage

- Easiest path: deploy this static folder to GitHub Pages, Cloudflare Pages, or Netlify.
- On iPhone Safari, open the URL and choose **Add to Home Screen**.
- This gives an app-like icon and full-screen experience.

## Notes

- Source data is parsed from Brotato wiki template pages to keep content consistent.
- Strategy/stat-priority is generated guidance and should be tuned as meta evolves.
