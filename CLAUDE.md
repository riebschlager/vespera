# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The imported `AGENTS.md` covers commands, the code map, implementation rules, validation and deployment. This file adds architecture details that only become clear after reading several files.

## Commands at a glance

- `npm run dev`: Vite dev server.
- `npm run lint`: runs `tsc --noEmit` only. There is no ESLint and no test runner, so there are no single tests to run.
- `npm run build`, and `GITHUB_PAGES=true npm run build` to check the `/vespera/` base path.
- The `@` import alias resolves to the repo root, not `src/` (see `vite.config.ts`).

## Architecture

### React ↔ Three.js boundary

`App.tsx` holds all UI state (`SceneConfig`, pause, zen mode, dive, audio) and renders `CyberLunarSeaCanvas`. The canvas builds the whole Three.js scene once, in a single mount `useEffect`. Props reach the render loop only through `configRef` and `pausedRef`, so changing config never rebuilds the scene. One-shot events use counter props: `summonSignal` increments to trigger `fishSchool.summonJump()` and `skyWhalePod.summonSkyWhale()`. FPS goes back to the app through the `onFpsUpdate` callback. When pausing, the loop passes `dt: 0` to subsystems; it does not stop the loop.

### Multi-pass render loop (`CyberLunarSeaCanvas.tsx`, in `animate`)

Which passes run depends on the camera's height above the *swelling* surface, `cameraHeightAboveSurface = camera.y - swellHeightAt(...)`. `hasAbove` and `hasBelow` overlap within `LENS_REACH + 0.1` of the waterline.

1. **Planar reflection**: a mirrored camera renders the scene into `reflectionRenderTarget` with the ocean hidden, and the ocean shader samples it as `uReflectionMap`.
2. **Above-water scene**: renders straight to the screen, or into `aboveTarget` when compositing is needed.
3. **Sky cube capture**: `skyCubeCamera` sits just above the surface and supplies the underwater refraction.
4. **Underwater scene**: renders into `belowTarget`. This pass hides the `aboveWaterOnly` objects, shows `underwaterGroup` and calls `fishSchool.setSubmergedView(true)`. Restore these toggles after the pass.
5. **Composite**: a full-screen quad (`compositeFragmentShader`) blends both targets across a wobbling lens waterline, using `uDivePulse` and `uSurfacePulse` for the transition flashes.

The canvas uses `preserveDrawingBuffer: true` so that the snapshot feature in `App.tsx` (`canvas.toDataURL`) works.

### The swell formula is duplicated, so keep every copy in sync

The ocean surface height is computed independently in several places, and they must match exactly or waterlines, creature riding and the dive threshold will drift apart:

- `oceanVertexShader` and `creatureVertexShader`, in `src/shaders/cyberSeaShaders.ts`
- both `calculateSwell` functions in `src/shaders/fishShaders.ts` (fish and micro-rings)
- the composite lens waterline in `src/shaders/underwaterShaders.ts`
- `swellHeightAt` in `src/utils/oceanSwell.ts`, which is the CPU copy used for the dive/surface decision and other CPU-side effects

Each copy applies forward drift as `z - uDriftOffset` and distance attenuation as `exp(-length(xz) * 0.0025)`. `LENS_REACH` (0.6) in the canvas must also match the hard-coded `0.6` lens distance in `compositeFragmentShader`.

### Shared GLSL chunks

Shaders are TypeScript template strings that splice reusable chunks into each other with `${...}`:

- `oceanSurfaceCommon` and `splashRippleCommon` are defined in `cyberSeaShaders.ts`. The above-water ocean fragment shader uses them, and so does `oceanUndersideFragmentShader`, which reuses the ocean vertex shader.
- `waterVolumeCommon` is defined in `underwaterShaders.ts` and used by the underwater backdrop, the composite and the fish shaders. Its uniforms (`waterVolumeUniforms`) are shared objects on the TypeScript side. When you add a uniform to a chunk, add it to every material that includes that chunk.

### Simulation subsystems (`src/utils/`)

Each subsystem is a class that the canvas owns and steps every frame with `dt`. Each one builds its own geometry, materials and uniforms and must clean them up through the canvas teardown. The subsystems are `BioluminescentCreaturePod`, `BioluminescentFishSchool` (which owns a `SplashSimulation`; its bubbles join `underwaterGroup`), `SkyWhalePod` and `CyberWeatherSystem`. `SplashSimulation.rippleUniformArray` is a fixed set of `SPLASH_SOURCE_SLOTS` `vec4(x, z, age, strength)` sources, and the ocean shaders evaluate it through `splashRippleCommon`. Its droplets and bubbles use the CPU swell (`swellHeightAt`) to find the surface.

`CyberDreamAudio` (`dreamAudio.ts`) belongs to `App.tsx`, not the canvas. `App.tsx` constructs it on mount, but its `AudioContext` is only created or resumed in `start()`, which must run from a user gesture.

### Keyboard shortcuts (`App.tsx`)

Space pauses or plays, H toggles zen mode, D dives or surfaces, and Esc closes the controls and leaves zen mode. Shortcuts are ignored while focus is in an input.
