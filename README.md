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

`npm run build` produces a fully static site in `dist/` with no server or environment variables required, so it can be hosted on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3, etc.).
