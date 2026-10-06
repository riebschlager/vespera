import { oceanSurfaceCommon, splashRippleCommon } from './cyberSeaShaders';

// ============================================================================
// UNDERWATER WORLD SHADERS
// Water-column volume colour, the sea surface seen from beneath (Snell's window,
// total internal reflection & caustics), drifting marine snow, and the full-screen
// composite that blends the above/below-water renders across a living waterline.
// ============================================================================

// Shared ambient colour of the water column along a view direction
export const waterVolumeCommon = /* glsl */ `
  uniform vec3 uWaterDeep;
  uniform vec3 uWaterShallow;
  uniform vec3 uMoonHalo;
  uniform vec3 uMoonCore;
  uniform vec3 uCyberAccent;
  uniform vec3 uMoonDirWater; // apparent moon direction after refraction into the water
  uniform float uMoonLight;   // moon glow scaled by lunar phase illumination
  uniform float uDepth;       // metres below the surface

  vec3 waterVolumeColor(vec3 dir) {
    float up = dir.y;
    vec3 abyss = uWaterDeep * 0.25;
    vec3 mid = mix(uWaterDeep, uWaterShallow, 0.5);
    vec3 lit = uWaterShallow * 1.5 + uMoonHalo * 0.06 * uMoonLight;
    vec3 col = mix(abyss, mid, smoothstep(-0.55, 0.1, up));
    col = mix(col, lit, smoothstep(0.05, 0.85, up));

    // Moonlight diffusing through the water column toward the refracted moon
    float mAlign = max(dot(dir, uMoonDirWater), 0.0);
    col += uMoonHalo * (pow(mAlign, 5.0) * 0.16 + pow(mAlign, 32.0) * 0.22) * uMoonLight;
    col += uMoonCore * pow(mAlign, 180.0) * 0.2 * uMoonLight;

    // Light fades the deeper we sink
    return col * exp(-uDepth * 0.045);
  }
`;

// Ocean surface seen from beneath. Shares the above-water vertex shader (same swell).
export const oceanUndersideFragmentShader = /* glsl */ `
  uniform samplerCube uSkyCube;
  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveDistortion;
  uniform float uDrizzleAmount;
  uniform float uCyberIntensity;
  uniform vec3 uCameraPos;
  uniform vec3 uSkyHorizon;
  uniform vec4 uCreatureRipples[4];
  ${waterVolumeCommon}

  varying vec3 vWorldPosition;
  varying vec4 vScreenPos;
  varying vec2 vWaveUv;
  varying float vWaveHeight;

  ${oceanSurfaceCommon}
  ${splashRippleCommon}

  void main() {
    float t = uTime * uWaveSpeed;
    vec3 toFrag = vWorldPosition - uCameraPos;
    float dist = length(toFrag);
    vec3 I = toFrag / dist;

    // Wave slopes read much stronger from below, so exaggerate them to make Snell's window ripple
    vec3 n = getWaveNormal(vWaveUv, dist, t);
    n = normalize(vec3(n.x * 1.8, n.y, n.z * 1.8));

    // Splash ripple packets & plankton glow, seen from underneath
    vec2 bioOffset = vec2(0.0);
    float bioGlow = 0.0;
    float splashPx = length(fwidth(vWorldPosition.xz));
    for (int i = 0; i < 4; i++) {
      vec4 sp = splashSurface(vWorldPosition.xz, uCreatureRipples[i], splashPx);
      bioOffset += sp.xy * 1.4;
      bioGlow += sp.z * 1.1 + sp.w * 0.9;
    }
    n = normalize(vec3(n.x + bioOffset.x, n.y, n.z + bioOffset.y));

    // Drizzle impact rings dimpling the surface overhead
    float drizzleSparkle = 0.0;
    if (uDrizzleAmount > 0.01) {
      vec3 dz = computeDrizzleRipples(vWaveUv, dist, uTime);
      n = normalize(vec3(n.x + dz.x * uDrizzleAmount * 1.6, n.y, n.z + dz.y * uDrizzleAmount * 1.6));
      drizzleSparkle = dz.z * uDrizzleAmount;
    }

    // Snell's window: rays leaving water within ~48.6 degrees of the normal escape into the
    // air (refracting the whole sky into a disc); beyond it they are totally internally reflected
    vec3 nDown = -n;
    const float eta = 1.333;
    float NdI = dot(nDown, I);
    float k = 1.0 - eta * eta * (1.0 - NdI * NdI);
    float window = smoothstep(0.0, 0.08, k);

    vec3 sky = vec3(0.0);
    if (k > 0.0) {
      // Bend the ray out through the local wave facet. Physical refraction squeezes everything
      // near the horizon (like a low moon) into a thin sliver at the rim, so blend it with a
      // linear angle mapping that keeps the moon and creatures legible while staying wave-distorted
      float cosI = clamp(dot(I, n), 0.0, 1.0);
      float thetaI = acos(cosI);
      vec3 tangent = I - n * cosI;
      tangent = dot(tangent, tangent) > 1e-8 ? normalize(tangent) : vec3(1.0, 0.0, 0.0);
      float thetaPhysical = asin(clamp(eta * sin(thetaI), 0.0, 1.0));
      float thetaLinear = thetaI * (1.5707963 / asin(1.0 / eta));
      float thetaT = mix(thetaPhysical, thetaLinear, 0.7);

      // Slight per-channel dispersion fringes the window with colour, strongest toward its rim
      float spread = 0.012 * pow(thetaI / asin(1.0 / eta), 3.0) + 0.0006;
      vec3 tR = n * cos(thetaT - spread) + tangent * sin(thetaT - spread);
      vec3 tG = n * cos(thetaT) + tangent * sin(thetaT);
      vec3 tB = n * cos(thetaT + spread) + tangent * sin(thetaT + spread);
      sky.r = textureCube(uSkyCube, tR).r;
      sky.g = textureCube(uSkyCube, tG).g;
      sky.b = textureCube(uSkyCube, tB).b;
    }

    // Fresnel: transmission collapses toward the critical angle
    float cosT = sqrt(max(k, 0.0));
    float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
    F = mix(1.0, F, window);

    // The full 360-degree horizon is compressed into a glowing ring at the window's edge
    float rim = exp(-k * 24.0) * window;
    vec3 rimColor = uSkyHorizon * 1.4 + uMoonHalo * 0.25 * uMoonLight;

    // Outside the window the surface is a rippling mirror of the dim water column below
    vec3 R = reflect(I, nDown);
    vec3 mirror = waterVolumeColor(R) * 1.25;

    vec3 col = sky * (1.0 - F) * 1.1 + rimColor * rim * 0.25 + mirror * F;

    // Moonlight focused by the swell into a drifting caustic net
    vec2 cp = vWaveUv * 0.55;
    float c1 = noise2D(cp + vec2(t * 0.35, -t * 0.22));
    float c2 = noise2D(cp * 1.7 - vec2(t * 0.27, t * 0.31));
    float caustic = pow(1.0 - abs(c1 - c2), 14.0) * mix(1.0, 0.35, window);
    col += mix(uMoonHalo, uMoonCore, 0.5) * caustic * 0.2 * uMoonLight * exp(-dist * 0.035);

    vec3 bioTint = mix(uCyberAccent, uMoonHalo, 0.4 + 0.35 * sin(uTime * 1.1));
    col += bioTint * bioGlow * 0.8;
    col += mix(uCyberAccent, uMoonCore, 0.55) * drizzleSparkle * 0.6;

    // Whisper of the cyber grid reflected on the underside
    if (uCyberIntensity > 0.01) {
      vec2 gridUv = vWaveUv * 0.16;
      vec2 grid = abs(fract(gridUv - 0.5) - 0.5) / fwidth(gridUv);
      float gridLine = 1.0 - min(min(grid.x, grid.y), 1.0);
      col += uCyberAccent * gridLine * 0.06 * uCyberIntensity * exp(-dist * 0.02) * F;
    }

    // Underwater visibility falloff into the water column
    float fog = 1.0 - exp(-dist * 0.03);
    col = mix(col, waterVolumeColor(I), fog);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Camera-centred sphere painting the open water column in every direction
export const underwaterBackdropVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const underwaterBackdropFragmentShader = /* glsl */ `
  uniform vec3 uCameraPos;
  ${waterVolumeCommon}

  varying vec3 vWorldPosition;

  void main() {
    vec3 dir = normalize(vWorldPosition - uCameraPos);
    gl_FragColor = vec4(waterVolumeColor(dir), 1.0);
  }
`;

// Marine snow, bioluminescent plankton and rising bubbles in a volume that wraps around the camera
export const marineSnowVertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aKind; // 0: marine snow, 1: plankton spark, 2: bubble

  uniform float uTime;
  uniform float uDriftOffset;
  uniform float uPixelRatio;
  uniform vec3 uCameraPos;
  uniform vec3 uBox;

  varying float vAlpha;
  varying float vKind;
  varying float vSeed;

  void main() {
    vec3 p = position * uBox;

    if (aKind > 1.5) {
      // Bubbles wobble upward toward the surface
      p.y += uTime * (0.7 + aSeed * 0.9);
      p.x += sin(uTime * 3.0 + aSeed * 40.0) * 0.12;
    } else {
      // Snow and plankton sink lazily and sway in the current
      p.y -= uTime * 0.06 * (0.5 + aSeed);
      p.x += sin(uTime * 0.3 + aSeed * 30.0) * 0.5;
    }
    // Forward drift streams the particles past the camera
    p.z += uDriftOffset * 0.9;

    // Wrap into a box that always surrounds the camera
    vec3 rel = mod(p - uCameraPos + uBox * 0.5, uBox) - uBox * 0.5;
    vec3 world = uCameraPos + rel;

    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    float dist = -mvPosition.z;

    float baseSize = aKind > 1.5 ? 34.0 * (0.35 + aSeed * 0.65)
                   : aKind > 0.5 ? 26.0 : 14.0 * (0.6 + aSeed * 0.8);
    gl_PointSize = clamp(baseSize / max(dist, 0.5), 1.0, aKind > 1.5 ? 18.0 : 7.0) * uPixelRatio;

    float nearFade = smoothstep(0.3, 1.4, dist);
    float farFade = exp(-dist * (aKind > 0.5 ? 0.05 : 0.09));
    // Nothing exists above the water surface
    float underSurface = smoothstep(0.05, -0.4, world.y);
    vAlpha = nearFade * farFade * underSurface;
    vKind = aKind;
    vSeed = aSeed;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const marineSnowFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uCyberIntensity;
  uniform vec3 uMoonHalo;
  uniform vec3 uMoonCore;
  uniform vec3 uCyberAccent;

  varying float vAlpha;
  varying float vKind;
  varying float vSeed;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;

    vec3 col;
    float alpha;
    if (vKind > 1.5) {
      // Bubble: thin bright rim with a specular glint
      float ring = smoothstep(0.5, 0.4, d) * smoothstep(0.26, 0.42, d);
      vec2 g = c - vec2(-0.14, -0.14);
      float spec = exp(-dot(g, g) * 160.0);
      col = mix(uMoonHalo, uMoonCore, 0.6);
      alpha = (ring * 0.55 + spec) * vAlpha;
    } else if (vKind > 0.5) {
      // Plankton: pulsing bioluminescent spark
      float pulse = pow(0.5 + 0.5 * sin(uTime * (1.5 + vSeed * 2.0) + vSeed * 50.0), 3.0);
      col = mix(uCyberAccent, uMoonHalo, vSeed) * 1.6;
      alpha = exp(-d * d * 18.0) * pulse * vAlpha * (0.45 + 0.55 * uCyberIntensity);
    } else {
      // Marine snow: faint moonlit motes
      col = mix(uMoonHalo, uMoonCore, 0.5) * 0.55;
      alpha = exp(-d * d * 14.0) * vAlpha * 0.5;
    }

    gl_FragColor = vec4(col, alpha);
  }
`;

export const compositeVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Blends the above-water and underwater renders across the waterline on the "lens",
// and adds underwater light shafts, the plunge bubble burst and post-surfacing droplets
export const compositeFragmentShader = /* glsl */ `
  uniform sampler2D tAbove;
  uniform sampler2D tBelow;
  uniform float uHasAbove;
  uniform float uHasBelow;
  uniform mat4 uInvProjection;
  uniform mat4 uCameraWorld;
  uniform vec3 uCameraPos;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uWaveTime;
  uniform float uWaveDistortion;
  uniform float uDriftOffset;
  uniform float uDivePulse;     // 1 -> 0 just after plunging beneath the surface
  uniform float uSurfacePulse;  // 1 -> 0 just after breaking back into the air
  uniform float uCyberIntensity;
  ${waterVolumeCommon}

  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Same swell as the ocean vertex shader, plus a fine capillary wobble for the lens waterline
  float surfaceHeight(vec2 xz) {
    vec2 pos = vec2(xz.x, xz.y - uDriftOffset);
    float h = 0.0;
    h += sin(pos.x * 0.045 + uWaveTime * 0.75) * cos(pos.y * 0.035 + uWaveTime * 0.55) * 0.28;
    h += sin((pos.x * 0.07 - pos.y * 0.05) + uWaveTime * 1.05) * 0.14;
    h += cos(pos.y * 0.11 - uWaveTime * 0.9) * 0.07;
    h *= (0.45 + 0.55 * uWaveDistortion) * exp(-length(xz) * 0.0025);
    h += sin(xz.x * 7.0 + uTime * 2.3) * 0.012 + sin(xz.x * 13.0 - uTime * 3.1 + xz.y * 5.0) * 0.006;
    return h;
  }

  vec3 viewRay(vec2 uv) {
    vec4 p = uInvProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    p.xyz /= p.w;
    return normalize((uCameraWorld * vec4(p.xyz, 0.0)).xyz);
  }

  // Moonlight shafts fanning down through the water from the refracted moon
  float lightShafts(vec3 dir) {
    vec3 m = uMoonDirWater;
    vec3 u = normalize(cross(m, abs(m.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)));
    vec3 v = cross(m, u);
    vec2 around = normalize(vec2(dot(dir, u), dot(dir, v)) + 1e-5);
    float s = valueNoise(around * 6.0 + vec2(uTime * 0.11, -uTime * 0.07))
            * valueNoise(around * 15.0 - vec2(uTime * 0.17, uTime * 0.05) + 7.0);
    s = smoothstep(0.12, 0.6, s);
    float radial = smoothstep(-0.25, 0.95, dot(dir, m));
    return s * radial * smoothstep(-0.7, 0.25, dir.y);
  }

  // Bubbles streaming up past the lens after the plunge: xy refraction offset, z rim highlight
  vec3 bubbleBurst(vec2 uv, float amount) {
    if (amount < 0.001) return vec3(0.0);
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec3 acc = vec3(0.0);
    for (int layer = 0; layer < 2; layer++) {
      float scale = layer == 0 ? 5.0 : 9.0;
      vec2 g = uv * aspect * scale + float(layer) * vec2(5.3, 1.7);
      float colSeed = hash12(vec2(floor(g.x), float(layer) * 7.0));
      g.y -= uTime * (1.3 + colSeed * 1.9) * (layer == 0 ? 1.0 : 1.4);
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = hash12(id + float(layer) * 19.0);
      if (h > amount * (layer == 0 ? 0.3 : 0.55)) continue;
      vec2 center = (vec2(hash12(id * 1.7), hash12(id * 2.9)) - 0.5) * 0.45;
      center.x += sin(uTime * 7.0 + h * 40.0) * 0.06;
      float r = 0.06 + 0.16 * pow(hash12(id * 3.3), 2.0);
      vec2 dv = f - center;
      float d = length(dv) / r;
      if (d < 1.05) {
        float body = smoothstep(1.05, 0.9, d);
        float rimLine = smoothstep(0.72, 0.95, d) * body;
        vec2 g2 = dv / r - vec2(-0.35, 0.35);
        float glint = exp(-dot(g2, g2) * 30.0);
        acc.xy += dv * (1.0 - d) * 0.05 * body / scale;
        acc.z += (rimLine * 0.8 + glint) * body;
      }
    }
    return acc;
  }

  // Droplets clinging to the lens after surfacing: xy refraction offset, z droplet mask
  vec3 lensDroplets(vec2 uv, float amount) {
    if (amount < 0.001) return vec3(0.0);
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec3 acc = vec3(0.0);
    for (int layer = 0; layer < 2; layer++) {
      float scale = layer == 0 ? 6.0 : 11.0;
      vec2 g = uv * aspect * scale + float(layer) * vec2(2.1, 8.4);
      float colSeed = hash12(vec2(floor(g.x), float(layer) * 3.0 + 1.0));
      // Each column of droplets slides down the glass at its own pace
      g.y += uTime * (0.08 + colSeed * 0.3) * (0.4 + amount);
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = hash12(id + float(layer) * 31.0);
      if (h > amount * 0.5) continue;
      vec2 center = (vec2(hash12(id * 1.3), hash12(id * 2.1)) - 0.5) * 0.5;
      float r = 0.07 + 0.15 * pow(hash12(id * 3.7), 1.5);
      vec2 dv = (f - center) * vec2(1.0, 0.8);
      float d = length(dv) / r;
      if (d < 1.0) {
        float mask = smoothstep(1.0, 0.82, d);
        // A droplet acts as a tiny inverting lens
        acc.xy -= dv * (1.0 - d * d) * 0.45 * mask / (aspect * scale);
        acc.z = max(acc.z, mask);
      }
    }
    return acc;
  }

  void main() {
    vec3 dir = viewRay(vUv);

    // Which side of the surface does this pixel see? Test a virtual lens just in front of the
    // camera, so the waterline sweeps across the frame as the camera crosses the surface
    vec3 lensP = uCameraPos + dir * 0.6;
    float h = lensP.y - surfaceHeight(lensP.xz);
    float aw = max(fwidth(h), 1e-5);
    float aboveMask = smoothstep(-aw, aw, h);
    if (uHasAbove < 0.5) aboveMask = 0.0;
    if (uHasBelow < 0.5) aboveMask = 1.0;
    float pxFromLine = abs(h) / aw;

    // ---- Underwater view ----
    vec3 below = vec3(0.0);
    if (uHasBelow > 0.5) {
      vec3 bub = bubbleBurst(vUv, uDivePulse);
      vec2 wobble = vec2(
        sin(vUv.y * 22.0 + uTime * 1.7) + sin(vUv.y * 9.0 - uTime * 1.1),
        cos(vUv.x * 18.0 + uTime * 1.3) + cos(vUv.x * 7.0 + uTime * 0.9)
      ) * (0.0011 + 0.0045 * uDivePulse);
      // The sliver just beneath the waterline is smeared by the meniscus
      wobble.y += exp(-pxFromLine * 0.05) * 0.01 * uHasAbove;
      vec2 uvB = vUv + wobble + bub.xy;
      float ca = 0.0012 + 0.003 * uDivePulse;
      below.r = texture2D(tBelow, uvB + vec2(ca, 0.0)).r;
      below.g = texture2D(tBelow, uvB).g;
      below.b = texture2D(tBelow, uvB - vec2(ca, 0.0)).b;

      // Volumetric moonlight shafts
      float shafts = lightShafts(dir);
      below += mix(uMoonHalo, uMoonCore, 0.35) * shafts * 0.13 * uMoonLight * exp(-uDepth * 0.08);

      below += mix(uMoonCore, uMoonHalo, 0.4) * bub.z * 0.5;

      // Murky vignette
      float vig = smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.1, 1.0)));
      below *= mix(0.55, 1.0, vig);

      // Milky flash of churned water right after the plunge
      below = mix(below, waterVolumeColor(dir) * 1.8 + uMoonHalo * 0.08, uDivePulse * uDivePulse * 0.4);
    }

    // ---- Above-water view ----
    vec3 above = vec3(0.0);
    if (uHasAbove > 0.5) {
      vec3 drops = lensDroplets(vUv, uSurfacePulse);
      above = texture2D(tAbove, vUv + drops.xy).rgb;
      // Faint bright rim where droplets catch the moonlight
      above += mix(uMoonHalo, uMoonCore, 0.5) * drops.z * (1.0 - drops.z) * 0.25 * uSurfacePulse;
    }

    vec3 col = mix(below, above, aboveMask);

    // Waterline across the lens: luminous meniscus line with a darker band just under it
    if (uHasAbove > 0.5 && uHasBelow > 0.5) {
      float line = exp(-pxFromLine * 0.45);
      float underBand = (1.0 - aboveMask) * exp(-pxFromLine * 0.05);
      col *= 1.0 - underBand * 0.35;
      col += mix(uMoonHalo, uMoonCore, 0.6) * line * 0.9;
      col += uCyberAccent * exp(-pxFromLine * 0.12) * 0.15 * uCyberIntensity;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;
