# Todex — landing page

A standalone marketing landing page for Todex. It lives entirely in this
`/website` folder and has **no dependency on the CLI, agent, or backend
packages** in the repository root.

## Stack

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript
- Plain CSS design system (`src/styles/globals.css`) — no UI framework
- Zero runtime dependencies beyond React

## Develop

```bash
cd website
npm install
npm run dev        # http://localhost:5173
```

## Build

```bash
cd website
npm run build      # typecheck + static build into website/dist
npm run preview    # serve the production build locally
```

The build uses a relative `base`, so `website/dist/` can be dropped on any
static host (GitHub Pages, Netlify, S3, …) without extra configuration.

## Editing content

Links and the install command are centralised in `src/site.ts`. Update them
there rather than inside components:

- `repo` — GitHub URL
- `linkedin` — LinkedIn URL
- `installCommand` — the one-line installer shown in the hero and CTA

The **Docs** tab is intentionally a placeholder section (`#docs`) until real
documentation ships.

## Structure

```
src/
  site.ts                 # links + install command (single source of truth)
  App.tsx                 # page composition
  main.tsx                # React entry
  hooks/                  # useReveal (scroll animations), useCopy (clipboard)
  components/             # Navbar, Hero, Features, TerminalPreview, ...
  styles/globals.css      # tokens, layout, animations, responsive rules
```
