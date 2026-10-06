# Vespera

An interactive Three.js procedural ocean and lunar reflection experience with real-time planar reflections, custom GLSL water distortion shaders, and a subtle cyber-dream aesthetic.

Built with React, Three.js, Tailwind CSS, and Vite.

## Getting started

**Prerequisites:** Node.js 20+

```sh
npm install
npm run dev
```

## Scripts

| Command           | Description                              |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Start the dev server                     |
| `npm run build`   | Build a static bundle into `dist/`       |
| `npm run preview` | Serve the production build locally       |
| `npm run lint`    | Type-check with `tsc`                    |
| `npm run clean`   | Remove `dist/`                           |

## Deployment

The site is deployed to GitHub Pages at **https://riebschlager.github.io/vespera/**.

Every push to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the app and publishes `dist/` to Pages. You can also run it manually from the Actions tab.

The workflow sets `GITHUB_PAGES=true` during the build so Vite uses `/vespera/` as the base path; local `dev`/`build`/`preview` still serve from `/`.

`npm run build` produces a fully static site with no server or environment variables required, so it can also be hosted on any other static host.
