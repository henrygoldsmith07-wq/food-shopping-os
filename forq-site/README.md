# forq — intro site

Static landing page for `forq`.

- One `index.html` + icons — no build step.
- Vercel project **Root Directory: `forq-site`**, Framework Preset **Other**, no build command, output directory `.` (see `forq-site/vercel.json`).
- Deploys as its own Vercel project, separate from the app: `forq-site/vercel.json` calls `scripts/vercel-ignore.mjs --project forq-site`, which only rebuilds when `forq-site/` itself changes. CI does not deploy it.
- Monochrome stroke icons; the palette is inlined as CSS custom properties in `index.html`.

Links to the app at <https://food-shopping-os.vercel.app/> and to the repository at <https://github.com/henrygoldsmith07-wq/food-shopping-os>.

## Deploy status — needs checking

No host this repo can reach serves this page. The hosts its old config implied
(`forq-site-…projects.vercel.app`, `forq-site.vercel.app`) return 404, and
`forq.vercel.app` is a different project entirely ("Art Class"). The canonical
URL in `index.html` therefore points at the app, and the preview images are
relative, so they resolve wherever the site lands.

If this page is meant to be public, confirm the `forq-site` project exists in
Vercel and is connected to this repository, then point a domain at it and set
the canonical in `index.html` to that domain. Verifying the project itself
needs Vercel credentials — it cannot be confirmed from here.
