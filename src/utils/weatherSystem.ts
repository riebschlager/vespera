import * as THREE from 'three';
import { WeatherMode } from '../types/scene';

export interface WeatherState {
  fogAmount: number;       // 0.0 to 1.5
  drizzleAmount: number;   // 0.0 to 1.5
  dofStrength: number;     // 0.0 to 1.0 (ethereal depth-of-field bokeh intensity)
  focalDistance: number;   // Distance in meters where reflections are sharpest (breathes between 24m and 52m)
}

/**
 * Manages the 3D Digital Drizzle particle streaks, low-lying volumetric mist veils,
 * and intermittent weather & depth-of-field envelopes.
 */
export class CyberWeatherSystem {
  public readonly group: THREE.Group;
  public readonly drizzleLines: THREE.LineSegments;
  public readonly drizzleMaterial: THREE.ShaderMaterial;
  public readonly mistMesh: THREE.Mesh;
  public readonly mistMaterial: THREE.ShaderMaterial;

  private drizzleGeometry: THREE.BufferGeometry;
  private mistGeometry: THREE.BufferGeometry;

  private smoothedFog = 0.0;
  private smoothedDrizzle = 0.0;
  private smoothedDof = 0.0;

  constructor(
    drizzleVertexShader: string,
    drizzleFragmentShader: string,
    mistVertexShader: string,
    mistFragmentShader: string
  ) {
    this.group = new THREE.Group();

    // 1. Build 3D Digital Drizzle Streak Geometry (LineSegments)
    const streakCount = 700;
    const positions = new Float32Array(streakCount * 2 * 3);
    const ends = new Float32Array(streakCount * 2);
    const seeds = new Float32Array(streakCount * 2);
    const lengths = new Float32Array(streakCount * 2);

    for (let i = 0; i < streakCount; i++) {
      const x = (Math.random() - 0.5) * 110.0;
      const y = Math.random() * 34.0;
      const z = -3.0 - Math.random() * 115.0;
      const seed = Math.random();
      const len = 0.9 + Math.random() * 1.65;

      const idx6 = i * 6;
      const idx2 = i * 2;

      // Top tail vertex (end = 0)
      positions[idx6] = x;
      positions[idx6 + 1] = y;
      positions[idx6 + 2] = z;
      ends[idx2] = 0.0;
      seeds[idx2] = seed;
      lengths[idx2] = len;

      // Bottom leading drop vertex (end = 1)
      positions[idx6 + 3] = x;
      positions[idx6 + 4] = y;
      positions[idx6 + 5] = z;
      ends[idx2 + 1] = 1.0;
      seeds[idx2 + 1] = seed;
      lengths[idx2 + 1] = len;
    }

    this.drizzleGeometry = new THREE.BufferGeometry();
    this.drizzleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    this.drizzleGeometry.setAttribute(
      'aStreakEnd',
      new THREE.BufferAttribute(ends, 1)
    );
    this.drizzleGeometry.setAttribute(
      'aSeed',
      new THREE.BufferAttribute(seeds, 1)
    );
    this.drizzleGeometry.setAttribute(
      'aLength',
      new THREE.BufferAttribute(lengths, 1)
    );

    this.drizzleMaterial = new THREE.ShaderMaterial({
      vertexShader: drizzleVertexShader,
      fragmentShader: drizzleFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uDriftOffset: { value: 0 },
        uDrizzleAmount: { value: 0 },
        uCyberIntensity: { value: 0.6 },
        uFocalDistance: { value: 34.0 },
        uDofStrength: { value: 0.5 },
        uMoonCore: { value: new THREE.Color('#f0f9ff') },
        uMoonHalo: { value: new THREE.Color('#38bdf8') },
        uCyberAccent: { value: new THREE.Color('#06b6d4') },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.drizzleLines = new THREE.LineSegments(
      this.drizzleGeometry,
      this.drizzleMaterial
    );
    this.drizzleLines.frustumCulled = false;
    this.group.add(this.drizzleLines);

    // 2. Build Low-Lying Volumetric Mist Veils hovering just above the waves
    const veilCount = 16;
    const veilPositions: number[] = [];
    const veilUvs: number[] = [];
    const veilSeeds: number[] = [];
    const veilIndices: number[] = [];

    for (let i = 0; i < veilCount; i++) {
      const baseV = i * 4;
      const w = 26.0 + (i % 4) * 9.0;
      const h = 3.2 + (i % 3) * 1.4;
      const cx = ((i * 37.0) % 96.0) - 48.0;
      const cy = 0.8 + (i % 3) * 0.85;
      const cz = -16.0 - i * 7.8;
      const seed = (i * 0.173) % 1.0;

      const corners = [
        [-w * 0.5, -h * 0.5, 0, 0],
        [w * 0.5, -h * 0.5, 1, 0],
        [w * 0.5, h * 0.5, 1, 1],
        [-w * 0.5, h * 0.5, 0, 1],
      ];

      for (const [ox, oy, u, v] of corners) {
        veilPositions.push(cx + ox, cy + oy, cz);
        veilUvs.push(u, v);
        veilSeeds.push(seed);
      }

      veilIndices.push(
        baseV,
        baseV + 1,
        baseV + 2,
        baseV,
        baseV + 2,
        baseV + 3
      );
    }

    this.mistGeometry = new THREE.BufferGeometry();
    this.mistGeometry.setIndex(veilIndices);
    this.mistGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(veilPositions, 3)
    );
    this.mistGeometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(veilUvs, 2)
    );
    this.mistGeometry.setAttribute(
      'aSeed',
      new THREE.Float32BufferAttribute(veilSeeds, 1)
    );

    this.mistMaterial = new THREE.ShaderMaterial({
      vertexShader: mistVertexShader,
      fragmentShader: mistFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uDriftOffset: { value: 0 },
        uFogAmount: { value: 0 },
        uMoonGlow: { value: 1.2 },
        uCyberIntensity: { value: 0.6 },
        uSkyHorizon: { value: new THREE.Color('#171332') },
        uMoonHalo: { value: new THREE.Color('#38bdf8') },
        uCyberAccent: { value: new THREE.Color('#06b6d4') },
      },
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mistMesh = new THREE.Mesh(this.mistGeometry, this.mistMaterial);
    this.mistMesh.frustumCulled = false;
    this.group.add(this.mistMesh);
  }

  public update(params: {
    dt: number;
    elapsedTime: number;
    driftOffset: number;
    weatherMode: WeatherMode;
    weatherIntensity: number;
    cyberIntensity: number;
    moonGlow: number;
    skyHorizon: THREE.Color;
    moonCore: THREE.Color;
    moonHalo: THREE.Color;
    cyberAccent: THREE.Color;
  }): WeatherState {
    const {
      dt,
      elapsedTime,
      driftOffset,
      weatherMode,
      weatherIntensity,
      cyberIntensity,
      moonGlow,
      skyHorizon,
      moonCore,
      moonHalo,
      cyberAccent,
    } = params;

    // Compute intermittent organic weather envelopes
    // Slow rolling swells so fog banks and digital drizzle showers drift in and out naturally
    const fogWave =
      0.55 +
      0.45 * Math.sin(elapsedTime * 0.23 + 0.8) * Math.cos(elapsedTime * 0.11);
    const drizzleWave =
      0.52 +
      0.48 * Math.sin(elapsedTime * 0.29 - 0.6) * Math.sin(elapsedTime * 0.14 + 1.2);

    let targetFog = 0.0;
    let targetDrizzle = 0.0;

    if (weatherIntensity > 0.01) {
      switch (weatherMode) {
        case 'fog':
          targetFog = weatherIntensity * (0.78 + 0.22 * fogWave);
          targetDrizzle = 0.0;
          break;
        case 'drizzle':
          targetFog = weatherIntensity * 0.26;
          targetDrizzle = weatherIntensity * (0.82 + 0.18 * drizzleWave);
          break;
        case 'intermittent':
          targetFog = weatherIntensity * (0.35 + 0.65 * fogWave);
          targetDrizzle = weatherIntensity * (0.3 + 0.7 * drizzleWave);
          break;
        case 'clear':
        default:
          targetFog = 0.0;
          targetDrizzle = 0.0;
          break;
      }
    }

    const lerpRate = Math.min(1.0, dt * 2.5);
    this.smoothedFog += (targetFog - this.smoothedFog) * lerpRate;
    this.smoothedDrizzle += (targetDrizzle - this.smoothedDrizzle) * lerpRate;

    const targetDof = Math.min(
      1.0,
      this.smoothedFog * 0.65 + this.smoothedDrizzle * 0.45
    );
    this.smoothedDof += (targetDof - this.smoothedDof) * lerpRate;

    // Ethereal breathing focal distance (24m to 48m ahead of the floating camera)
    const focalDistance =
      34.0 + Math.sin(elapsedTime * 0.32) * 10.0 + Math.cos(elapsedTime * 0.19) * 4.0;

    // Update 3D Digital Drizzle uniforms
    this.drizzleLines.visible = this.smoothedDrizzle > 0.01;
    const du = this.drizzleMaterial.uniforms;
    du.uTime.value = elapsedTime;
    du.uDriftOffset.value = driftOffset;
    du.uDrizzleAmount.value = this.smoothedDrizzle;
    du.uCyberIntensity.value = cyberIntensity;
    du.uFocalDistance.value = focalDistance;
    du.uDofStrength.value = this.smoothedDof;
    du.uMoonCore.value.copy(moonCore);
    du.uMoonHalo.value.copy(moonHalo);
    du.uCyberAccent.value.copy(cyberAccent);

    // Update Low-Lying Mist Veils uniforms
    this.mistMesh.visible = this.smoothedFog > 0.01;
    const mu = this.mistMaterial.uniforms;
    mu.uTime.value = elapsedTime;
    mu.uDriftOffset.value = driftOffset;
    mu.uFogAmount.value = this.smoothedFog;
    mu.uMoonGlow.value = moonGlow;
    mu.uCyberIntensity.value = cyberIntensity;
    mu.uSkyHorizon.value.copy(skyHorizon);
    mu.uMoonHalo.value.copy(moonHalo);
    mu.uCyberAccent.value.copy(cyberAccent);

    return {
      fogAmount: this.smoothedFog,
      drizzleAmount: this.smoothedDrizzle,
      dofStrength: this.smoothedDof,
      focalDistance,
    };
  }

  public dispose(): void {
    this.drizzleGeometry.dispose();
    this.drizzleMaterial.dispose();
    this.mistGeometry.dispose();
    this.mistMaterial.dispose();
  }
}
