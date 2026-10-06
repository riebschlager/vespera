# Working on Vespera

## Project

Vespera is a static, browser-based procedural ocean and lunar reflection experience. It uses React 19, TypeScript, Three.js, custom GLSL shaders, Tailwind CSS 4, and Vite. Preserve its atmospheric visual style and smooth real-time interaction when making changes.

## Setup and commands

Use npm and the committed `package-lock.json`. CI uses Node.js 22; prefer that version for local development.

- `npm ci` — install the locked dependencies.
- `npm run dev` — start the Vite development server.
- `npm run lint` — run TypeScript checks (`tsc --noEmit`); this is not an ESLint check.
- `npm run build` — build the static site into `dist/`.
- `npm run preview` — serve the production build locally.
- `npm run clean` — remove `dist/`.

There is currently no automated test runner configured.

## Code map

- `src/App.tsx` owns the controls, scene configuration, keyboard shortcuts, audio interaction, and snapshot capture.
- `src/components/CyberLunarSeaCanvas.tsx` owns the Three.js scene, render loop, reflection and underwater rendering, input handling, and renderer lifecycle.
- `src/types/scene.ts` defines shared scene types, presets, weather modes, and moon phase helpers.
- `src/shaders/` contains GLSL shader strings for the ocean, sky, creatures, and underwater effects.
- `src/utils/` contains procedural creatures, weather, ocean swell, splash simulation, starfield generation, and Web Audio synthesis.
- `src/index.css` contains Tailwind imports, typography, and custom control styling.
- `.github/workflows/deploy.yml` builds and deploys the site to GitHub Pages.

## Implementation guidance

- Keep changes focused on the requested behavior and follow the surrounding TypeScript and React conventions.
- Keep shared configuration and preset values in `src/types/scene.ts`. When adding a configuration field, update its type, all presets, relevant controls, and rendering or audio consumers together.
- Keep the Three.js scene stable across React state updates. Use the existing refs to pass current configuration and pause state into the animation loop.
- Avoid unnecessary allocations and React state updates in per-frame code. Preserve the existing pixel-ratio and render-target scaling limits unless the task requires changing them.
- Clean up animation frames, event listeners, timers, audio nodes, geometries, materials, textures, and render targets when their owner is disposed or unmounted.
- When changing GLSL uniforms or shared waterline/swell calculations, update the corresponding TypeScript and shader code together.
- Preserve audio activation through user interaction, pause/resume behavior, dive/surface transitions, and canvas snapshot support when touching those systems.
- Keep controls usable on small screens and retain accessible names and keyboard interaction.
- Do not edit generated `dist/` output or `node_modules/`. Change dependencies only when needed, and keep `package.json` and `package-lock.json` in sync.

## Validation

For application changes, run `npm run lint` and `npm run build`. For documentation-only changes, verify the documented commands and paths against the repo; application checks are not necessary.

For rendering, shader, audio, or interaction changes, also check the affected behavior in a browser. TypeScript and build success cannot verify GLSL compilation or visual output. Exercise relevant presets, pause/resume, dive/surface, weather, resizing, and controls; check the console for errors. If browser verification is unavailable, state that limitation in the handoff.

## Deployment

The site is hosted at `https://riebschlager.github.io/vespera/`. Vite uses `/vespera/` as its base path when `GITHUB_PAGES=true`, and `/` otherwise. Keep assets and navigation compatible with the deployed subpath.

Pushes to `main` trigger the Pages deployment workflow. When changing deployment or asset paths, also validate with `GITHUB_PAGES=true npm run build`. The app is a static site with no backend or required environment secrets.
