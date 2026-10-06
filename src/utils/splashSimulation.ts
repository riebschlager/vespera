import * as THREE from 'three';
import { swellHeightAt } from './oceanSwell';

const GRAVITY = 9.8;
const MAX_DROPLETS = 900;
const MAX_MICRO_RINGS = 160;
const MAX_BUBBLES = 420;
const MICRO_RING_LIFE = 1.6;
// Ripple packets are spent well before this (energy spread & damping), so the slot can be freed
const RIPPLE_LIFE = 16;
/** Number of simultaneous splash ripple sources the ocean shaders evaluate (uCreatureRipples). */
export const SPLASH_SOURCE_SLOTS = 4;

export interface SplashShaders {
  dropletVertex: string;
  dropletFragment: string;
  microRingVertex: string;
  microRingFragment: string;
  bubbleVertex: string;
  bubbleFragment: string;
}

interface SurfaceParams {
  waveTime: number;
  waveDistortion: number;
  driftOffset: number;
}

/**
 * Physically-motivated splash effects around the sea surface:
 * - ripple sources (impulses) whose dispersive ring packets are evaluated in the ocean shaders
 * - ballistic spray droplets with size-dependent air drag; each one that lands raises a
 *   tiny capillary ring of its own
 * - air bubbles dragged under by a diving body, rising at their terminal velocity
 * Glow fades on every droplet like plankton light dying after it is disturbed.
 */
export class SplashSimulation {
  /** vec4(x, z, age, strength) per ripple source, shared with the ocean shaders. */
  public readonly rippleUniformArray: THREE.Vector4[] = [];
  /** Above-water effects (spray & landing rings). */
  public readonly droplets: THREE.Points;
  public readonly microRings: THREE.InstancedMesh;
  /** Underwater effects. */
  public readonly bubbles: THREE.Points;

  private readonly rippleSources: { x: number; z: number; start: number; strength: number }[] = [];

  // Droplets (structure-of-arrays, written straight into GPU buffers)
  private readonly dropPos: Float32Array;
  private readonly dropAttr: Float32Array; // size, alpha, seed
  private readonly dropVel = new Float32Array(MAX_DROPLETS * 3);
  private readonly dropAge = new Float32Array(MAX_DROPLETS);
  private readonly dropAlive = new Uint8Array(MAX_DROPLETS);
  private nextDrop = 0;

  // Micro rings
  private readonly ringData: Float32Array; // start, size, seed
  private readonly ringPos = new Float32Array(MAX_MICRO_RINGS * 2);
  private nextRing = 0;
  private ringsThisFrame = 0;

  // Bubbles
  private readonly bubblePos: Float32Array;
  private readonly bubbleAttr: Float32Array; // size, alpha, seed
  private readonly bubbleVel = new Float32Array(MAX_BUBBLES * 3);
  private readonly bubbleAge = new Float32Array(MAX_BUBBLES);
  private readonly bubbleLife = new Float32Array(MAX_BUBBLES);
  private readonly bubbleAlive = new Uint8Array(MAX_BUBBLES);
  private nextBubble = 0;

  private readonly dropletMaterial: THREE.ShaderMaterial;
  private readonly ringMaterial: THREE.ShaderMaterial;
  private readonly bubbleMaterial: THREE.ShaderMaterial;
  private readonly ringMatrix = new THREE.Matrix4();

  private time = 0;
  private surface: SurfaceParams = { waveTime: 0, waveDistortion: 0.5, driftOffset: 0 };

  constructor(shaders: SplashShaders) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const colorUniforms = () => ({
      uMoonCore: { value: new THREE.Color('#f0f9ff') },
      uMoonHalo: { value: new THREE.Color('#38bdf8') },
      uCyberAccent: { value: new THREE.Color('#06b6d4') },
      uMoonGlow: { value: 1.2 },
    });

    for (let i = 0; i < SPLASH_SOURCE_SLOTS; i++) {
      this.rippleUniformArray.push(new THREE.Vector4());
      this.rippleSources.push({ x: 0, z: 0, start: -1e3, strength: 0 });
    }

    // Droplets
    const dropGeo = new THREE.BufferGeometry();
    this.dropPos = new Float32Array(MAX_DROPLETS * 3);
    this.dropAttr = new Float32Array(MAX_DROPLETS * 3);
    dropGeo.setAttribute('position', new THREE.BufferAttribute(this.dropPos, 3).setUsage(THREE.DynamicDrawUsage));
    dropGeo.setAttribute('aDrop', new THREE.BufferAttribute(this.dropAttr, 3).setUsage(THREE.DynamicDrawUsage));
    this.dropletMaterial = new THREE.ShaderMaterial({
      vertexShader: shaders.dropletVertex,
      fragmentShader: shaders.dropletFragment,
      uniforms: { uPixelRatio: { value: pixelRatio }, ...colorUniforms() },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.droplets = new THREE.Points(dropGeo, this.dropletMaterial);
    this.droplets.frustumCulled = false;

    // Micro rings: flat quads lying on the swell
    const ringGeo = new THREE.PlaneGeometry(1, 1);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringData = new Float32Array(MAX_MICRO_RINGS * 3);
    for (let i = 0; i < MAX_MICRO_RINGS; i++) this.ringData[i * 3] = -1e3;
    const ringAttr = new THREE.InstancedBufferAttribute(this.ringData, 3);
    ringAttr.setUsage(THREE.DynamicDrawUsage);
    ringGeo.setAttribute('aRing', ringAttr);
    this.ringMaterial = new THREE.ShaderMaterial({
      vertexShader: shaders.microRingVertex,
      fragmentShader: shaders.microRingFragment,
      uniforms: {
        uTime: { value: 0 },
        uWaveSpeed: { value: 0.85 },
        uWaveDistortion: { value: 0.5 },
        uDriftOffset: { value: 0 },
        ...colorUniforms(),
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.microRings = new THREE.InstancedMesh(ringGeo, this.ringMaterial, MAX_MICRO_RINGS);
    this.microRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.microRings.frustumCulled = false;
    this.ringMatrix.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_MICRO_RINGS; i++) this.microRings.setMatrixAt(i, this.ringMatrix);

    // Bubbles
    const bubbleGeo = new THREE.BufferGeometry();
    this.bubblePos = new Float32Array(MAX_BUBBLES * 3);
    this.bubbleAttr = new Float32Array(MAX_BUBBLES * 3);
    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(this.bubblePos, 3).setUsage(THREE.DynamicDrawUsage));
    bubbleGeo.setAttribute('aBubble', new THREE.BufferAttribute(this.bubbleAttr, 3).setUsage(THREE.DynamicDrawUsage));
    this.bubbleMaterial = new THREE.ShaderMaterial({
      vertexShader: shaders.bubbleVertex,
      fragmentShader: shaders.bubbleFragment,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio }, ...colorUniforms() },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bubbles = new THREE.Points(bubbleGeo, this.bubbleMaterial);
    this.bubbles.frustumCulled = false;
  }

  /** Height of the swell at (x, z) right now. */
  public surfaceHeight(x: number, z: number): number {
    const s = this.surface;
    return swellHeightAt(x, z, s.waveTime, s.waveDistortion, s.driftOffset);
  }

  /** Start a ripple packet (an impulse on the surface) in the least recently used slot. */
  public addRippleSource(x: number, z: number, strength: number): void {
    let slot = this.rippleSources[0];
    for (const src of this.rippleSources) if (src.start < slot.start) slot = src;
    slot.x = x;
    slot.z = z;
    slot.start = this.time;
    slot.strength = strength;
  }

  /** size is a 0..1 drop-size class: big drops fly further, small ones are braked by the air. */
  public emitDroplet(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number): void {
    const i = this.nextDrop;
    this.nextDrop = (i + 1) % MAX_DROPLETS;
    this.dropPos.set([x, y, z], i * 3);
    this.dropVel.set([vx, vy, vz], i * 3);
    this.dropAttr[i * 3] = size;
    this.dropAttr[i * 3 + 1] = 1;
    this.dropAttr[i * 3 + 2] = Math.random();
    this.dropAge[i] = 0;
    this.dropAlive[i] = 1;
  }

  public emitBubble(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number): void {
    const i = this.nextBubble;
    this.nextBubble = (i + 1) % MAX_BUBBLES;
    this.bubblePos.set([x, y, z], i * 3);
    this.bubbleVel.set([vx, vy, vz], i * 3);
    this.bubbleAttr[i * 3] = size;
    this.bubbleAttr[i * 3 + 1] = 0;
    this.bubbleAttr[i * 3 + 2] = Math.random();
    this.bubbleAge[i] = 0;
    this.bubbleLife[i] = 4 + Math.random() * 4;
    this.bubbleAlive[i] = 1;
  }

  private spawnMicroRing(x: number, z: number, size: number): void {
    // A burst of landing drops would otherwise flood the pool in a single frame
    if (this.ringsThisFrame >= 6) return;
    this.ringsThisFrame++;
    const i = this.nextRing;
    this.nextRing = (i + 1) % MAX_MICRO_RINGS;
    this.ringData[i * 3] = this.time;
    this.ringData[i * 3 + 1] = size;
    this.ringData[i * 3 + 2] = Math.random();
    this.ringPos[i * 2] = x;
    this.ringPos[i * 2 + 1] = z;
  }

  public update(params: {
    dt: number;
    time: number;
    driftZ: number;
    waveSpeed: number;
    waveDistortion: number;
    driftOffset: number;
    enabled: boolean;
    moonGlow: number;
    moonCore: THREE.Color;
    moonHalo: THREE.Color;
    cyberAccent: THREE.Color;
  }): void {
    const { dt, time, driftZ } = params;
    this.time = time;
    this.surface.waveTime = time * params.waveSpeed;
    this.surface.waveDistortion = params.waveDistortion;
    this.surface.driftOffset = params.driftOffset;
    this.ringsThisFrame = 0;

    for (const mat of [this.dropletMaterial, this.ringMaterial, this.bubbleMaterial]) {
      const u = mat.uniforms;
      u.uMoonCore.value.copy(params.moonCore);
      u.uMoonHalo.value.copy(params.moonHalo);
      u.uCyberAccent.value.copy(params.cyberAccent);
      u.uMoonGlow.value = params.moonGlow;
    }
    const ru = this.ringMaterial.uniforms;
    ru.uTime.value = time;
    ru.uWaveSpeed.value = params.waveSpeed;
    ru.uWaveDistortion.value = params.waveDistortion;
    ru.uDriftOffset.value = params.driftOffset;
    this.bubbleMaterial.uniforms.uTime.value = time;

    // Ripple sources ride the drifting sea
    for (let s = 0; s < SPLASH_SOURCE_SLOTS; s++) {
      const src = this.rippleSources[s];
      src.z += driftZ;
      const age = time - src.start;
      const live = params.enabled && src.strength > 0 && age >= 0 && age < RIPPLE_LIFE;
      this.rippleUniformArray[s].set(src.x, src.z, age, live ? src.strength : 0);
    }

    if (dt > 0) {
      this.stepDroplets(dt, driftZ);
      this.stepBubbles(dt, driftZ);
    }

    // Micro rings
    for (let i = 0; i < MAX_MICRO_RINGS; i++) {
      const age = time - this.ringData[i * 3];
      if (age >= 0 && age < MICRO_RING_LIFE) {
        this.ringPos[i * 2 + 1] += driftZ;
        const radius = 0.35 + 0.55 * this.ringData[i * 3 + 1];
        this.ringMatrix.makeScale(radius * 2, 1, radius * 2);
        this.ringMatrix.setPosition(this.ringPos[i * 2], 0, this.ringPos[i * 2 + 1]);
      } else {
        this.ringMatrix.makeScale(0, 0, 0);
      }
      this.microRings.setMatrixAt(i, this.ringMatrix);
    }
    this.microRings.instanceMatrix.needsUpdate = true;
    (this.microRings.geometry.getAttribute('aRing') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  private stepDroplets(dt: number, driftZ: number): void {
    const pos = this.dropPos;
    const vel = this.dropVel;
    for (let i = 0; i < MAX_DROPLETS; i++) {
      if (!this.dropAlive[i]) continue;
      const size = this.dropAttr[i * 3];
      // Quadratic air drag: small droplets reach a low terminal velocity and hang as mist
      const dragK = 0.02 + 0.12 * (1 - size);
      let vx = vel[i * 3];
      let vy = vel[i * 3 + 1];
      let vz = vel[i * 3 + 2];
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const drag = Math.max(0, 1 - dragK * speed * dt);
      vx *= drag;
      vy = vy * drag - GRAVITY * dt;
      vz *= drag;
      vel[i * 3] = vx;
      vel[i * 3 + 1] = vy;
      vel[i * 3 + 2] = vz;
      pos[i * 3] += vx * dt;
      pos[i * 3 + 1] += vy * dt;
      pos[i * 3 + 2] += vz * dt + driftZ;

      const age = (this.dropAge[i] += dt);
      // Plankton light in the droplet dies away after the disturbance
      this.dropAttr[i * 3 + 1] = (0.35 + 0.65 * Math.exp(-age * 1.3)) * Math.min(1, age * 30);

      const surfaceY = this.surfaceHeight(pos[i * 3], pos[i * 3 + 2]);
      if ((vy < 0 && pos[i * 3 + 1] <= surfaceY) || age > 4) {
        this.dropAlive[i] = 0;
        this.dropAttr[i * 3 + 1] = 0;
        if (age <= 4 && Math.random() < 0.25 + 0.6 * size) {
          this.spawnMicroRing(pos[i * 3], pos[i * 3 + 2], size);
        }
      }
    }
    const geo = this.droplets.geometry;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('aDrop').needsUpdate = true;
  }

  private stepBubbles(dt: number, driftZ: number): void {
    const pos = this.bubblePos;
    const vel = this.bubbleVel;
    for (let i = 0; i < MAX_BUBBLES; i++) {
      if (!this.bubbleAlive[i]) continue;
      const size = this.bubbleAttr[i * 3];
      // Buoyancy vs drag: bubbles relax from the wake's momentum to their rise velocity
      const rise = 0.22 + 0.45 * size;
      const relax = 1 - Math.exp(-dt * (2.2 + 2.0 * (1 - size)));
      vel[i * 3] += (0 - vel[i * 3]) * relax;
      vel[i * 3 + 1] += (rise - vel[i * 3 + 1]) * relax;
      vel[i * 3 + 2] += (0 - vel[i * 3 + 2]) * relax;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt + driftZ;

      const age = (this.bubbleAge[i] += dt);
      const life = this.bubbleLife[i];
      const surfaceY = this.surfaceHeight(pos[i * 3], pos[i * 3 + 2]);
      const depth = surfaceY - pos[i * 3 + 1];
      this.bubbleAttr[i * 3 + 1] =
        Math.min(1, age * 8) * (1 - THREE.MathUtils.smoothstep(age, life * 0.7, life)) *
        THREE.MathUtils.smoothstep(depth, 0.02, 0.25);
      if (depth < 0.02 || age > life) {
        this.bubbleAlive[i] = 0;
        this.bubbleAttr[i * 3 + 1] = 0;
      }
    }
    const geo = this.bubbles.geometry;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('aBubble').needsUpdate = true;
  }

  public dispose(): void {
    this.droplets.geometry.dispose();
    this.microRings.geometry.dispose();
    this.bubbles.geometry.dispose();
    this.dropletMaterial.dispose();
    this.ringMaterial.dispose();
    this.bubbleMaterial.dispose();
    this.microRings.dispose();
  }
}
