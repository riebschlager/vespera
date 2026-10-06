import * as THREE from 'three';

export interface ProceduralStarfieldOptions {
  starCount?: number;
  minRadius?: number;
  maxRadius?: number;
  seed?: number;
}

export interface ProceduralStarfieldResult {
  starsGeometry: THREE.BufferGeometry;
  constellationGeometry: THREE.BufferGeometry;
}

/**
 * Deterministic PRNG (Mulberry32) so the procedural starfield & cyber-constellations
 * have a curated, reproducible celestial layout.
 */
function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a multi-layered 3D procedural starfield with:
 * - Volumetric depth shells (near, mid, far celestial spheres) for parallax depth
 * - Galactic cyber-band concentration tilted across the night sky
 * - Power-law star magnitude distribution (fine stardust + luminous beacon stars)
 * - Procedural cyber-constellation filament segments linking bright navigational stars
 */
export function generateProceduralStarfield(
  options: ProceduralStarfieldOptions = {}
): ProceduralStarfieldResult {
  const {
    starCount = 2400,
    minRadius = 560,
    maxRadius = 1080,
    seed = 20260927,
  } = options;

  const rand = createSeededRandom(seed);

  const positions = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const colorMixes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  const layers = new Float32Array(starCount); // 0 = deep background, 0.5 = mid shell, 1.0 = foreground beacon shell

  // Store bright beacon stars on the unit sphere to link into delicate cyber-constellations
  const beaconStars: { dir: THREE.Vector3; pos: THREE.Vector3 }[] = [];

  // Tilt matrix for a subtle galactic / cyber-dream astral band across the sky
  const bandTilt = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(0.32, -0.45, 0.58)
  );

  for (let i = 0; i < starCount; i++) {
    // 35% of stars biased toward the tilted galactic plane, 65% distributed across the upper hemisphere
    const isBandStar = rand() < 0.38;

    let dir = new THREE.Vector3();
    let attempts = 0;

    do {
      if (isBandStar && attempts < 8) {
        const lon = rand() * Math.PI * 2;
        // Gaussian-like concentration near galactic equator
        const lat = (rand() + rand() + rand() - 1.5) * 0.42;
        dir.set(
          Math.cos(lat) * Math.cos(lon),
          Math.sin(lat),
          Math.cos(lat) * Math.sin(lon)
        );
        dir.applyMatrix4(bandTilt).normalize();
      } else {
        // Uniform spherical distribution biased above horizon
        const u = rand();
        const v = rand();
        const theta = u * Math.PI * 2;
        // Bias slightly away from the immediate water plane
        const phi = Math.acos(1 - v * 0.96);
        dir.set(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta)
        );
      }
      attempts++;
    } while (dir.y < 0.015 && attempts < 15);

    if (dir.y < 0.015) {
      dir.y = Math.abs(dir.y) + 0.03;
      dir.normalize();
    }

    // Assign depth shell (creates 3D spatial depth and subtle parallax)
    const layerRoll = rand();
    const depthNorm =
      layerRoll < 0.6
        ? 0.75 + rand() * 0.25 // Deep background stardust
        : layerRoll < 0.9
        ? 0.35 + rand() * 0.4 // Mid-depth stars
        : rand() * 0.35; // Near-shell bright stars

    const radius = minRadius + depthNorm * (maxRadius - minRadius);
    const pos = dir.clone().multiplyScalar(radius);

    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;

    // Power-law magnitude distribution: mostly crisp pinpoints, occasional radiant beacons
    const magRoll = Math.pow(rand(), 4.2);
    const isBeacon = magRoll > 0.76 && dir.y > 0.08;
    const baseSize = isBeacon
      ? 2.8 + magRoll * 3.8
      : 0.75 + magRoll * 2.1;

    sizes[i] = baseSize;
    colorMixes[i] = rand(); // Spectral tint selector in shader
    phases[i] = rand() * Math.PI * 2;
    layers[i] = 1.0 - depthNorm;

    if (isBeacon && beaconStars.length < 95) {
      beaconStars.push({
        dir: dir.clone(),
        pos: dir.clone().multiplyScalar((minRadius + maxRadius) * 0.48),
      });
    }
  }

  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starsGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  starsGeometry.setAttribute('aColorMix', new THREE.BufferAttribute(colorMixes, 1));
  starsGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  starsGeometry.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));

  // Build delicate cyber-constellation line segments between nearby beacon stars
  const linePositions: number[] = [];
  const lineAlphas: number[] = [];
  const connectionCounts = new Array(beaconStars.length).fill(0);

  for (let i = 0; i < beaconStars.length; i++) {
    for (let j = i + 1; j < beaconStars.length; j++) {
      if (connectionCounts[i] >= 2 || connectionCounts[j] >= 2) continue;

      const angularDist = beaconStars[i].dir.distanceTo(beaconStars[j].dir);
      // Connect stars that are within a pleasant constellation angular span
      if (angularDist > 0.08 && angularDist < 0.24) {
        linePositions.push(
          beaconStars[i].pos.x,
          beaconStars[i].pos.y,
          beaconStars[i].pos.z,
          beaconStars[j].pos.x,
          beaconStars[j].pos.y,
          beaconStars[j].pos.z
        );
        const strength = 1.0 - (angularDist - 0.08) / 0.16;
        lineAlphas.push(strength, strength);
        connectionCounts[i]++;
        connectionCounts[j]++;
      }
    }
  }

  const constellationGeometry = new THREE.BufferGeometry();
  constellationGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(linePositions, 3)
  );
  constellationGeometry.setAttribute(
    'aAlpha',
    new THREE.Float32BufferAttribute(lineAlphas, 1)
  );

  return {
    starsGeometry,
    constellationGeometry,
  };
}
