/**
 * Custom GLSL Shaders for Vespera: Cyber-Dream Lunar Sea
 * Includes:
 * 1. Sky Dome Shader (Twilight gradient, starfield, horizon atmospheric glow)
 * 2. Moon Surface Shader (Procedural mare craters, luminescent limb glow, subtle scanline shimmer)
 * 3. Moon Corona / Orbital Halo Shader (Volumetric bloom + delicate cyber-dream concentric rings)
 * 4. Smooth Sea Shader (Gerstner + FBM smooth wave swells, planar reflection distortion, analytical lunar glitter, subtle subsurface cyber-grid shimmer)
 */

export const skyVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const skyFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform vec3 uMoonCore;
  uniform vec3 uMoonHalo;
  uniform vec3 uCyberAccent;
  uniform vec3 uMoonDirection;
  uniform float uMoonGlow;
  uniform float uMoonPhase;
  uniform float uStarfieldDensity;
  uniform float uFogAmount;
  uniform float uCyberIntensity;

  varying vec3 vWorldPosition;
  varying vec2 vUv;

  // High-frequency hash for starfield
  float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x),
        f.y
      ),
      f.z
    );
  }

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float elevation = max(dir.y, 0.0);

    // Phase illumination factor (0.0 at New Moon, 1.0 at Full Moon)
    float phaseIllum = 0.5 - 0.5 * cos(uMoonPhase * 6.28318530718);
    float scatterScale = 0.42 + 0.58 * phaseIllum;

    // Smooth atmospheric vertical gradient
    float horizonFactor = pow(1.0 - elevation, 3.2);
    vec3 skyColor = mix(uSkyZenith, uSkyHorizon, horizonFactor);

    // Subtle cyber-dream horizon band glow
    float horizonBand = exp(-abs(dir.y) * 26.0);
    skyColor += mix(uMoonHalo, uCyberAccent, 0.5) * horizonBand * (0.28 + 0.18 * uCyberIntensity) * scatterScale;

    // Directional lunar atmospheric scatter in the sky
    vec3 moonDir = normalize(uMoonDirection);
    float moonDot = max(dot(dir, moonDir), 0.0);
    float mieScatter = pow(moonDot, 6.0) * 0.38 + pow(moonDot, 28.0) * 0.45;
    skyColor += uMoonHalo * mieScatter * uMoonGlow * scatterScale * (0.55 + 0.45 * horizonFactor);
    skyColor += uMoonCore * pow(moonDot, 120.0) * 0.35 * uMoonGlow * scatterScale;

    // Subtle procedural nebula veil in upper sky
    float nebula = noise3D(dir * 3.5 + vec3(0.0, 0.0, uTime * 0.01));
    nebula *= noise3D(dir * 7.0 - vec3(uTime * 0.015, 0.0, 0.0));
    float nebulaMask = smoothstep(0.04, 0.45, elevation) * (1.0 - pow(moonDot, 4.0) * 0.7);
    skyColor += mix(uMoonHalo, uCyberAccent, nebula) * nebula * 0.16 * nebulaMask * (0.4 + 0.6 * uCyberIntensity) * (0.35 + 0.65 * uStarfieldDensity);

    // Deep background micro-stardust above the horizon haze
    if (dir.y > 0.015 && uStarfieldDensity > 0.01) {
      vec3 starCoord = floor(dir * 460.0);
      float starVal = hash(starCoord);
      float threshold = mix(0.9985, 0.9945, clamp(uStarfieldDensity * 0.5, 0.0, 1.0));
      float starMask = smoothstep(0.03, 0.25, dir.y) * smoothstep(threshold, 0.9999, starVal);
      float twinkle = 0.6 + 0.4 * sin(uTime * 1.9 + starVal * 120.0);
      // Fade stars near bright moon core
      float moonOcclusion = 1.0 - smoothstep(0.955, 0.998, moonDot) * (0.4 + 0.6 * phaseIllum);
      skyColor += mix(vec3(1.0), uCyberAccent, 0.35) * starMask * twinkle * moonOcclusion * 1.25 * uStarfieldDensity;
    }

    // Subtle cyber-dream atmospheric scanlines near horizon
    if (uCyberIntensity > 0.01) {
      float scan = sin(dir.y * 520.0 - uTime * 0.8) * 0.5 + 0.5;
      float scanMask = exp(-abs(dir.y - 0.06) * 18.0) * pow(moonDot, 3.0);
      skyColor += uCyberAccent * scan * scanMask * 0.06 * uCyberIntensity;
    }

    // Rolling procedural fog banks near the horizon diffusing moonlight
    if (uFogAmount > 0.01) {
      float fogNoise1 = noise3D(vec3(dir.x * 4.5 + uTime * 0.035, dir.y * 10.0, dir.z * 4.5));
      float fogNoise2 = noise3D(vec3(dir.x * 9.0 - uTime * 0.05, dir.y * 18.0, dir.z * 9.0));
      float fogBank = (fogNoise1 * 0.65 + fogNoise2 * 0.35);
      float lowSkyMask = exp(-max(dir.y, 0.0) * (7.5 - 2.5 * clamp(uFogAmount, 0.0, 1.2)));
      vec3 fogTint = mix(uSkyHorizon * 1.18, mix(uMoonHalo, uCyberAccent, 0.35), 0.32 * scatterScale);
      fogTint += uMoonCore * pow(moonDot, 5.0) * 0.24 * uMoonGlow * scatterScale;
      skyColor = mix(skyColor, fogTint, clamp(lowSkyMask * (0.45 + 0.55 * fogBank) * uFogAmount * 0.78, 0.0, 0.92));
    }

    gl_FragColor = vec4(skyColor, 1.0);
  }
`;

export const moonVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vLocalPosition;

  void main() {
    vUv = uv;
    vLocalPosition = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const moonFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uMoonCore;
  uniform vec3 uMoonHalo;
  uniform vec3 uCyberAccent;
  uniform float uMoonGlow;
  uniform float uMoonPhase;
  uniform float uCyberIntensity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vLocalPosition;

  // 3D value noise for organic lunar mare & craters
  float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.05 + vec3(1.7, 9.2, 3.4);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 normal = normalize(vNormal);
    vec3 sphereNormal = normalize(vLocalPosition);

    // Fresnel limb glow
    float ndotv = max(dot(normal, viewDir), 0.0);
    float fresnel = pow(1.0 - ndotv, 2.2);

    // Slowly rotate the lunar crater coordinates so the surface drifts while phase orientation stays stable
    float rotAngle = uTime * 0.025;
    mat3 rotY = mat3(
      cos(rotAngle), 0.0, sin(rotAngle),
      0.0, 1.0, 0.0,
      -sin(rotAngle), 0.0, cos(rotAngle)
    );
    vec3 p = rotY * sphereNormal * 2.6;
    float n1 = fbm(p);
    float n2 = fbm(p * 2.8 + vec3(n1 * 1.4));
    float mare = smoothstep(0.38, 0.68, n1 * 0.65 + n2 * 0.35);

    // Compute 3D Lunar Phase solar illumination direction:
    // uMoonPhase = 0.0 -> New Moon (sun behind moon: 0, 0, -1)
    // uMoonPhase = 0.25 -> First Quarter Waxing (sun on right: +1, 0, 0)
    // uMoonPhase = 0.50 -> Full Moon (sun in front: 0, 0, +1)
    // uMoonPhase = 0.75 -> Third Quarter Waning (sun on left: -1, 0, 0)
    float phaseAngle = uMoonPhase * 6.28318530718;
    vec3 sunDir = normalize(vec3(sin(phaseAngle), 0.07 * sin(phaseAngle), -cos(phaseAngle)));

    // Perturb normal slightly with crater relief so the lunar terminator has realistic highland/crater detail
    vec3 reliefNormal = normalize(sphereNormal + vec3(n2 - 0.5, n1 - 0.5, 0.0) * 0.16);
    float sunDot = dot(reliefNormal, sunDir);

    // Smooth terminator transition between sunlit lunar day and earthshine lunar night
    float litMask = smoothstep(-0.08, 0.12, sunDot);
    // Subtle iridescent terminator band right along the waxing/waning twilight boundary
    float terminatorGlow = exp(-abs(sunDot) * 14.0) * (0.4 + 0.6 * uCyberIntensity);

    // Sunlit lunar surface color
    vec3 darkMareColor = mix(uMoonHalo * 0.72, uMoonCore * 0.84, 0.5);
    vec3 litSurface = mix(darkMareColor, uMoonCore * 1.14, mare);
    litSurface += uMoonCore * (0.28 * uMoonGlow);
    litSurface = mix(litSurface, uMoonHalo * 1.35, fresnel * 0.65);
    litSurface += uCyberAccent * pow(fresnel, 3.5) * 0.5 * uCyberIntensity;

    // Shadowed hemisphere (Earthshine + Cyber-Dream nocturnal silhouette)
    vec3 earthshineBase = mix(vec3(0.02, 0.03, 0.07), uMoonHalo * 0.14, 0.35 + 0.25 * mare);
    // Faint bioluminescent rim on the shadowed limb so the full lunar sphere silhouette remains legible
    vec3 shadowRim = mix(uMoonHalo, uCyberAccent, 0.6) * pow(fresnel, 2.8) * (0.22 + 0.25 * uCyberIntensity);
    vec3 shadowSurface = earthshineBase + shadowRim;

    // Combine sunlit and shadowed hemispheres with subtle cyber-dream terminator rim
    vec3 surfaceColor = mix(shadowSurface, litSurface, litMask);
    surfaceColor += mix(uMoonHalo, uCyberAccent, 0.5) * terminatorGlow * 0.28 * uMoonGlow;

    // Subtle cyber-dream holographic latitude bands across the moon disk
    if (uCyberIntensity > 0.01) {
      float latLine = sin(vLocalPosition.y * 1.85 - uTime * 0.45);
      float lineMask = smoothstep(0.92, 0.99, latLine) * (1.0 - mare * 0.6);
      float phaseMod = mix(0.25, 1.0, litMask);
      surfaceColor += uCyberAccent * lineMask * 0.24 * uCyberIntensity * phaseMod;
    }

    gl_FragColor = vec4(surfaceColor, 1.0);
  }
`;

export const coronaVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const coronaFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uMoonCore;
  uniform vec3 uMoonHalo;
  uniform vec3 uCyberAccent;
  uniform float uMoonGlow;
  uniform float uMoonPhase;
  uniform float uCyberIntensity;

  varying vec2 vUv;

  void main() {
    vec2 centered = (vUv - 0.5) * 2.0;

    // Bias corona bloom slightly toward the illuminated waxing/waning limb
    float phaseAngle = uMoonPhase * 6.28318530718;
    float phaseIllum = 0.5 - 0.5 * cos(phaseAngle);
    vec2 phaseOffset = vec2(sin(phaseAngle) * 0.045 * (1.0 - phaseIllum * 0.5), 0.0);
    float dist = length(centered - phaseOffset);

    // Keep an atmospheric eclipse corona even at New Moon (0.38 base + 0.62 phase illumination)
    float phaseGlowScale = 0.38 + 0.62 * phaseIllum;

    // Soft exponential outer corona around the moon
    float coreGlow = exp(-dist * 3.8) * 0.75 * phaseGlowScale;
    float wideGlow = exp(-dist * 1.9) * 0.42 * phaseGlowScale;
    float edgeFade = smoothstep(1.0, 0.25, dist);

    // Delicate cyber-dream concentric refraction rings
    float ringDist = length(centered);
    float ring1 = exp(-abs(ringDist - 0.46) * 42.0) * 0.28 * uCyberIntensity;
    float ring2 = exp(-abs(ringDist - 0.64) * 55.0) * 0.16 * uCyberIntensity;

    // Subtle angular pulse on the ring
    float angle = atan(centered.y, centered.x);
    float angularMod = 0.7 + 0.3 * sin(angle * 4.0 + uTime * 0.6);

    vec3 color = uMoonCore * coreGlow + uMoonHalo * wideGlow;
    color += mix(uMoonHalo, uCyberAccent, 0.65) * (ring1 + ring2) * angularMod;

    float alpha = (coreGlow + wideGlow + (ring1 + ring2) * 0.8) * edgeFade * uMoonGlow;
    alpha = clamp(alpha, 0.0, 0.92);

    gl_FragColor = vec4(color, alpha);
  }
`;

export const oceanVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveDistortion;
  uniform float uDriftOffset;

  varying vec3 vWorldPosition;
  varying vec4 vScreenPos;
  varying vec2 vWaveUv;
  varying float vWaveHeight;

  // Smooth long-wavelength swells so the camera appears to float over a smooth sea
  float calculateSwell(vec2 pos, float time) {
    float h = 0.0;
    // Primary slow ocean roll
    h += sin(pos.x * 0.045 + time * 0.75) * cos(pos.y * 0.035 + time * 0.55) * 0.28;
    // Secondary diagonal harmonic swell
    h += sin((pos.x * 0.07 - pos.y * 0.05) + time * 1.05) * 0.14;
    // Gentle cross ripple
    h += cos(pos.y * 0.11 - time * 0.9) * 0.07;
    return h * (0.45 + 0.55 * uWaveDistortion);
  }

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);

    // Continuous forward drift coordinate
    vec2 sampleCoord = vec2(worldPosition.x, worldPosition.z - uDriftOffset);

    // Fade vertex displacement slightly in the far distance to keep horizon razor-smooth
    float distFromCam = length(worldPosition.xz);
    float distanceAttenuation = exp(-distFromCam * 0.0025);

    float time = uTime * uWaveSpeed;
    float height = calculateSwell(sampleCoord, time) * distanceAttenuation;

    worldPosition.y += height;
    vWaveHeight = height;
    vWorldPosition = worldPosition.xyz;
    vWaveUv = sampleCoord;

    vec4 clipPos = projectionMatrix * viewMatrix * worldPosition;
    vScreenPos = clipPos;
    gl_Position = clipPos;
  }
`;

// Shared water-surface GLSL (noise, analytical wave normals, drizzle impact rings) used by
// both the above-water ocean shader and the underwater view of the surface from beneath
export const oceanSurfaceCommon = /* glsl */ `
  // Smooth 2D gradient/value noise for silky liquid water ripples
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Multi-layered smooth wave elevation function for high-precision analytical normals
  float waveHeightMap(vec2 p, float t) {
    float h = 0.0;
    // Layer 1: Broad glossy swells
    h += sin(p.x * 0.18 + t * 1.1 + cos(p.y * 0.14 - t * 0.8)) * 0.35;
    h += cos(p.y * 0.24 - t * 1.35 + sin(p.x * 0.19 + t * 0.7)) * 0.28;

    // Layer 2: Medium silk undulation (rotational domain warp)
    vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p * 0.42;
    h += (noise2D(q + vec2(t * 0.45, -t * 0.35)) - 0.5) * 0.42;

    // Layer 3: Fine capillary shimmer for moon reflection breakup
    vec2 r = mat2(0.6, 0.8, -0.8, 0.6) * p * 1.15;
    h += (noise2D(r - vec2(t * 0.65, t * 0.55)) - 0.5) * 0.18;

    // Layer 4: Micro-ripples close to camera
    h += (noise2D(p * 2.6 + vec2(0.0, t * 0.9)) - 0.5) * 0.07;

    return h;
  }

  vec3 getWaveNormal(vec2 pos, float distToCam, float t) {
    // Filter out micro-ripples in the far distance to prevent aliasing while preserving horizontal wave streaks
    float detailFade = exp(-distToCam * 0.0045);
    float eps = mix(0.35, 0.08, detailFade);

    float hL = waveHeightMap(pos - vec2(eps, 0.0), t);
    float hR = waveHeightMap(pos + vec2(eps, 0.0), t);
    float hD = waveHeightMap(pos - vec2(0.0, eps), t);
    float hU = waveHeightMap(pos + vec2(0.0, eps), t);

    float strength = (0.045 + 0.095 * uWaveDistortion) * (0.35 + 0.65 * detailFade);
    vec3 n = vec3((hL - hR) * strength, 1.0, (hD - hU) * strength);
    return normalize(n);
  }

  // Procedural Digital Drizzle Raindrop Impacts on the Water Surface
  // Computes normal perturbation (xy) and bioluminescent impact ring highlight (z)
  vec3 computeDrizzleRipples(vec2 worldXZ, float distToCam, float time) {
    float distAtten = exp(-distToCam * 0.022);
    if (distAtten < 0.02) return vec3(0.0);

    vec2 totalNormal = vec2(0.0);
    float totalSparkle = 0.0;

    // Two staggered cellular raindrop grids so expanding rings overlap naturally
    for (int layer = 0; layer < 2; layer++) {
      float scale = layer == 0 ? 0.55 : 0.82;
      vec2 p = worldXZ * scale + vec2(float(layer) * 13.7, float(layer) * 29.3);
      vec2 cellId = floor(p);
      vec2 cellUv = fract(p) - 0.5;

      float seed = hash21(cellId + float(layer) * 71.0);
      float cycleSpeed = 1.65 + seed * 0.95;
      float dropTime = fract(time * cycleSpeed + seed * 10.0);

      // Random drop position inside cell
      vec2 dropCenter = (vec2(hash21(cellId * 1.7), hash21(cellId * 2.3)) - 0.5) * 0.48;
      vec2 delta = cellUv - dropCenter;
      float d = length(delta);

      // Expanding capillary ring radius
      float ringRadius = dropTime * 0.46;
      float ringDiff = d - ringRadius;

      // High-frequency concentric wave packet around the expanding wavefront
      float wavePacket = sin(ringDiff * 48.0) * exp(-abs(ringDiff) * 18.0);
      float lifeFade = (1.0 - dropTime) * (1.0 - dropTime) * smoothstep(0.0, 0.06, dropTime);

      vec2 radDir = delta / max(d, 0.001);
      totalNormal += radDir * wavePacket * lifeFade;

      // Crisp digital impact glint & ring crest
      float impactFlash = exp(-d * 24.0) * exp(-dropTime * 14.0) * 1.6;
      float ringCrest = smoothstep(0.2, 0.9, wavePacket) * lifeFade * 0.65;
      totalSparkle += (impactFlash + ringCrest);
    }

    return vec3(totalNormal * 0.22 * distAtten, totalSparkle * distAtten);
  }
`;

// Splash ripples on the sea surface, shared by the above-water ocean and its underside.
//
// An impulse on deep water (Cauchy–Poisson problem) does not stamp a fixed ring pattern:
// each wavelength leaves at its own group velocity c_g = 0.5 * sqrt(g / k), so long waves
// race ahead and short ones trail. At radius r and time t the surface carries wavenumber
// k = g t^2 / (4 r^2) with phase g t^2 / (4 r), so rings are born at the centre, accelerate
// outward and stretch apart, leaving calm water behind. A fish-sized source only excites a
// band of wavenumbers, which turns the infinite train into an expanding, widening ring packet.
export const splashRippleCommon = /* glsl */ `
  const float SPLASH_G = 9.8;

  // One impulse, t seconds old. px is the world-space pixel footprint (for anti-aliasing).
  // Returns (dEta/dr, crest glow, agitation).
  vec3 dispersiveRingPacket(float r, float t, float kLo, float kHi, float px) {
    if (t <= 0.0) return vec3(0.0);
    r = max(r, 0.03);
    float k = SPLASH_G * t * t / (4.0 * r * r);
    float phase = k * r;
    float band = smoothstep(kLo * 0.4, kLo, k) * (1.0 - smoothstep(kHi, kHi * 2.2, k));
    // Energy spreads around the ring and across the packet's growing width; short waves damp fastest
    float amp = band * inversesqrt(1.0 + r * (1.0 + 0.4 * t)) * exp(-0.012 * k * k * t);
    // Crests finer than a couple of pixels fade out instead of aliasing (dPhase/dr = k)
    amp *= 1.0 - smoothstep(0.8, 2.2, k * px);
    float sn = sin(phase);
    float cs = cos(phase);
    return vec3(amp * k * sn, amp * k * smoothstep(0.15, 1.0, cs), amp * k * abs(sn));
  }

  // splash = (x, z, age, strength). The main impulse (impact, or the hole collapsing behind a
  // breaching tail) is followed ~0.3 s later by the weaker rebound of the collapsing cavity.
  // Returns (normal offset xz, ring glow, core glow).
  vec4 splashSurface(vec2 p, vec4 splash, float px) {
    float S = splash.w;
    if (S <= 0.0) return vec4(0.0);
    vec2 delta = p - splash.xy;
    float r = length(delta);
    if (r > 45.0) return vec4(0.0);
    float t = splash.z;
    float kHi = 2.6 / sqrt(max(S, 0.2));
    vec3 a = dispersiveRingPacket(r, t, 0.35, kHi, px);
    vec3 b = dispersiveRingPacket(r, t - 0.3, 0.5, kHi * 1.5, px) * 0.45;
    float dEta = (a.x + b.x) * 0.16 * S;

    // The crater at the source bobs and settles over a couple of seconds
    float w = 0.3 * S * S + 0.05;
    float core = exp(-r * r / w);
    float coreOsc = core * exp(-t * 1.4) * cos(t * 7.0);
    dEta += 2.0 * r / w * coreOsc * 0.1 * S;

    vec2 radDir = delta / max(r, 0.001);
    // Plankton flash where the water is sheared: glow rides the passing crests
    float ringGlow = ((a.y + b.y) * 0.5 + (a.z + b.z) * 0.15) * S;
    float coreGlow = core * (exp(-t * 1.3) * 0.5 + exp(-t * 0.35) * 0.1) * S;
    return vec4(-radDir * dEta, ringGlow, coreGlow);
  }
`;

export const oceanFragmentShader = /* glsl */ `
  uniform sampler2D uReflectionMap;
  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveDistortion;
  uniform float uDriftOffset;
  uniform float uMoonGlow;
  uniform float uMoonScale;
  uniform float uMoonPhase;
  uniform float uFogAmount;
  uniform float uDrizzleAmount;
  uniform float uDofStrength;
  uniform float uFocalDistance;
  uniform float uCyberIntensity;

  uniform vec3 uCameraPos;
  uniform vec3 uMoonDirection;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform vec3 uMoonCore;
  uniform vec3 uMoonHalo;
  uniform vec3 uWaterDeep;
  uniform vec3 uWaterShallow;
  uniform vec3 uCyberAccent;
  uniform vec4 uCreatureRipples[4];

  varying vec3 vWorldPosition;
  varying vec4 vScreenPos;
  varying vec2 vWaveUv;
  varying float vWaveHeight;

  ${oceanSurfaceCommon}
  ${splashRippleCommon}

  void main() {
    float t = uTime * uWaveSpeed;
    vec3 viewVec = uCameraPos - vWorldPosition;
    float distToCam = length(viewVec);
    vec3 viewDir = normalize(viewVec);

    // Compute smooth procedural water normal
    vec3 normal = getWaveNormal(vWaveUv, distToCam, t);

    // Splash ripples: dispersive ring packets spreading from where fish break the surface
    vec2 bioNormalOffset = vec2(0.0);
    float bioSubsurfaceGlow = 0.0;
    float bioRingHighlight = 0.0;
    float bioColorSeed = 0.0;
    float splashPx = length(fwidth(vWorldPosition.xz));

    for (int i = 0; i < 4; i++) {
      vec4 sp = splashSurface(vWorldPosition.xz, uCreatureRipples[i], splashPx);
      bioNormalOffset += sp.xy;
      bioRingHighlight += sp.z * 1.4 + sp.w * 0.6;
      bioSubsurfaceGlow += sp.z * 0.5 + sp.w;
      bioColorSeed += float(i) * 0.75 * step(0.01, sp.z + sp.w);
    }

    normal = normalize(vec3(normal.x + bioNormalOffset.x, normal.y, normal.z + bioNormalOffset.y));

    // Apply Digital Drizzle raindrop impact ripples across the water surface
    float drizzleSparkle = 0.0;
    if (uDrizzleAmount > 0.01) {
      vec3 drizzleData = computeDrizzleRipples(vWaveUv, distToCam, uTime);
      normal = normalize(vec3(
        normal.x + drizzleData.x * uDrizzleAmount,
        normal.y,
        normal.z + drizzleData.y * uDrizzleAmount
      ));
      drizzleSparkle = drizzleData.z * uDrizzleAmount;
    }

    // Ethereal Depth-of-Field (DoF) Circle of Confusion:
    // Near-field and far-horizon zones outside uFocalDistance soften into dreamy bokeh
    float focalDiff = abs(distToCam - uFocalDistance);
    float coc = clamp(focalDiff / (26.0 + 18.0 * step(uFocalDistance, distToCam)), 0.0, 1.0) * uDofStrength;

    // Screen-space coordinates for sampling the real-time planar reflection target
    // Invert Y (1.0 - y) so the planar reflection mirrors vertically across the horizon
    vec2 rawScreenUV = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
    vec2 screenUV = vec2(rawScreenUV.x, 1.0 - rawScreenUV.y);

    // Anisotropic water distortion:
    // Real water reflections stretch horizontally into liquid ribbons and compress vertically
    float distFactor = clamp(1.0 - distToCam / 550.0, 0.18, 1.0);
    vec2 rippleOffset = vec2(
      normal.x * (0.16 + 0.28 * uWaveDistortion),
      normal.z * (0.065 + 0.14 * uWaveDistortion) * distFactor
    );

    // Add harmonic horizontal wave-ribbon oscillation so the moon reflection dances in liquid bands
    float ribbonWave = sin(vWaveUv.y * 1.45 - t * 2.2 + normal.x * 9.0) * 0.016 * uWaveDistortion;
    float fineWave = cos(vWaveUv.y * 4.2 - t * 3.4 + vWaveUv.x * 0.5) * 0.007 * uWaveDistortion;
    rippleOffset.x += ribbonWave + fineWave;

    vec2 reflUV = clamp(screenUV + rippleOffset, vec2(0.002), vec2(0.998));

    // Sample planar reflection with subtle cyber-dream chromatic dispersion & DoF Bokeh Blur
    float chromaShift = (length(rippleOffset) * 0.085 + coc * 0.004) * uCyberIntensity;
    vec3 reflColor;
    reflColor.r = texture2D(uReflectionMap, clamp(reflUV + vec2(chromaShift, 0.0), 0.002, 0.998)).r;
    reflColor.g = texture2D(uReflectionMap, reflUV).g;
    reflColor.b = texture2D(uReflectionMap, clamp(reflUV - vec2(chromaShift, 0.0), 0.002, 0.998)).b;

    if (coc > 0.02) {
      // 4-tap golden-angle bokeh disk kernel for ethereal depth-of-field softness
      float blurRad = coc * 0.014;
      vec3 bokehSum = reflColor * 1.4;
      bokehSum += texture2D(uReflectionMap, clamp(reflUV + vec2(blurRad, blurRad * 0.4), 0.002, 0.998)).rgb;
      bokehSum += texture2D(uReflectionMap, clamp(reflUV + vec2(-blurRad, -blurRad * 0.4), 0.002, 0.998)).rgb;
      bokehSum += texture2D(uReflectionMap, clamp(reflUV + vec2(blurRad * 0.5, -blurRad * 0.85), 0.002, 0.998)).rgb;
      bokehSum += texture2D(uReflectionMap, clamp(reflUV + vec2(-blurRad * 0.5, blurRad * 0.85), 0.002, 0.998)).rgb;
      reflColor = bokehSum / 5.4;
    }

    // Lunar phase illumination factor (0.0 at New Moon, 1.0 at Full Moon)
    float phaseAngle = uMoonPhase * 6.28318530718;
    float phaseIllum = 0.5 - 0.5 * cos(phaseAngle);
    float specularPhaseScale = 0.28 + 0.72 * phaseIllum;

    // Analytical 3D reflection vector for crisp HDR lunar glitter & broken light ribbons
    vec3 reflectDir = reflect(-viewDir, normal);
    // Shift effective moon specular direction slightly toward the illuminated crescent limb
    vec3 moonDir = normalize(uMoonDirection + vec3(sin(phaseAngle) * 0.018 * uMoonScale * (1.0 - phaseIllum * 0.5), 0.0, 0.0));

    // Anisotropic stretched normal for the classic shimmering "moon path" on the sea
    vec3 anisoNormal = normalize(vec3(normal.x * 0.65, normal.y, normal.z * 2.4));
    vec3 anisoReflect = reflect(-viewDir, anisoNormal);
    float moonAlign = max(dot(anisoReflect, moonDir), 0.0);
    float tightAlign = max(dot(reflectDir, moonDir), 0.0);

    // Specular moon path: broad liquid glow + intense broken silver/cyan sparkles on wave facets
    // Soften specular exponent slightly in out-of-focus DoF zones for dreamy bokeh bloom
    float dofSoften = 1.0 - coc * 0.42;
    float moonSizeFactor = uMoonScale * (0.65 + 0.35 * phaseIllum);
    float broadPath = pow(moonAlign, (18.0 * dofSoften) / max(moonSizeFactor, 0.5)) * 0.65;
    float mediumRibbon = pow(moonAlign, (65.0 * dofSoften) / max(moonSizeFactor, 0.5)) * 1.15;
    float crispGlitter = smoothstep(0.991 - coc * 0.006, 0.9995, tightAlign) * (2.4 - coc * 0.9);

    vec3 analyticalMoonReflection = (
      uMoonHalo * broadPath * uMoonGlow +
      mix(uMoonHalo, uMoonCore, 0.65) * mediumRibbon * uMoonGlow +
      uMoonCore * crispGlitter * uMoonGlow
    ) * specularPhaseScale;

    // Base deep sea color with subsurface scattering in wave crests
    float crestFactor = smoothstep(-0.2, 0.32, vWaveHeight + normal.z * 0.8);
    vec3 seaBase = mix(uWaterDeep, uWaterShallow, crestFactor * 0.7);
    // Bioluminescent subsurface scatter facing the moon path
    float sss = pow(max(dot(viewDir, -moonDir + normal * 0.6), 0.0), 3.0) * crestFactor;
    seaBase += mix(uMoonHalo, uCyberAccent, 0.5) * sss * 0.25 * uMoonGlow * specularPhaseScale;

    // Schlick Fresnel term: water is dark when looking straight down, and a near-perfect mirror at grazing angles
    float ndotv = max(dot(normal, viewDir), 0.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - ndotv, 4.2);
    fresnel = clamp(fresnel + 0.18, 0.0, 1.0);

    // Combine base sea color, distorted planar reflection, and analytical lunar glitter path
    vec3 bioTint = mix(uCyberAccent, uMoonHalo, 0.4 + 0.35 * sin(uTime * 1.1 + bioColorSeed));
    seaBase += bioTint * bioSubsurfaceGlow * 0.75;

    vec3 combinedReflection = reflColor * 1.15 + analyticalMoonReflection * 0.72;
    vec3 waterColor = mix(seaBase, combinedReflection, fresnel);
    waterColor += mix(bioTint, uMoonCore, 0.45) * bioRingHighlight * 0.85;

    // Add Digital Drizzle raindrop impact sparkles on the water surface
    if (drizzleSparkle > 0.001) {
      vec3 drizzleCol = mix(uCyberAccent, uMoonCore, 0.55);
      waterColor += drizzleCol * drizzleSparkle * (0.45 + 0.55 * uMoonGlow);
    }

    // Subtle cyber-dream aesthetic: faint luminous contour filaments & synth grid along wave crests
    if (uCyberIntensity > 0.01) {
      // Delicate contour shimmer along wave elevation lines
      float contour = abs(fract(normal.x * 9.0 + normal.z * 9.0 - uTime * 0.15) - 0.5);
      float contourLine = smoothstep(0.06, 0.0, contour) * crestFactor * exp(-distToCam * 0.008);

      // Whisper-subtle perspective cyber grid in the mid-distance catching moonlight
      vec2 gridUv = vWaveUv * vec2(0.16, 0.16);
      vec2 grid = abs(fract(gridUv - 0.5) - 0.5) / fwidth(gridUv);
      float gridLine = 1.0 - min(min(grid.x, grid.y), 1.0);
      float gridMask = exp(-distToCam * 0.0065) * smoothstep(8.0, 35.0, distToCam) * (0.25 + 0.75 * pow(moonAlign, 4.0));

      waterColor += uCyberAccent * (contourLine * 0.28 + gridLine * gridMask * 0.16) * uCyberIntensity;
    }

    // Smooth atmospheric horizon fog + Procedural Rolling Mist Banks over the sea
    float baseFogExp = 0.0021 + uFogAmount * 0.0038 + coc * 0.0012;
    float fogFactor = 1.0 - exp(-pow(distToCam * baseFogExp, 1.45));

    // Rolling procedural FBM fog banks drifting across the water surface
    if (uFogAmount > 0.01) {
      vec2 fogUv = vWaveUv * 0.025 + vec2(uTime * 0.04, -uTime * 0.025);
      float f1 = noise2D(fogUv);
      float f2 = noise2D(fogUv * 2.3 - vec2(uTime * 0.06, uTime * 0.03));
      float mistBank = smoothstep(0.32, 0.82, f1 * 0.65 + f2 * 0.35);
      float bankDistanceMask = smoothstep(6.0, 28.0, distToCam) * exp(-distToCam * 0.004);
      fogFactor = clamp(fogFactor + mistBank * bankDistanceMask * uFogAmount * 0.48, 0.0, 0.96);
    }

    vec3 horizonFogColor = uSkyHorizon + mix(uMoonHalo, uCyberAccent, 0.4) * (0.26 + 0.14 * uFogAmount) * uMoonGlow * specularPhaseScale;
    // Extra lunar horizon bloom directly beneath the moon
    float azimuthAlign = max(dot(normalize(vec3(vWorldPosition.x - uCameraPos.x, 0.0, vWorldPosition.z - uCameraPos.z)), normalize(vec3(moonDir.x, 0.0, moonDir.z))), 0.0);
    horizonFogColor += uMoonHalo * pow(azimuthAlign, 8.0 - 3.5 * clamp(uFogAmount, 0.0, 1.0)) * (0.38 + 0.22 * uFogAmount) * uMoonGlow * specularPhaseScale;

    waterColor = mix(waterColor, horizonFogColor, clamp(fogFactor, 0.0, 1.0));

    // Subtle filmic tone mapping / soft contrast curve
    waterColor = waterColor / (1.0 + waterColor * 0.18);

    gl_FragColor = vec4(waterColor, 1.0);
  }
`;

export const starfieldVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aColorMix;
  attribute float aPhase;
  attribute float aLayer;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uStarfieldDensity;
  uniform float uCyberIntensity;
  uniform float uMoonPhase;
  uniform vec3 uMoonDirection;

  varying float vColorMix;
  varying float vAlpha;
  varying float vIsBeacon;
  varying float vPhase;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec3 dir = normalize(worldPosition.xyz);

    // Subtle vertical parallax & horizon extinction
    float horizonFade = smoothstep(0.012, 0.19, dir.y);

    // Lunar glare occlusion: stars close to the glowing moon dim naturally (especially at Full Moon)
    float phaseIllum = 0.5 - 0.5 * cos(uMoonPhase * 6.28318530718);
    float moonDot = max(dot(dir, normalize(uMoonDirection)), 0.0);
    float moonOcclusion = 1.0 - smoothstep(0.94, 0.996, moonDot) * (0.45 + 0.55 * phaseIllum);

    // Individual harmonic scintillation (twinkle)
    float twinkleSpeed = 1.2 + aColorMix * 1.8;
    float twinkle = 0.62 + 0.38 * sin(uTime * twinkleSpeed + aPhase * 6.28318);
    // Occasional cyber-pulse harmonic on foreground beacon stars
    float cyberPulse = 1.0 + 0.25 * uCyberIntensity * aLayer * sin(uTime * 2.8 - aPhase * 3.0);

    vec4 mvPosition = viewMatrix * worldPosition;
    float densityScale = clamp(uStarfieldDensity, 0.0, 2.0);

    // Beacon stars (aSize > 2.6) render larger to accommodate 4-point cyber diffraction flares
    vIsBeacon = step(2.6, aSize);
    float pointSize = aSize * (0.75 + 0.45 * aLayer) * (0.7 + 0.3 * densityScale) * cyberPulse;
    gl_PointSize = clamp(pointSize * uPixelRatio, 1.2, 18.0);

    vColorMix = aColorMix;
    vPhase = aPhase;
    vAlpha = horizonFade * moonOcclusion * twinkle * clamp(densityScale, 0.0, 1.5);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const starfieldFragmentShader = /* glsl */ `
  uniform vec3 uMoonCore;
  uniform vec3 uMoonHalo;
  uniform vec3 uCyberAccent;
  uniform float uCyberIntensity;
  uniform float uTime;

  varying float vColorMix;
  varying float vAlpha;
  varying float vIsBeacon;
  varying float vPhase;

  void main() {
    if (vAlpha <= 0.005) discard;

    vec2 uv = (gl_PointCoord - 0.5) * 2.0;
    float dist = length(uv);
    if (dist > 1.0) discard;

    // Crisp Gaussian star core
    float core = exp(-dist * dist * 10.5);
    float halo = exp(-dist * 3.2) * 0.45;

    // 4-point cyber-dream anamorphic diffraction spikes on bright beacon stars
    float spikeH = exp(-abs(uv.y) * 16.0) * exp(-abs(uv.x) * 2.4);
    float spikeV = exp(-abs(uv.x) * 16.0) * exp(-abs(uv.y) * 2.4);
    float spikes = (spikeH + spikeV) * vIsBeacon * (0.45 + 0.55 * uCyberIntensity);

    // Spectral cyber-dream starlight palette:
    // Blend between pure diamond white, lunar halo cyan/indigo, and neon cyber accent
    vec3 starWhite = mix(vec3(0.96, 0.98, 1.0), uMoonCore, 0.5);
    vec3 tintA = mix(starWhite, uMoonHalo, smoothstep(0.15, 0.65, vColorMix));
    vec3 starColor = mix(tintA, uCyberAccent, smoothstep(0.6, 0.98, vColorMix) * (0.55 + 0.45 * uCyberIntensity));

    // Subtle chromatic shimmer on beacon spikes
    vec3 finalColor = starColor * (core * 1.45 + halo) + mix(uMoonCore, uCyberAccent, 0.6) * spikes * 1.2;

    float alpha = clamp((core + halo + spikes * 0.85) * vAlpha, 0.0, 1.0);
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export const constellationVertexShader = /* glsl */ `
  attribute float aAlpha;

  uniform float uTime;
  uniform float uStarfieldDensity;
  uniform float uCyberIntensity;
  uniform float uMoonPhase;
  uniform vec3 uMoonDirection;

  varying float vLineAlpha;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec3 dir = normalize(worldPosition.xyz);

    float horizonFade = smoothstep(0.05, 0.24, dir.y);
    float phaseIllum = 0.5 - 0.5 * cos(uMoonPhase * 6.28318530718);
    float moonDot = max(dot(dir, normalize(uMoonDirection)), 0.0);
    float moonOcclusion = 1.0 - smoothstep(0.92, 0.99, moonDot) * (0.5 + 0.5 * phaseIllum);

    float pulse = 0.65 + 0.35 * sin(uTime * 0.9 + dir.x * 6.0 + dir.z * 6.0);
    vLineAlpha = aAlpha * horizonFade * moonOcclusion * pulse * clamp(uStarfieldDensity, 0.0, 1.6) * (0.25 + 0.75 * uCyberIntensity);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const constellationFragmentShader = /* glsl */ `
  uniform vec3 uMoonHalo;
  uniform vec3 uCyberAccent;

  varying float vLineAlpha;

  void main() {
    if (vLineAlpha <= 0.004) discard;
    vec3 col = mix(uMoonHalo, uCyberAccent, 0.65);
    gl_FragColor = vec4(col, vLineAlpha * 0.24);
  }
`;

// Shooting-star flight path, shared by the trail ribbon and the head flare.
// \`position\` is the launch point; aParams = (spawnTime, flightDuration, width, hue).
const shootingStarPathCommon = /* glsl */ `
  attribute vec3 aVelocity;
  attribute vec4 aParams;

  uniform float uTime;
  uniform vec3 uGravity;

  vec3 shootingStarPath(float t) {
    return position + aVelocity * t + 0.5 * uGravity * t * t;
  }
`;

export const shootingStarTrailVertexShader = /* glsl */ `
  ${shootingStarPathCommon}

  attribute vec2 aTrail; // x: 0..1 along the flight path, y: -1 / +1 ribbon side

  uniform float uFadeTime;
  uniform vec3 uWind;

  varying float vSide;
  varying float vSince;
  varying float vAlpha;
  varying float vHue;
  varying float vAlong;

  void main() {
    float age = uTime - aParams.x;
    float flight = aParams.y;
    float headT = clamp(age, 0.0, flight);
    float sampleT = aTrail.x * flight;
    // Points the head hasn't reached yet collapse onto it, so the ribbon tapers to a point there
    float t = min(sampleT, headT);
    float reached = step(sampleT, headT + 1e-4);
    // Seconds since the head burned through this point of the trail
    float since = max(age - t, 0.0);

    vec3 pos = shootingStarPath(t);
    vec3 tangent = normalize(aVelocity + uGravity * t);
    vec3 side = normalize(cross(tangent, pos - cameraPosition));

    // As the ionised trail cools it drifts on the high-altitude wind and curls like smoke
    float curl = sin(aTrail.x * 23.0 + aParams.w * 40.0 + uTime * 0.7)
      + 0.5 * sin(aTrail.x * 57.0 - uTime * 1.3);
    pos += uWind * since + side * curl * since * 1.6;

    float tailTaper = smoothstep(0.0, 0.3, aTrail.x);
    float spread = 1.0 + since * 1.5;
    float width = aParams.z * (0.3 + 0.7 * tailTaper) * spread * reached;
    pos += side * aTrail.y * width;

    float horizonFade = smoothstep(0.0, 0.07, normalize(pos).y);
    // Light spreads thinner as the trail billows out, then fades away slowly
    vAlpha = step(0.0, age) * reached * horizonFade * exp(-since / uFadeTime)
      * pow(spread, -0.35) * smoothstep(0.0, 0.12, aTrail.x);

    vSide = aTrail.y;
    vSince = since;
    vHue = aParams.w;
    vAlong = aTrail.x;

    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
    // Push spent trails past the far plane instead of rasterising invisible triangles
    if (vAlpha < 0.002) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }
`;

export const shootingStarTrailFragmentShader = /* glsl */ `
  uniform vec3 uMoonCore;
  uniform vec3 uCyberAccent;
  uniform vec3 uNeonPink;
  uniform vec3 uNeonViolet;
  uniform float uCyberIntensity;
  uniform float uFogAmount;
  uniform float uTime;

  varying float vSide;
  varying float vSince;
  varying float vAlpha;
  varying float vHue;
  varying float vAlong;

  void main() {
    float v2 = vSide * vSide;
    float core = exp(-v2 * 22.0);
    float glow = exp(-v2 * 3.2);
    // The hot filament dissolves into a soft neon haze as it ages
    float diffuse = smoothstep(0.0, 1.6, vSince);
    float profile = mix(core * 2.2 + glow * 0.9, glow * 1.1, diffuse);

    vec3 hot = mix(vec3(1.0), uMoonCore, 0.3);
    vec3 neon = mix(uCyberAccent, uNeonPink, vHue);
    vec3 cooled = mix(uNeonPink, uNeonViolet, vHue);
    vec3 col = mix(neon, cooled, smoothstep(0.3, 3.0, vSince));
    col = mix(col, hot, exp(-vSince * 5.0) * core);

    // Faint retro scan banding drifting through the cooling haze
    float bands = 1.0 + 0.22 * uCyberIntensity * diffuse * sin(vAlong * 160.0 - uTime * 3.0);

    float alpha = profile * vAlpha * bands * (1.0 - 0.65 * uFogAmount);
    if (alpha <= 0.002) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export const shootingStarHeadVertexShader = /* glsl */ `
  ${shootingStarPathCommon}

  uniform float uPixelRatio;

  varying float vIntensity;
  varying float vHue;

  void main() {
    float age = uTime - aParams.x;
    float flight = max(aParams.y, 1e-3);
    vec3 pos = shootingStarPath(clamp(age, 0.0, flight));

    float life = age / flight;
    // Ignite, flare brighter just before burning out, then wink away
    float flare = life < 1.0
      ? 1.0 + 0.9 * smoothstep(0.7, 1.0, life)
      : 1.9 * exp(-(age - flight) * 8.0);
    vIntensity = step(0.0, age) * smoothstep(0.0, 0.1, life) * flare
      * smoothstep(0.0, 0.07, normalize(pos).y);
    vHue = aParams.w;

    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
    gl_PointSize = clamp(aParams.z * 6.0 * (0.7 + 0.3 * vIntensity) * uPixelRatio, 0.0, 64.0);
    if (vIntensity < 0.002) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }
`;

export const shootingStarHeadFragmentShader = /* glsl */ `
  uniform vec3 uMoonCore;
  uniform vec3 uCyberAccent;
  uniform vec3 uNeonPink;
  uniform float uFogAmount;

  varying float vIntensity;
  varying float vHue;

  void main() {
    vec2 uv = (gl_PointCoord - 0.5) * 2.0;
    float dist = length(uv);
    if (dist > 1.0) discard;

    float core = exp(-dist * dist * 28.0);
    float halo = exp(-dist * 4.5) * 0.6;
    float spikes = (exp(-abs(uv.y) * 22.0) * exp(-abs(uv.x) * 3.0)
      + exp(-abs(uv.x) * 22.0) * exp(-abs(uv.y) * 3.0)) * 0.7;

    vec3 hot = mix(vec3(1.0), uMoonCore, 0.3);
    vec3 neon = mix(uCyberAccent, uNeonPink, vHue);
    vec3 col = hot * core * 1.6 + neon * (halo + spikes);

    float alpha = clamp((core + halo + spikes) * vIntensity, 0.0, 1.0) * (1.0 - 0.65 * uFogAmount);
    gl_FragColor = vec4(col, alpha);
  }
`;

export const creatureVertexShader = /* glsl */ `
  // RIG_JOINTS is injected via material defines (RIG_JOINT_COUNT)
  attribute float aSpineT;
  attribute vec3 aFeature; // x: eyeMask, y: crestMask, z: radialCoord
  attribute vec2 aRig; // x: spine t this vertex is bound to, y: tendril u (0 on the body)
  attribute vec3 aLocalPos; // rest offset in the bound spine frame (right, dorsal, tangent)
  attribute vec3 aLocalNormal;

  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveDistortion;
  uniform float uDriftOffset;
  uniform vec3 uJointPos[RIG_JOINTS];
  uniform vec4 uJointQuat[RIG_JOINTS];
  uniform vec3 uHeadVelocity;
  uniform float uCycleProgress;
  uniform float uCreatureSeed;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vSpineT;
  varying vec3 vFeature;
  varying float vWaterSurfaceY;

  // Match the ocean vertex shader's swell calculation so the creature rides the waves accurately
  float calculateSwell(vec2 pos, float time) {
    float h = 0.0;
    h += sin(pos.x * 0.045 + time * 0.75) * cos(pos.y * 0.035 + time * 0.55) * 0.28;
    h += sin((pos.x * 0.07 - pos.y * 0.05) + time * 1.05) * 0.14;
    h += cos(pos.y * 0.11 - time * 0.9) * 0.07;
    return h * (0.45 + 0.55 * uWaveDistortion);
  }

  vec3 quatRotate(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }

  // Sample the deformed spine at t: Hermite-interpolated position (C1 smooth between
  // joints, using each joint's tangent axis) and normalised-lerp orientation
  void sampleSpine(float t, out vec3 spinePos, out vec4 spineQuat) {
    float f = clamp(t, 0.0, 1.0) * float(RIG_JOINTS - 1);
    int i0 = int(min(floor(f), float(RIG_JOINTS - 2)));
    float s = f - float(i0);

    vec3 p0 = uJointPos[i0];
    vec3 p1 = uJointPos[i0 + 1];
    vec4 q0 = uJointQuat[i0];
    vec4 q1 = uJointQuat[i0 + 1];
    if (dot(q0, q1) < 0.0) q1 = -q1;

    float segLen = length(p1 - p0);
    vec3 m0 = quatRotate(q0, vec3(0.0, 0.0, 1.0)) * segLen;
    vec3 m1 = quatRotate(q1, vec3(0.0, 0.0, 1.0)) * segLen;

    float s2 = s * s;
    float s3 = s2 * s;
    spinePos = (2.0 * s3 - 3.0 * s2 + 1.0) * p0 + (s3 - 2.0 * s2 + s) * m0
             + (-2.0 * s3 + 3.0 * s2) * p1 + (s3 - s2) * m1;
    spineQuat = normalize(mix(q0, q1, s));
  }

  void main() {
    vSpineT = aSpineT;
    vFeature = aFeature;

    // 1. Skin the vertex onto the procedurally rigged spine
    vec3 spinePos;
    vec4 spineQuat;
    sampleSpine(aRig.x, spinePos, spineQuat);
    vec3 pos = spinePos + quatRotate(spineQuat, aLocalPos);
    vec3 norm = quatRotate(spineQuat, aLocalNormal);

    // 2. Crown tendrils trail behind head motion (drag follow-through, stronger toward the tips)
    pos -= uHeadVelocity * 0.075 * pow(aRig.y, 1.6);

    // Gossamer flutter on dorsal crown, gill-frills, and tendrils (aFeature.y)
    if (aFeature.y > 0.01) {
      float flutter = sin(uTime * 5.4 - aSpineT * 15.0 + uCreatureSeed * 2.0) * 0.055 * aFeature.y;
      pos.x += flutter;
      pos.y += cos(uTime * 4.2 - aSpineT * 12.0) * 0.03 * aFeature.y;
    }

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);

    // Evaluate ocean wave height at this world XZ coordinate
    vec2 sampleCoord = vec2(worldPos.x, worldPos.z - uDriftOffset);
    float distFromCam = length(worldPos.xz);
    float distanceAttenuation = exp(-distFromCam * 0.0025);
    float waterY = calculateSwell(sampleCoord, uTime * uWaveSpeed) * distanceAttenuation;

    // Ride the ocean swell smoothly
    worldPos.y += waterY * 0.88;
    vWaterSurfaceY = waterY;
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * norm);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const creatureFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uCycleProgress;
  uniform float uCreatureSeed;
  uniform float uColorVariant;
  uniform float uCyberIntensity;
  uniform float uMoonGlow;
  uniform vec3 uCameraPos;
  uniform vec3 uMoonCore;
  uniform vec3 uMoonHalo;
  uniform vec3 uCyberAccent;
  uniform vec3 uWaterDeep;
  uniform float uWetness;
  uniform float uSubmergedView; // 1.0 when the camera is underwater: show the submerged body instead


  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vSpineT;
  varying vec3 vFeature; // x: eyeMask, y: crestMask, z: radialCoord
  varying float vWaterSurfaceY;

  float creatureHash(float n) {
    return fract(sin(n * 127.1) * 43758.5453);
  }

  void main() {
    // Height relative to the local undulating water surface
    float heightAboveWater = vWorldPosition.y - vWaterSurfaceY;

    // Cleanly clip the submerged portion below the water surface so both the main view
    // and the planar reflection pass only render the emerging upper body & meniscus.
    // Seen from underwater the clip flips: only the trunk below the surface is drawn.
    bool submerged = uSubmergedView > 0.5;
    if (submerged ? heightAboveWater > 0.06 : heightAboveWater < -0.06) {
      discard;
    }

    vec3 viewDir = normalize(uCameraPos - vWorldPosition);
    vec3 normal = normalize(vWorldNormal);
    if (!gl_FrontFacing) {
      normal = -normal;
    }

    // Bioluminescent palette for this individual creature
    vec3 bioPrimary = mix(uCyberAccent, uMoonHalo, uColorVariant * 0.7);
    vec3 bioSecondary = mix(uMoonHalo, vec3(0.92, 0.45, 0.98), (1.0 - uColorVariant) * 0.55 * uCyberIntensity);

    // 1. Translucent abyssal skin base with strong Fresnel rim luminescence
    float ndotv = max(dot(normal, viewDir), 0.0);
    float fresnel = pow(1.0 - ndotv, 2.3);
    vec3 skinCore = mix(uWaterDeep * 0.55, bioPrimary * 0.18, 0.4);
    vec3 color = mix(skinCore, bioPrimary * 1.35, fresnel * 0.85);

    // 2. Travelling bioluminescent neural pulse waves rising from neck to crown
    float neuralWave = pow(0.5 + 0.5 * sin(vSpineT * 22.0 - uTime * 3.8 + uCreatureSeed), 3.5);
    float secondaryPulse = 0.5 + 0.5 * cos(vSpineT * 10.0 - uTime * 2.1);

    // 3. Organic cellular photophore spots & cyber-vein striations along the flanks
    float radialSymmetry = abs(vFeature.z - 0.5) * 2.0;
    float spotPattern = sin(vSpineT * 52.0 + uCreatureSeed) * cos(radialSymmetry * 26.0);
    float photophores = smoothstep(0.58, 0.92, spotPattern) * smoothstep(0.15, 0.85, vSpineT);
    color += mix(bioPrimary, uMoonCore, 0.4) * photophores * (0.45 + 0.85 * neuralWave) * uMoonGlow;

    // Subtle lateral neural circuit line along the neck
    float lateralLine = exp(-abs(radialSymmetry - 0.52) * 28.0) * smoothstep(0.1, 0.82, vSpineT);
    color += bioSecondary * lateralLine * (0.5 + 0.7 * neuralWave) * (0.6 + 0.4 * uCyberIntensity);

    // 4. Translucent Dorsal Crown, Lateral Sea-Dragon Frills & Tendrils (vFeature.y)
    if (vFeature.y > 0.01) {
      float rayRibs = 0.65 + 0.35 * sin(vSpineT * 65.0 - uTime * 3.0);
      vec3 crestColor = mix(bioPrimary, bioSecondary, 0.45 + 0.35 * sin(vSpineT * 12.0));
      crestColor = mix(crestColor, uMoonCore, 0.35 * neuralWave);
      color += crestColor * vFeature.y * rayRibs * (0.85 + 0.65 * secondaryPulse) * uMoonGlow;
    }

    // 5. Expressive Glowing Ocular Nodes / Eyes (vFeature.x)
    if (vFeature.x > 0.01) {
      vec3 eyeGlow = mix(bioPrimary, uMoonCore, 0.72) * (2.2 + 0.6 * sin(uTime * 3.2 + uCreatureSeed));
      color = mix(color, eyeGlow, clamp(vFeature.x * 1.25, 0.0, 1.0));
    }

    // 6. Luminous Water-Line Meniscus Ring where the creature pierces the sea surface
    float meniscusBand = exp(-abs(heightAboveWater - 0.03) * 16.0);
    color += mix(bioPrimary, uMoonCore, 0.55) * meniscusBand * 1.35 * uMoonGlow;

    // 7. Water sheeting off freshly surfaced skin: glossy sheen plus rivulets running down
    // toward the waterline, strongest just after breaching and always present near the surface
    float wet = clamp(uWetness * exp(-max(heightAboveWater, 0.0) * 0.55)
              + 0.25 * exp(-max(heightAboveWater, 0.0) * 3.5), 0.0, 1.0) * (1.0 - uSubmergedView);
    float column = floor(vFeature.z * 48.0);
    float colRand = creatureHash(column + uCreatureSeed);
    float rivulet = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(vFeature.z * 6.2831853 * 48.0))
                  * step(0.45, colRand);
    float dripPhase = fract(vWorldPosition.y * 0.9 + uTime * (1.2 + 0.9 * colRand) + colRand * 7.0);
    float drip = smoothstep(0.0, 0.06, dripPhase) * (1.0 - smoothstep(0.06, 0.4, dripPhase));
    color += mix(uMoonCore, bioPrimary, 0.3) * rivulet * (0.25 + drip) * wet * 0.8 * uMoonGlow;
    color += uMoonCore * pow(fresnel, 4.0) * wet * 0.55;

    // Smooth alpha fade at the water-line intersection and translucent frills
    float waterAlpha = smoothstep(-0.06, 0.04, heightAboveWater);
    float frillAlpha = mix(0.96, 0.82, vFeature.y * (1.0 - fresnel * 0.5));

    if (submerged) {
      // Underwater: the body dissolves into the water column with distance, while its
      // photophores and eyes keep glowing through the murk
      float camDist = length(uCameraPos - vWorldPosition);
      float murk = 1.0 - exp(-camDist * 0.024);
      float emissive = clamp(photophores + vFeature.x + lateralLine * 0.5, 0.0, 1.0);
      vec3 murkColor = uWaterDeep * 0.8 + bioPrimary * 0.04;
      color = mix(color, murkColor, murk * (1.0 - 0.55 * emissive));
      // Fade in and out at the ends of the dive cycle instead of popping
      waterAlpha = smoothstep(0.06, -0.04, heightAboveWater)
                 * smoothstep(0.08, 0.16, uCycleProgress) * (1.0 - smoothstep(0.84, 0.92, uCycleProgress));
    }

    gl_FragColor = vec4(color, waterAlpha * frillAlpha);
  }
`;

export const skyWhaleVertexShader = /* glsl */ `
  attribute float aSpineT;
  attribute vec4 aFeature; // x: tentacleFactor, y: wingFactor, z: bellRimFactor, w: radialCoord

  uniform float uTime;
  uniform float uCreatureSeed;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vSpineT;
  varying vec4 vFeature;

  void main() {
    vSpineT = aSpineT;
    vFeature = aFeature;

    vec3 pos = position;
    vec3 norm = normal;

    float t = uTime * 1.45 + uCreatureSeed;
    float bodyT = clamp(aSpineT, 0.0, 1.0);

    // 1. Slow, majestic Cetacean Spine & Tail Fluke vertical swimming wave
    float spineWave = sin(t - bodyT * 4.2) * (0.07 + 0.48 * pow(bodyT, 1.85));
    float lateralSway = cos(t * 0.7 - bodyT * 3.1) * 0.14 * pow(bodyT, 1.4);
    pos.y += spineWave * (1.0 - aFeature.x * 0.5);
    pos.x += lateralSway * (1.0 - aFeature.x * 0.5);

    // 2. Rhythmic Medusa Jellyfish Bell Canopy Contraction & Expansion
    float bellMask = clamp(aFeature.z, 0.0, 1.0) * (1.0 - step(0.01, aFeature.x));
    if (bellMask > 0.01) {
      float bellPulse = sin(t - 0.55);
      float radialExpand = 1.0 + bellPulse * 0.14 * bellMask;
      pos.x *= radialExpand;
      pos.y += bellPulse * 0.12 * bellMask;
      pos.z -= bellPulse * 0.09 * bellMask;
    }

    // 3. Sweeping Humpback Pectoral Wing-Flippers & Medusa Trailing Frills (aFeature.y)
    if (aFeature.y > 0.01) {
      float wingFlap = sin(t - aFeature.y * 1.85) * 0.78 * pow(aFeature.y, 1.35);
      float frillRipple = sin(uTime * 3.8 - aFeature.w * 9.0 + uCreatureSeed) * 0.08 * aFeature.y;
      pos.y += wingFlap + frillRipple;
      pos.z -= abs(wingFlap) * 0.12;
    }

    // 4. Streaming Bioluminescent Jellyfish Tentacles & Oral Filaments (aFeature.x)
    if (aFeature.x > 0.01) {
      float u = aFeature.x;
      float tentacleWaveY =
        sin(t * 1.35 - u * 6.8 + aFeature.w * 6.28318) * 0.65 * pow(u, 1.25);
      float tentacleWaveX =
        cos(t * 1.15 - u * 5.6 + aFeature.w * 12.566) * 0.52 * pow(u, 1.25);
      pos.y += tentacleWaveY;
      pos.x += tentacleWaveX;
    }

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * norm);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const skyWhaleFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uCreatureSeed;
  uniform float uColorVariant;
  uniform float uCyberIntensity;
  uniform float uMoonGlow;
  uniform float uOpacityScale;
  uniform vec3 uCameraPos;
  uniform vec3 uMoonCore;
  uniform vec3 uMoonHalo;
  uniform vec3 uCyberAccent;
  uniform vec3 uSkyHorizon;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vSpineT;
  varying vec4 vFeature; // x: tentacleFactor, y: wingFactor, z: bellRimFactor, w: radialCoord

  void main() {
    vec3 viewVec = uCameraPos - vWorldPosition;
    float distToCam = length(viewVec);
    vec3 viewDir = normalize(viewVec);

    vec3 normal = normalize(vWorldNormal);
    if (!gl_FrontFacing) {
      normal = -normal;
    }

    // Individual bioluminescent palette (blending cyan, lunar halo, and electric violet/magenta)
    vec3 bioPrimary = mix(uCyberAccent, uMoonHalo, uColorVariant * 0.65);
    vec3 bioSecondary = mix(
      vec3(0.88, 0.42, 0.98),
      uCyberAccent,
      0.45 + 0.45 * sin(uColorVariant * 6.283 + uTime * 0.25)
    );

    // 1. Translucent Mesoglea (Jellyfish Bell) Fresnel Rim & Core Shading
    float ndotv = max(dot(normal, viewDir), 0.0);
    float fresnel = pow(1.0 - ndotv, 2.0);

    vec3 deepCore = mix(uSkyHorizon * 0.65, bioPrimary * 0.25, 0.45);
    vec3 color = mix(deepCore, bioPrimary * 1.4, fresnel * 0.88);

    // 2. Internal Pulsing Bioluminescent Medusa Heart inside the Bell Canopy
    float heartMask = exp(-pow((vSpineT - 0.34) * 5.2, 2.0)) * (1.0 - step(0.01, vFeature.x));
    float heartBeat = 0.6 + 0.4 * sin(uTime * 2.4 + uCreatureSeed);
    color += mix(bioSecondary, uMoonCore, 0.5) * heartMask * heartBeat * (1.0 - fresnel * 0.4) * 0.95 * uMoonGlow;

    // 3. Cascading Bioluminescent Neural Waves from Brow -> Bell -> Flukes -> Tentacle Tips
    float pulseWave = pow(0.5 + 0.5 * sin(vSpineT * 12.0 - uTime * 3.1 + uCreatureSeed), 3.2);

    // 4. Radial Jellyfish Bell Canals & Ventral Whale Throat Pleat Striations
    float radialCanals = pow(0.5 + 0.5 * cos(vFeature.w * 6.28318 * 14.0), 3.5);
    float bellHighlight = clamp(vFeature.z, 0.0, 1.0);
    color += mix(bioPrimary, bioSecondary, 0.5) * radialCanals * (0.35 + 0.65 * bellHighlight) * (0.45 + 0.75 * pulseWave);

    // Scalloped Bell Margin & Wingtip Gossamer Rim Glow
    float rimGlow = smoothstep(0.35, 0.98, bellHighlight) + smoothstep(0.4, 1.0, vFeature.y) * 0.7;
    color += mix(bioPrimary, uMoonCore, 0.45) * rimGlow * (0.55 + 0.55 * pulseWave) * 0.75 * uMoonGlow;

    // 5. Cellular Bioluminescent Photophore Spots across the Whale Back & Wings
    if (vFeature.x < 0.01) {
      float spots = sin(vSpineT * 55.0 + uCreatureSeed) * cos(vFeature.w * 6.28318 * 18.0);
      float spotMask = smoothstep(0.68, 0.96, spots);
      color += uMoonCore * spotMask * (0.4 + 0.8 * pulseWave) * 0.75;
    }

    // 6. Streaming Bioluminescent Tentacles (vFeature.x > 0.01)
    if (vFeature.x > 0.01) {
      float u = vFeature.x;
      float BeadWave = pow(0.5 + 0.5 * sin(u * 26.0 - uTime * 4.4 + vFeature.w * 12.0), 3.0);
      vec3 tentacleCol = mix(bioPrimary, bioSecondary, u);
      tentacleCol = mix(tentacleCol, uMoonCore, BeadWave * 0.65);
      color = tentacleCol * (0.85 + 1.15 * BeadWave) * uMoonGlow;
    }

    // 7. Luminous Cetacean Eyes (encoded in vFeature.z > 1.4)
    if (vFeature.z > 1.4) {
      float eyeIntensity = clamp((vFeature.z - 1.4) * 2.0, 0.0, 1.0);
      color = mix(color, mix(uMoonCore, bioPrimary, 0.25) * 2.4, eyeIntensity);
    }

    // 8. Aerial Perspective & Translucent Jellyfish Alpha
    float distFade = exp(-distToCam * 0.0032);
    color = mix(uSkyHorizon * 1.1, color, distFade);

    float baseAlpha = mix(0.52, 0.92, fresnel * 0.7 + bellHighlight * 0.3 + heartMask * 0.35);
    if (vFeature.x > 0.01) {
      // Taper tentacle opacity gracefully toward the very tip
      baseAlpha = (1.0 - pow(vFeature.x, 2.2) * 0.75) * 0.88;
    }

    float finalAlpha = clamp(baseAlpha * distFade * uOpacityScale, 0.0, 0.96);
    gl_FragColor = vec4(color, finalAlpha);
  }
`;

export const drizzleVertexShader = /* glsl */ `
  attribute float aStreakEnd;
  attribute float aSeed;
  attribute float aLength;

  uniform float uTime;
  uniform float uDriftOffset;
  uniform float uDrizzleAmount;
  uniform float uFocalDistance;
  uniform float uDofStrength;

  varying float vAlpha;
  varying float vSeed;
  varying float vStreakEnd;

  void main() {
    vSeed = aSeed;
    vStreakEnd = aStreakEnd;

    vec3 pos = position;

    // Continuous downward fall + gentle cyber-breeze slant
    float fallSpeed = 16.0 + aSeed * 10.0;
    float fallenY = mod(pos.y - uTime * fallSpeed, 34.0);
    pos.y = fallenY;

    // Wrap Z continuously with camera drift
    pos.z = -3.0 - mod(-(pos.z + uDriftOffset * 1.15), 112.0);
    // Slight wind slant
    pos.x += sin(uTime * 0.4 + aSeed * 6.28) * 0.8;

    // Offset the trailing tail vertex upward along the rain slant vector
    float streakLen = aLength * (0.7 + 0.4 * clamp(uDrizzleAmount, 0.0, 1.5));
    pos.y += (1.0 - aStreakEnd) * streakLen;
    pos.x += (1.0 - aStreakEnd) * streakLen * 0.08;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float dist = -mvPosition.z;

    // Depth-of-field variation: drops near the focal plane are crisp;
    // very close or distant drops soften in opacity
    float coc = clamp(abs(dist - uFocalDistance) / 28.0, 0.0, 1.0) * uDofStrength;
    float distFade = smoothstep(112.0, 45.0, dist) * smoothstep(2.5, 9.0, dist);
    float waterFade = smoothstep(0.0, 2.2, pos.y);

    // Digital intermittent shimmer along the streak
    float digitalPulse = 0.55 + 0.45 * sin(uTime * 6.0 + aSeed * 45.0);
    vAlpha = distFade * waterFade * digitalPulse * (1.0 - coc * 0.45) * clamp(uDrizzleAmount, 0.0, 1.4);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const drizzleFragmentShader = /* glsl */ `
  uniform vec3 uMoonCore;
  uniform vec3 uMoonHalo;
  uniform vec3 uCyberAccent;
  uniform float uCyberIntensity;

  varying float vAlpha;
  varying float vSeed;
  varying float vStreakEnd;

  void main() {
    if (vAlpha <= 0.005) discard;

    // Bright leading droplet head, fading smoothly toward the upper tail
    float headGlow = pow(vStreakEnd, 1.4);
    vec3 col = mix(uMoonHalo, uCyberAccent, fract(vSeed * 3.7) * (0.5 + 0.5 * uCyberIntensity));
    col = mix(col, uMoonCore, headGlow * 0.65);

    gl_FragColor = vec4(col, vAlpha * headGlow * 0.58);
  }
`;

export const mistVertexShader = /* glsl */ `
  attribute float aSeed;

  uniform float uTime;
  uniform float uDriftOffset;
  uniform float uFogAmount;

  varying vec2 vUv;
  varying float vSeed;
  varying float vDistFade;

  void main() {
    vUv = uv;
    vSeed = aSeed;

    vec3 pos = position;
    // Wrap Z so low-lying mist banks drift continuously across the water
    pos.z = -12.0 - mod(-(pos.z + uDriftOffset * 0.85), 125.0);
    pos.x += sin(uTime * 0.18 + aSeed * 6.283) * 4.5;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float dist = -mvPosition.z;
    vDistFade = smoothstep(130.0, 55.0, dist) * smoothstep(8.0, 24.0, dist);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const mistFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uFogAmount;
  uniform float uMoonGlow;
  uniform float uCyberIntensity;
  uniform vec3 uSkyHorizon;
  uniform vec3 uMoonHalo;
  uniform vec3 uCyberAccent;

  varying vec2 vUv;
  varying float vSeed;
  varying float vDistFade;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    if (uFogAmount <= 0.01 || vDistFade <= 0.005) discard;

    // Soft elliptical billow mask
    vec2 centered = (vUv - 0.5) * 2.0;
    float edgeMask = smoothstep(1.0, 0.1, length(centered));

    // Rolling FBM mist texture
    vec2 nUv = vUv * vec2(3.5, 1.8) + vec2(uTime * 0.08 + vSeed * 10.0, 0.0);
    float n = noise2D(nUv) * 0.65 + noise2D(nUv * 2.2 - vec2(uTime * 0.05, 0.0)) * 0.35;

    vec3 mistColor = mix(uSkyHorizon * 1.25, mix(uMoonHalo, uCyberAccent, 0.4 * uCyberIntensity), 0.38);
    float alpha = edgeMask * n * vDistFade * clamp(uFogAmount, 0.0, 1.4) * 0.22;

    gl_FragColor = vec4(mistColor * (0.85 + 0.25 * uMoonGlow), alpha);
  }
`;




