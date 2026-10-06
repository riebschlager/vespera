import { waterVolumeCommon } from './underwaterShaders';

// ============================================================================
// BIOLUMINESCENT FISH SHADERS
// Instanced lantern-fish that school beneath the surface (carangiform tail-beat,
// turn bends & leap arches done in the vertex shader), plus the glowing spray
// thrown up whenever one leaps clear of the water and dives back in.
// ============================================================================

export const fishVertexShader = /* glsl */ `
  attribute vec3 aFeature;   // x/y: surface coords (body: radial v; fins: span u / chord v), z: fin type (0 body, 1 caudal, 2 median, 3 pectoral)
  attribute vec4 aFishStatic; // x: tail-beat offset, y: colour variant, z: seed
  attribute vec4 aFishState;  // x: fade, y: arch (leap curvature), z: tail-beat amplitude, w: tail-beat phase
  attribute vec4 aFishMotion; // x: wetness, y: turn bend, z: pectoral flare, w: glow boost

  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveDistortion;
  uniform float uDriftOffset;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vFeature;
  varying float vBodyS;
  varying float vWaterSurfaceY;
  varying vec4 vFishStatic;
  varying vec4 vFishState;
  varying vec4 vFishMotion;

  // Must match the ocean vertex shader's swell so the waterline clip lines up with the surface
  float calculateSwell(vec2 pos, float time) {
    float h = 0.0;
    h += sin(pos.x * 0.045 + time * 0.75) * cos(pos.y * 0.035 + time * 0.55) * 0.28;
    h += sin((pos.x * 0.07 - pos.y * 0.05) + time * 1.05) * 0.14;
    h += cos(pos.y * 0.11 - time * 0.9) * 0.07;
    return h * (0.45 + 0.55 * uWaveDistortion);
  }

  void main() {
    vec3 p = position;
    vec3 n = normal;
    float z = position.z;
    // 0 at the snout, ~1 at the caudal fin tips
    float s = 0.5 - z;
    float finType = aFeature.z;

    // Pectoral fins scull gently, and flare out while airborne
    if (finType > 2.5) {
      float scull = sin(uTime * 5.5 + aFishStatic.z * 4.0) * 0.5 + aFishMotion.z;
      p.y += aFeature.x * 0.05 * scull;
      p.x += sign(p.x) * aFeature.x * 0.03 * aFishMotion.z;
    }

    // Carangiform swimming: a lateral wave travelling snout -> tail, growing toward the tail
    float amp = aFishState.z;
    float k = 5.8;
    float env = 0.05 + 0.95 * s * s;
    float wavePhase = aFishState.w - k * s;
    float lateral = amp * env * sin(wavePhase);
    float dLatDs = amp * (1.9 * s * sin(wavePhase) - env * k * cos(wavePhase));
    // Whole-body bend while turning (head and tail both swing toward the turn)
    float bend = aFishMotion.y;
    lateral += bend * z * z;
    float dLatDz = -dLatDs + 2.0 * bend * z;
    p.x += lateral;
    n.z -= dLatDz * n.x;

    // Rainbow arch through the air so the body follows the curve of its leap
    float arch = aFishState.y;
    p.y -= arch * z * z;
    n.z -= -2.0 * arch * z * n.y;

    mat4 world = modelMatrix * instanceMatrix;
    vec4 worldPos = world * vec4(p, 1.0);

    vec2 sampleCoord = vec2(worldPos.x, worldPos.z - uDriftOffset);
    float distanceAttenuation = exp(-length(worldPos.xz) * 0.0025);
    vWaterSurfaceY = calculateSwell(sampleCoord, uTime * uWaveSpeed) * distanceAttenuation;

    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(world) * normalize(n));
    vFeature = aFeature;
    vBodyS = s;
    vFishStatic = aFishStatic;
    vFishState = aFishState;
    vFishMotion = aFishMotion;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const fishFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uCyberIntensity;
  uniform float uMoonGlow;
  uniform float uSubmergedView; // 1.0 while rendering the underwater view
  uniform vec3 uCameraPos;
  uniform vec3 uMoonDirection;
  ${waterVolumeCommon}

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vFeature;
  varying float vBodyS;
  varying float vWaterSurfaceY;
  varying vec4 vFishStatic;
  varying vec4 vFishState;
  varying vec4 vFishMotion;

  const float TAU = 6.2831853;

  void main() {
    float heightAboveWater = vWorldPosition.y - vWaterSurfaceY;
    bool submerged = uSubmergedView > 0.5;
    // Each view only draws its own side of the waterline, so a leaping fish crosses cleanly
    if (submerged ? heightAboveWater > 0.03 : heightAboveWater < -0.03) discard;

    float finType = vFeature.z;
    bool isFin = finType > 0.5;
    if (!isFin && !gl_FrontFacing) discard;

    vec3 toCam = uCameraPos - vWorldPosition;
    float camDist = length(toCam);
    vec3 viewDir = toCam / camDist;
    vec3 normal = normalize(vWorldNormal);
    if (!gl_FrontFacing) normal = -normal;

    float seed = vFishStatic.z;
    float variant = vFishStatic.y;
    float wet = vFishMotion.x;
    float glowBoost = 1.0 + vFishMotion.w;
    float s = vBodyS;

    vec3 bioPrimary = mix(uCyberAccent, uMoonHalo, variant * 0.7);
    vec3 bioSecondary = mix(uMoonHalo, vec3(0.92, 0.45, 0.98), (1.0 - variant) * 0.6 * uCyberIntensity);

    vec3 lightDir = submerged ? uMoonDirWater : normalize(uMoonDirection);
    float ndotv = max(dot(normal, viewDir), 0.0);
    float fresnel = pow(1.0 - ndotv, 2.4);
    float diffuse = max(dot(normal, lightDir), 0.0);

    // Light pulses racing from head to tail
    float pulse = pow(0.5 + 0.5 * sin(s * 13.0 - uTime * 4.2 + seed * 3.0), 6.0);
    float flicker = 0.8 + 0.2 * sin(uTime * 1.7 + seed * 11.0);

    vec3 color;
    float alpha = 1.0;
    float emissive = 0.0;

    if (!isFin) {
      // Radial angle around the body: 0 = dorsal ridge, PI/2 = right flank, PI = belly
      float a = vFeature.x * TAU;
      float flank = abs(sin(a));
      float up = cos(a);

      // Dark, countershaded translucent skin with a luminous rim
      vec3 back = mix(uWaterDeep * 0.5, bioPrimary * 0.1, 0.45);
      vec3 belly = mix(uWaterDeep * 0.9, bioSecondary * 0.22, 0.5);
      color = mix(belly, back, smoothstep(-0.4, 0.5, up));
      // Out in the air the skin catches the moon and its own glow brightens
      color += uMoonHalo * diffuse * (submerged ? 0.12 : 0.3) * uMoonGlow;
      color += bioPrimary * 0.4 * wet * (0.6 + 0.4 * pulse);
      color = mix(color, bioPrimary * 1.3, fresnel * 0.8);

      // Faint iridescent banding over the back
      float bands = smoothstep(0.6, 1.0, sin(s * 40.0 + up * 3.0)) * smoothstep(0.1, 0.7, up) * smoothstep(0.08, 0.3, s);
      color += mix(bioSecondary, bioPrimary, 0.5) * bands * 0.12;

      // Glowing lateral line along both flanks
      float lateralLine = exp(-abs(abs(a - 3.14159265) - 1.5708) * 26.0) * smoothstep(0.14, 0.3, s) * (1.0 - smoothstep(0.78, 0.9, s));
      color += bioPrimary * lateralLine * (0.35 + 1.1 * pulse) * glowBoost;

      // Row of photophores along the lower flanks
      float cell = fract(s / 0.045) - 0.5;
      float rowDist = abs(abs(a - 3.14159265) - 0.72);
      float photophore = exp(-(cell * cell * 34.0 + rowDist * rowDist * 70.0)) * smoothstep(0.16, 0.24, s) * (1.0 - smoothstep(0.7, 0.78, s));
      color += mix(bioSecondary, uMoonCore, 0.35) * photophore * (1.2 + 1.2 * pulse) * flicker * glowBoost * uMoonGlow;

      // Big lantern eyes on the upper flanks
      float eyeArc = min(abs(a - 1.12), abs(a - (TAU - 1.12)));
      float eyeD = length(vec2((s - 0.1) / 0.026, eyeArc / 0.36));
      if (eyeD < 1.0) {
        float iris = smoothstep(1.0, 0.75, eyeD);
        float pupil = smoothstep(0.42, 0.3, eyeD);
        vec3 eyeGlow = mix(bioPrimary, uMoonCore, 0.7) * (2.0 + 0.5 * sin(uTime * 3.0 + seed)) * glowBoost;
        color = mix(color, eyeGlow, iris);
        color = mix(color, uWaterDeep * 0.2 + bioPrimary * 0.15, pupil);
        emissive = max(emissive, iris);
      }

      emissive = max(emissive, clamp(lateralLine + photophore * 1.5, 0.0, 1.0));
    } else {
      // Gossamer fins: glowing rays fanning out, brightest along the trailing edge
      float span = vFeature.x;
      float chord = vFeature.y;
      float rays = finType < 1.5
        ? 0.5 + 0.5 * sin(chord * 38.0)
        : 0.5 + 0.5 * sin((finType < 2.5 ? span : chord) * 44.0);
      float edge = finType < 1.5
        ? smoothstep(0.65, 1.0, span)
        : finType < 2.5 ? smoothstep(0.55, 1.0, chord) : smoothstep(0.6, 1.0, span);
      vec3 finColor = mix(bioPrimary, bioSecondary, 0.35 + 0.35 * sin(s * 9.0 + seed));
      color = finColor * (0.18 + 0.4 * rays + 0.9 * edge * (0.6 + 0.6 * pulse)) * glowBoost * uMoonGlow;
      color += bioPrimary * fresnel * 0.4;
      alpha = 0.42 + 0.3 * rays + 0.25 * edge;
      emissive = 0.6;
    }

    // Wet sheen and moon glints while airborne
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 60.0);
    color += uMoonCore * (spec * 1.4 + pow(fresnel, 3.0) * 0.5) * wet * uMoonGlow;

    if (submerged) {
      // Dissolve into the water column with distance; photophores & eyes keep shining through
      float fog = 1.0 - exp(-camDist * 0.05);
      color = mix(color, waterVolumeColor(-viewDir), fog * (1.0 - 0.5 * emissive));
      alpha *= 1.0 - smoothstep(34.0, 46.0, camDist);
      alpha *= smoothstep(0.03, -0.02, heightAboveWater);
    } else {
      // Glowing meniscus where the body breaks the surface
      color += mix(bioPrimary, uMoonCore, 0.5) * exp(-abs(heightAboveWater) * 22.0) * 1.2;
      alpha *= smoothstep(-0.03, 0.02, heightAboveWater);
    }

    gl_FragColor = vec4(color, alpha * vFishState.x);
  }
`;

// ----------------------------------------------------------------------------
// Splash particles (simulated on the CPU in splashSimulation.ts)
// ----------------------------------------------------------------------------

// Spray droplets: water sheeting off the fish, the impact crown and the cavity-collapse jet
export const dropletVertexShader = /* glsl */ `
  attribute vec3 aDrop; // x: size (0..1), y: alpha, z: seed

  uniform float uPixelRatio;

  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec4 mvPosition = viewMatrix * vec4(position, 1.0);
    float dist = -mvPosition.z;
    gl_PointSize = aDrop.y > 0.0
      ? clamp((30.0 + 80.0 * aDrop.x) / max(dist, 0.5), 1.2, 12.0) * uPixelRatio
      : 0.0;
    vAlpha = aDrop.y;
    vSeed = aDrop.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const dropletFragmentShader = /* glsl */ `
  uniform vec3 uMoonCore;
  uniform vec3 uMoonHalo;
  uniform vec3 uCyberAccent;
  uniform float uMoonGlow;

  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = exp(-d * d * 22.0);
    vec3 col = mix(uMoonCore, mix(uCyberAccent, uMoonHalo, vSeed), 0.55 + 0.35 * vSeed);
    gl_FragColor = vec4(col * 1.6 * uMoonGlow, core * vAlpha);
  }
`;

// Tiny capillary rings where individual droplets land back on the sea
export const microRingVertexShader = /* glsl */ `
  attribute vec3 aRing; // x: start time, y: size, z: seed

  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveDistortion;
  uniform float uDriftOffset;

  varying vec2 vUv;
  varying float vAge;
  varying vec3 vRing;

  float calculateSwell(vec2 pos, float time) {
    float h = 0.0;
    h += sin(pos.x * 0.045 + time * 0.75) * cos(pos.y * 0.035 + time * 0.55) * 0.28;
    h += sin((pos.x * 0.07 - pos.y * 0.05) + time * 1.05) * 0.14;
    h += cos(pos.y * 0.11 - time * 0.9) * 0.07;
    return h * (0.45 + 0.55 * uWaveDistortion);
  }

  void main() {
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec2 sampleCoord = vec2(worldPos.x, worldPos.z - uDriftOffset);
    worldPos.y = calculateSwell(sampleCoord, uTime * uWaveSpeed) * exp(-length(worldPos.xz) * 0.0025) + 0.05;
    vUv = uv;
    vAge = uTime - aRing.x;
    vRing = aRing;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const microRingFragmentShader = /* glsl */ `
  uniform vec3 uMoonCore;
  uniform vec3 uCyberAccent;
  uniform float uMoonGlow;

  varying vec2 vUv;
  varying float vAge;
  varying vec3 vRing;

  void main() {
    if (vAge < 0.0) discard;
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    // Leading ring decelerates as it spreads; a fainter second ring trails it
    float front = 1.0 - exp(-vAge * 2.2);
    float w = 0.05 + 0.05 * front;
    float ring1 = exp(-pow((r - front) / w, 2.0));
    float ring2 = exp(-pow((r - front * 0.62) / (w * 0.8), 2.0)) * 0.45 * smoothstep(0.1, 0.35, vAge);
    float splashDot = exp(-r * r * 60.0) * exp(-vAge * 9.0);
    float fade = exp(-vAge * 2.3) * (1.0 - smoothstep(0.85, 1.0, r));
    vec3 col = mix(uCyberAccent, uMoonCore, 0.45 + 0.3 * vRing.z);
    gl_FragColor = vec4(col * 1.1 * uMoonGlow, (ring1 + ring2 + splashDot) * fade * (0.3 + 0.4 * vRing.y));
  }
`;

// Air dragged under by a diving fish, rising back to the surface as a bubble trail
export const bubbleVertexShader = /* glsl */ `
  attribute vec3 aBubble; // x: size (0..1), y: alpha, z: seed

  uniform float uTime;
  uniform float uPixelRatio;

  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec3 p = position;
    // Rising bubbles wobble in a tight spiral
    float wob = uTime * (7.0 + aBubble.z * 5.0) + aBubble.z * 40.0;
    p.x += sin(wob) * 0.03 * (0.4 + aBubble.x);
    p.z += cos(wob * 1.3) * 0.03 * (0.4 + aBubble.x);

    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    float dist = -mvPosition.z;
    gl_PointSize = aBubble.y > 0.0
      ? clamp((22.0 + 70.0 * aBubble.x) / max(dist, 0.4), 1.0, 18.0) * uPixelRatio
      : 0.0;
    vAlpha = aBubble.y * exp(-dist * 0.04);
    vSeed = aBubble.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const bubbleFragmentShader = /* glsl */ `
  uniform vec3 uMoonHalo;
  uniform vec3 uMoonCore;
  uniform vec3 uCyberAccent;

  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    // Thin bright rim with a specular glint, like the marine-snow bubbles
    float ring = smoothstep(0.5, 0.4, d) * smoothstep(0.24, 0.42, d);
    vec2 g = c - vec2(-0.14, -0.14);
    float spec = exp(-dot(g, g) * 160.0);
    vec3 col = mix(mix(uMoonHalo, uCyberAccent, vSeed * 0.5), uMoonCore, 0.5);
    gl_FragColor = vec4(col * 1.2, (ring * 0.6 + spec) * vAlpha);
  }
`;
