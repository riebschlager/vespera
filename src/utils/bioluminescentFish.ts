import * as THREE from 'three';
import { SplashShaders, SplashSimulation } from './splashSimulation';

const SCHOOL_COUNT = 4;
const FISH_PER_SCHOOL = 6;
const JUMPER_COUNT = 2;
const SCHOOL_FISH = SCHOOL_COUNT * FISH_PER_SCHOOL;
const TOTAL_FISH = SCHOOL_FISH + JUMPER_COUNT;
const GRAVITY = 9.8;
// Shallowest a schooling fish swims, keeping its dorsal fin under the swell
const SCHOOL_CEILING = -0.75;
// Rise per unit ahead of the bottom edge of the frame while the submerged camera gazes upward
const GAZE_SLOPE = 0.3;

/**
 * Builds a 1-unit-long lantern-fish facing +Z (snout at z = +0.5): a laterally compressed
 * teardrop body with a deep belly, plus a forked caudal fin, dorsal & anal fins and
 * swept-back pectoral fins. Fins are flat sheets rendered double sided.
 */
export function createFishGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const features: number[] = []; // [coordA, coordB, finType]
  const indices: number[] = [];

  const PEDUNCLE_S = 0.8;
  const MAX_HALF_HEIGHT = 0.12;

  // Half-height of the body at s (0 = snout, PEDUNCLE_S = tail root)
  const halfHeight = (s: number): number => {
    const sc = THREE.MathUtils.clamp(s, 0, PEDUNCLE_S);
    if (sc < 0.28) {
      const u = (0.28 - sc) / 0.28;
      return MAX_HALF_HEIGHT * Math.sqrt(Math.max(0, 1 - u * u));
    }
    const u = (sc - 0.28) / (PEDUNCLE_S - 0.28);
    return THREE.MathUtils.lerp(0.022, MAX_HALF_HEIGHT, 0.5 + 0.5 * Math.cos(Math.PI * u));
  };
  const WIDTH_RATIO = 0.55;
  const BELLY_DEPTH = 1.12;

  // --- Body: lofted elliptical rings from snout to peduncle ---
  const bodySteps = 60;
  const radialSteps = 28;
  for (let i = 0; i <= bodySteps; i++) {
    const s = (i / bodySteps) * PEDUNCLE_S;
    const z = 0.5 - s;
    const h = halfHeight(s);
    const eps = 0.004;
    // Derivative with respect to z (z grows toward the snout as s shrinks)
    const dh = (halfHeight(Math.max(0, s - eps)) - halfHeight(s + eps)) / (2 * eps);

    for (let j = 0; j <= radialSteps; j++) {
      const v = j / radialSteps;
      const a = v * Math.PI * 2;
      const sinA = Math.sin(a);
      const cosA = Math.cos(a);
      const hSide = cosA >= 0 ? h : h * BELLY_DEPTH;
      const dhSide = cosA >= 0 ? dh : dh * BELLY_DEPTH;
      const w = h * WIDTH_RATIO;
      const dw = dh * WIDTH_RATIO;

      positions.push(sinA * w, cosA * hSide, z);
      // Analytic normal of the swept ellipse (cross product of the surface tangents)
      const n = new THREE.Vector3(
        hSide * sinA,
        w * cosA,
        -(w * dhSide * cosA * cosA + hSide * dw * sinA * sinA)
      );
      if (n.lengthSq() < 1e-10) n.set(0, 0, 1);
      n.normalize();
      normals.push(n.x, n.y, n.z);
      features.push(v, 0, 0);
    }
  }
  const ring = radialSteps + 1;
  for (let i = 0; i < bodySteps; i++) {
    for (let j = 0; j < radialSteps; j++) {
      const a = i * ring + j;
      const b = (i + 1) * ring + j;
      const c = (i + 1) * ring + j + 1;
      const d = i * ring + j + 1;
      // Counter-clockwise seen from outside
      indices.push(a, d, b, b, d, c);
    }
  }

  // --- Fins: flat grids ---
  const addFin = (
    uSteps: number,
    vSteps: number,
    finType: number,
    normal: THREE.Vector3,
    place: (u: number, v: number) => THREE.Vector3,
    coords: (u: number, v: number) => [number, number]
  ): void => {
    const base = positions.length / 3;
    for (let i = 0; i <= uSteps; i++) {
      for (let j = 0; j <= vSteps; j++) {
        const u = i / uSteps;
        const v = j / vSteps;
        const p = place(u, v);
        positions.push(p.x, p.y, p.z);
        normals.push(normal.x, normal.y, normal.z);
        const [ca, cb] = coords(u, v);
        features.push(ca, cb, finType);
      }
    }
    const stride = vSteps + 1;
    for (let i = 0; i < uSteps; i++) {
      for (let j = 0; j < vSteps; j++) {
        const a = base + i * stride + j;
        const b = base + (i + 1) * stride + j;
        const c = base + (i + 1) * stride + j + 1;
        const d = base + i * stride + j + 1;
        indices.push(a, b, d, b, c, d);
      }
    }
  };

  const side = new THREE.Vector3(1, 0, 0);
  const tailRootZ = 0.5 - PEDUNCLE_S + 0.01;

  // Forked caudal fin: lobes sweep back further than the notch in the middle
  addFin(
    12,
    18,
    1,
    side,
    (u, v) => {
      const vv = v * 2 - 1;
      const length = 0.23 * (0.42 + 0.58 * Math.pow(Math.abs(vv), 0.9));
      const spread = 0.02 + 0.16 * Math.pow(u, 0.85);
      return new THREE.Vector3(0, vv * spread, tailRootZ - u * length);
    },
    (u, v) => [u, v]
  );

  // Dorsal sail along the back, raked toward the tail
  addFin(
    16,
    6,
    2,
    side,
    (u, v) => {
      const s = THREE.MathUtils.lerp(0.24, 0.56, u);
      const height = 0.11 * Math.pow(Math.sin(Math.PI * u), 0.8) * (1 - 0.35 * u);
      return new THREE.Vector3(0, halfHeight(s) * 0.96 + v * height, 0.5 - s - v * 0.06 * (1 + u));
    },
    (u, v) => [u, v]
  );

  // Anal fin under the rear belly
  addFin(
    10,
    4,
    2,
    side,
    (u, v) => {
      const s = THREE.MathUtils.lerp(0.56, 0.74, u);
      const height = 0.055 * Math.pow(Math.sin(Math.PI * u), 0.8);
      return new THREE.Vector3(
        0,
        -halfHeight(s) * BELLY_DEPTH * 0.96 - v * height,
        0.5 - s - v * 0.04
      );
    },
    (u, v) => [u, v]
  );

  // Pectoral fins just behind the gills, swept back and down
  for (const sign of [-1, 1]) {
    const s0 = 0.27;
    const angle = Math.PI / 2 + 0.35;
    const h0 = halfHeight(s0);
    const root = new THREE.Vector3(
      sign * Math.sin(angle) * h0 * WIDTH_RATIO,
      Math.cos(angle) * h0 * BELLY_DEPTH,
      0.5 - s0
    );
    const spanDir = new THREE.Vector3(sign * 0.6, -0.25, -0.76).normalize();
    const chordDir = new THREE.Vector3(0, 0.15, -1).normalize();
    const finNormal = new THREE.Vector3().crossVectors(spanDir, chordDir).normalize();
    addFin(
      6,
      4,
      3,
      finNormal,
      (u, v) =>
        root
          .clone()
          .addScaledVector(spanDir, u * 0.14)
          .addScaledVector(chordDir, v * 0.075 * (1 - 0.7 * u)),
      (u, v) => [u, v]
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aFeature', new THREE.Float32BufferAttribute(features, 3));
  return geometry;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

interface SchoolMember {
  index: number;
  offset: THREE.Vector3; // Slot in the formation (right, up, forward)
  wobble: THREE.Vector3; // Phases of the slow drift around the slot
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  dir: THREE.Vector3; // Smoothed swimming direction relative to the water
  yaw: number;
  yawRate: number;
  scale: number;
  swimPhase: number;
}

interface School {
  center: THREE.Vector3;
  heading: THREE.Vector3;
  target: THREE.Vector3;
  retargetTimer: number;
  cruiseSpeed: number;
  dart: number; // Burst-of-speed envelope, decays to 0
  dartTimer: number;
  fade: number;
  leaving: boolean; // Fading out before being recycled ahead of the camera
  members: SchoolMember[];
}

interface Jumper {
  index: number;
  active: boolean;
  cooldown: number;
  tau: number; // Seconds relative to leaving the water (negative while rising)
  preTime: number;
  airTime: number;
  postTime: number;
  exit: THREE.Vector3;
  entry: THREE.Vector3;
  dir: THREE.Vector3; // Horizontal travel direction
  vh: number;
  vy: number;
  scale: number;
  swimPhase: number;
  prevYaw: number;
  halfPass: number; // Seconds for half the body length to slide through the surface
  fired: number; // Bitmask of one-shot splash events already triggered
}

// One-shot splash events in a leap's timeline
const EV_EXIT_RIPPLE = 1;
const EV_EXIT_REBOUND = 2;
const EV_ENTRY_IMPACT = 4;
const EV_ENTRY_JET = 8;
const EV_BUBBLE_CLOUD = 16;
// The air cavity behind a diving body pinches off and collapses this long after impact
const CAVITY_COLLAPSE_DELAY = 0.3;

/**
 * Schools of bioluminescent lantern-fish cruising just beneath the surface (seen when the
 * camera dives), and the occasional solo fish that bursts clear of the water in a
 * ballistic arc before knifing back into the depths with a glowing splash.
 */
export class BioluminescentFishSchool {
  public readonly group = new THREE.Group();
  public readonly splash: SplashSimulation;
  /** vec4(x, z, age, strength) per splash ripple source, read by the ocean shaders. */
  public readonly rippleUniformArray: THREE.Vector4[];

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.InstancedMesh;

  private readonly staticAttr: THREE.InstancedBufferAttribute;
  private readonly stateAttr: THREE.InstancedBufferAttribute;
  private readonly motionAttr: THREE.InstancedBufferAttribute;

  private readonly schools: School[] = [];
  private readonly jumpers: Jumper[] = [];

  private initialized = false;
  private driftRate = 0; // World units per second the sea carries things toward the camera
  private pendingSummon = false;

  private readonly matWork = new THREE.Matrix4();
  private readonly quatWork = new THREE.Quaternion();
  private readonly eulerWork = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly scaleWork = new THREE.Vector3();
  private readonly vWork = new THREE.Vector3();
  private readonly vWork2 = new THREE.Vector3();
  private readonly vWork3 = new THREE.Vector3();

  constructor(vertexShader: string, fragmentShader: string, splashShaders: SplashShaders) {
    this.splash = new SplashSimulation(splashShaders);
    this.rippleUniformArray = this.splash.rippleUniformArray;
    this.geometry = createFishGeometry();

    const staticData = new Float32Array(TOTAL_FISH * 4);
    for (let i = 0; i < TOTAL_FISH; i++) {
      staticData[i * 4] = Math.random() * Math.PI * 2;
      staticData[i * 4 + 1] = Math.random();
      staticData[i * 4 + 2] = Math.random() * 100;
    }
    this.staticAttr = new THREE.InstancedBufferAttribute(staticData, 4);
    this.stateAttr = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL_FISH * 4), 4);
    this.motionAttr = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL_FISH * 4), 4);
    this.stateAttr.setUsage(THREE.DynamicDrawUsage);
    this.motionAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aFishStatic', this.staticAttr);
    this.geometry.setAttribute('aFishState', this.stateAttr);
    this.geometry.setAttribute('aFishMotion', this.motionAttr);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uWaveSpeed: { value: 0.85 },
        uWaveDistortion: { value: 0.5 },
        uDriftOffset: { value: 0 },
        uCyberIntensity: { value: 0.6 },
        uMoonGlow: { value: 1.2 },
        uSubmergedView: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uMoonDirection: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
        // Water-column uniforms; replaced by the scene's shared ones via shareWaterVolumeUniforms()
        uWaterDeep: { value: new THREE.Color('#030611') },
        uWaterShallow: { value: new THREE.Color('#0b2a3f') },
        uMoonHalo: { value: new THREE.Color('#38bdf8') },
        uMoonCore: { value: new THREE.Color('#f0f9ff') },
        uCyberAccent: { value: new THREE.Color('#06b6d4') },
        uMoonDirWater: { value: new THREE.Vector3(0, 1, 0) },
        uMoonLight: { value: 1 },
        uDepth: { value: 0 },
      },
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, TOTAL_FISH);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    // Schools
    for (let k = 0; k < SCHOOL_COUNT; k++) {
      const members: SchoolMember[] = [];
      for (let m = 0; m < FISH_PER_SCHOOL; m++) {
        const row = Math.floor(m / 3);
        const col = (m % 3) - 1;
        members.push({
          index: k * FISH_PER_SCHOOL + m,
          offset: new THREE.Vector3(
            col * 1.25 + randRange(-0.35, 0.35),
            randRange(-0.45, 0.45),
            -row * 1.5 + (col === 0 ? 0.5 : 0) + randRange(-0.3, 0.3)
          ),
          wobble: new THREE.Vector3(randRange(0, 6.3), randRange(0, 6.3), randRange(0, 6.3)),
          pos: new THREE.Vector3(),
          prevPos: new THREE.Vector3(),
          dir: new THREE.Vector3(0, 0, -1),
          yaw: 0,
          yawRate: 0,
          scale: randRange(0.95, 1.55),
          swimPhase: Math.random() * Math.PI * 2,
        });
      }
      this.schools.push({
        center: new THREE.Vector3(),
        heading: new THREE.Vector3(0, 0, -1),
        target: new THREE.Vector3(),
        retargetTimer: 0,
        cruiseSpeed: randRange(1.0, 1.7),
        dart: 0,
        dartTimer: randRange(5, 14),
        fade: 0,
        leaving: false,
        members,
      });
    }

    // Leapers
    for (let j = 0; j < JUMPER_COUNT; j++) {
      this.jumpers.push({
        index: SCHOOL_FISH + j,
        active: false,
        cooldown: j === 0 ? 4.0 : 13.0,
        tau: 0,
        preTime: 1.3,
        airTime: 1,
        postTime: 1.8,
        exit: new THREE.Vector3(),
        entry: new THREE.Vector3(),
        dir: new THREE.Vector3(1, 0, 0),
        vh: 4,
        vy: 6,
        scale: 1.8,
        swimPhase: 0,
        prevYaw: 0,
        halfPass: 0.1,
        fired: 0,
      });
    }
  }

  /**
   * Share the scene's water-column uniforms (colours, refracted moon, depth) so the fish
   * fade into exactly the same murk as the underwater backdrop.
   */
  public shareWaterVolumeUniforms(uniforms: Record<string, THREE.IUniform>): void {
    Object.assign(this.material.uniforms, uniforms);
  }

  /** Make a fish leap from the sea in front of the camera right away. */
  public summonJump(): void {
    this.pendingSummon = true;
  }

  public setSubmergedView(submerged: boolean): void {
    this.material.uniforms.uSubmergedView.value = submerged ? 1 : 0;
  }

  /**
   * How far ahead schools can roam and still be seen. Submerged, the gaze tilts up toward
   * Snell's window (the bottom of the frame sits ~0.3 rise per unit ahead), so only a wedge
   * of water between that sightline and the surface is on screen.
   */
  private visibleReach(cam: THREE.Vector3): number {
    if (cam.y >= 0) return 20;
    return THREE.MathUtils.clamp((SCHOOL_CEILING - 0.4 - cam.y) / GAZE_SLOPE, 4.5, 24);
  }

  private pointInView(cam: THREE.Vector3, ahead: number, side: number, out: THREE.Vector3): THREE.Vector3 {
    const top = SCHOOL_CEILING - 0.15;
    const deepest = Math.max(-11, Math.min(-3.2, cam.y - 1.8));
    const sightline = cam.y < 0 ? cam.y + GAZE_SLOPE * ahead + 0.2 : deepest;
    const bottom = Math.min(top - 0.3, Math.max(deepest, sightline));
    return out.set(
      cam.x + side * randRange(0.25, 1) * (0.6 * ahead + 1.5),
      randRange(bottom, top),
      cam.z - ahead
    );
  }

  // Wander targets alternate sides of the view so schools cross it in profile
  private pickSchoolTarget(school: School, cam: THREE.Vector3): void {
    const relX = school.center.x - cam.x;
    const side = Math.abs(relX) > 1.5 ? -Math.sign(relX) : Math.random() < 0.5 ? -1 : 1;
    this.pointInView(cam, randRange(3.5, this.visibleReach(cam)), side, school.target);
    school.retargetTimer = randRange(8, 15);
  }

  private respawnSchool(school: School, cam: THREE.Vector3, initial: boolean): void {
    const reach = this.visibleReach(cam);
    // Fresh schools emerge from the gloom just beyond the visible wedge
    const ahead = initial ? randRange(4, reach) : reach + randRange(2, 6);
    this.pointInView(cam, ahead, Math.random() < 0.5 ? -1 : 1, school.center);
    this.pickSchoolTarget(school, cam);
    school.leaving = false;
    school.heading.copy(school.target).sub(school.center).setY(0).normalize();
    if (school.heading.lengthSq() < 0.5) school.heading.set(0, 0, -1);
    school.cruiseSpeed = randRange(1.0, 1.7);
    school.fade = 0;
    for (const m of school.members) {
      this.slotPosition(school, m, 0, m.pos);
      m.prevPos.copy(m.pos);
      m.dir.copy(school.heading);
      m.yaw = Math.atan2(m.dir.x, m.dir.z);
      m.yawRate = 0;
    }
  }

  private slotPosition(school: School, m: SchoolMember, time: number, out: THREE.Vector3): void {
    const fwd = school.heading;
    // Right-hand vector of a yaw-only frame facing `fwd`
    const rx = fwd.z;
    const rz = -fwd.x;
    const ox = m.offset.x + Math.sin(time * 0.37 + m.wobble.x) * 0.45;
    const oy = m.offset.y + Math.sin(time * 0.29 + m.wobble.y) * 0.25;
    const oz = m.offset.z + Math.sin(time * 0.33 + m.wobble.z) * 0.55;
    out.set(
      school.center.x + rx * ox + fwd.x * oz,
      Math.min(SCHOOL_CEILING, school.center.y + oy),
      school.center.z + rz * ox + fwd.z * oz
    );
  }

  private startJump(j: Jumper, cam: THREE.Vector3, summoned: boolean): void {
    const camUnder = cam.y < 0;
    // Leap where it will be seen: further out from above; from below, close enough that the
    // arc grazes Snell's window and the re-entry bubble cloud rises in front of the camera
    const apexDist = camUnder ? randRange(5, 8) : summoned ? randRange(13, 22) : randRange(14, 34);
    const lateral = randRange(-1, 1) * (camUnder ? 2.5 : summoned ? 7 : 14);
    // Mostly crossing the view so the full arc reads in profile
    const yaw = (Math.random() < 0.5 ? -1 : 1) * Math.PI * 0.5 + randRange(-0.55, 0.55);
    j.dir.set(Math.sin(yaw), 0, Math.cos(yaw));

    j.scale = randRange(1.5, 2.3);
    const height = randRange(1.5, 2.7) * (j.scale / 1.9);
    j.vy = Math.sqrt(2 * GRAVITY * height);
    j.airTime = (2 * j.vy) / GRAVITY;
    j.vh = randRange(3.6, 5.2);
    const halfSpan = (j.vh * j.airTime) / 2;
    j.preTime = summoned ? 0.9 : 1.3;
    const apexX = cam.x + lateral;
    // The drifting sea carries the leap toward the camera, so aim it further out to compensate
    const apexZ = cam.z - apexDist - this.driftRate * (j.preTime + j.airTime * 0.5);
    j.exit.set(apexX - j.dir.x * halfSpan, 0, apexZ - j.dir.z * halfSpan);
    j.entry.set(apexX + j.dir.x * halfSpan, 0, apexZ + j.dir.z * halfSpan);

    j.postTime = 1.8;
    j.tau = -j.preTime;
    j.active = true;
    j.prevYaw = yaw;
    j.halfPass = (0.5 * j.scale) / Math.hypot(j.vh, j.vy);
    j.fired = 0;
  }

  /** Poisson-ish particle count for a continuous emitter over one frame. */
  private static burst(rate: number, dt: number): number {
    const n = rate * dt;
    return Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
  }

  /**
   * Drive the splash physics from where the leaper is in its timeline:
   * - breaching: a sheet of water is dragged up after the body; once the tail clears, the
   *   hole it leaves collapses (the ripple impulse) and rebounds into a small jet
   * - airborne: water streams off the body as drips, which rain back as tiny rings
   * - re-entry: the impact throws a crown, biased forward by the oblique dive; ~0.3 s later
   *   the air cavity collapses into a vertical Worthington jet and a second, weaker impulse,
   *   while the trapped air rises as a bubble cloud and the fish trails bubbles down
   */
  private emitSplashes(j: Jumper, pos: THREE.Vector3, vel: THREE.Vector3, dt: number): void {
    const sp = this.splash;
    const sf = j.scale / 1.9;
    const lift = Math.sqrt(sf);
    const tau = j.tau;
    const tailClear = j.halfPass;
    const entryT = j.airTime - j.halfPass;
    const dirX = j.dir.x;
    const dirZ = j.dir.z;
    // Unit vector along the body
    const body = this.vWork3.copy(vel).normalize();
    const once = (flag: number): boolean => {
      if (j.fired & flag) return false;
      j.fired |= flag;
      return true;
    };

    // --- Breach ---
    if (tau > -j.halfPass && tau < tailClear + 0.05 && dt > 0) {
      const cx = j.exit.x + dirX * j.vh * Math.max(tau, 0);
      const cz = j.exit.z + dirZ * j.vh * Math.max(tau, 0);
      const cy = sp.surfaceHeight(cx, cz);
      const n = BioluminescentFishSchool.burst(260 * sf, dt);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.12 * j.scale;
        const carry = randRange(0.3, 0.85);
        sp.emitDroplet(
          cx + Math.cos(a) * r,
          cy,
          cz + Math.sin(a) * r,
          vel.x * carry + randRange(-0.7, 0.7),
          vel.y * carry * randRange(0.6, 1) + randRange(-0.3, 0.3),
          vel.z * carry + randRange(-0.7, 0.7),
          Math.pow(Math.random(), 1.5)
        );
      }
    }
    if (tau >= tailClear && once(EV_EXIT_RIPPLE)) {
      sp.addRippleSource(j.exit.x + dirX * j.vh * tailClear, j.exit.z + dirZ * j.vh * tailClear, 0.55 * sf);
    }
    if (tau >= tailClear + 0.22 && once(EV_EXIT_REBOUND)) {
      const cx = j.exit.x + dirX * j.vh * tailClear;
      const cz = j.exit.z + dirZ * j.vh * tailClear;
      const cy = sp.surfaceHeight(cx, cz);
      for (let k = 0; k < 20 * sf; k++) {
        const a = Math.random() * Math.PI * 2;
        const rv = randRange(0, 0.35);
        sp.emitDroplet(cx, cy, cz, Math.cos(a) * rv, randRange(1.8, 3.2) * lift, Math.sin(a) * rv, Math.random());
      }
    }

    // --- Airborne drips ---
    if (tau > tailClear && tau < entryT && dt > 0) {
      const n = BioluminescentFishSchool.burst(55 * sf * Math.exp(-(tau - tailClear) * 1.4), dt);
      for (let k = 0; k < n; k++) {
        const along = randRange(-0.3, 0.5) * j.scale;
        const carry = randRange(0.82, 0.98);
        sp.emitDroplet(
          pos.x - body.x * along,
          pos.y - body.y * along,
          pos.z - body.z * along,
          vel.x * carry + randRange(-0.25, 0.25),
          vel.y * carry + randRange(-0.25, 0.25),
          vel.z * carry + randRange(-0.25, 0.25),
          Math.random() * 0.55
        );
      }
    }

    // --- Re-entry ---
    if (tau >= entryT && once(EV_ENTRY_IMPACT)) {
      sp.addRippleSource(j.entry.x, j.entry.z, 0.85 * sf);
    }
    if (tau >= entryT && tau < entryT + 0.12 && dt > 0) {
      const cy = sp.surfaceHeight(j.entry.x, j.entry.z);
      const n = BioluminescentFishSchool.burst(950 * sf, dt);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const ex = Math.cos(a);
        const ez = Math.sin(a);
        // An oblique dive throws its crown mostly forward and to the sides
        const forward = ex * dirX + ez * dirZ;
        if (Math.random() > 0.35 + 0.65 * Math.max(0, forward + 0.4)) continue;
        const radial = randRange(0.8, 2.4) * lift * (1 + 0.5 * Math.max(forward, 0));
        const r0 = 0.18 * j.scale;
        sp.emitDroplet(
          j.entry.x + ex * r0,
          cy,
          j.entry.z + ez * r0,
          ex * radial + dirX * j.vh * 0.25,
          randRange(1.4, 3.3) * lift,
          ez * radial + dirZ * j.vh * 0.25,
          Math.random()
        );
      }
    }
    if (tau >= entryT + CAVITY_COLLAPSE_DELAY && once(EV_ENTRY_JET)) {
      // (its ripple rebound is already part of the impact's source in the ocean shader)
      const cy = sp.surfaceHeight(j.entry.x, j.entry.z);
      for (let k = 0; k < 45 * sf; k++) {
        const a = Math.random() * Math.PI * 2;
        const rv = randRange(0, 0.4);
        // The jet's tip is fast and finely broken; the column below it is slower and chunkier
        const u = Math.random();
        sp.emitDroplet(
          j.entry.x,
          cy,
          j.entry.z,
          Math.cos(a) * rv,
          THREE.MathUtils.lerp(2.6, 5.6, u) * lift,
          Math.sin(a) * rv,
          THREE.MathUtils.lerp(0.9, 0.15, u) * randRange(0.6, 1)
        );
      }
    }

    // --- Air dragged under ---
    if (tau > j.airTime && tau < j.airTime + 0.9 && dt > 0) {
      const n = BioluminescentFishSchool.burst(120 * sf * Math.exp(-(tau - j.airTime) * 2.5), dt);
      for (let k = 0; k < n; k++) {
        const back = 0.45 * j.scale;
        sp.emitBubble(
          pos.x - body.x * back + randRange(-0.08, 0.08),
          pos.y - body.y * back + randRange(-0.08, 0.08),
          pos.z - body.z * back + randRange(-0.08, 0.08),
          vel.x * 0.25 + randRange(-0.3, 0.3),
          vel.y * 0.25 + randRange(-0.2, 0.2),
          vel.z * 0.25 + randRange(-0.3, 0.3),
          Math.pow(Math.random(), 2)
        );
      }
    }
    if (tau >= entryT + CAVITY_COLLAPSE_DELAY && once(EV_BUBBLE_CLOUD)) {
      const cy = sp.surfaceHeight(j.entry.x, j.entry.z);
      // Entry path: down and forward along the dive
      const ex = dirX * j.vh;
      const ey = -j.vy;
      const ez = dirZ * j.vh;
      const len = Math.hypot(ex, ey, ez);
      for (let k = 0; k < 60 * sf; k++) {
        const d = Math.random() * 1.3 * j.scale;
        sp.emitBubble(
          j.entry.x + (ex / len) * d + randRange(-0.25, 0.25),
          cy - 0.1 + (ey / len) * d + randRange(-0.2, 0.2),
          j.entry.z + (ez / len) * d + randRange(-0.25, 0.25),
          randRange(-0.3, 0.3),
          randRange(-0.1, 0.4),
          randRange(-0.3, 0.3),
          Math.pow(Math.random(), 1.6)
        );
      }
    }
  }

  private writeInstance(
    index: number,
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    roll: number,
    scale: number,
    fade: number
  ): void {
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = -Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    this.eulerWork.set(pitch, yaw, roll, 'YXZ');
    this.quatWork.setFromEuler(this.eulerWork);
    this.scaleWork.setScalar(fade > 0.001 ? scale : 0);
    this.matWork.compose(pos, this.quatWork, this.scaleWork);
    this.mesh.setMatrixAt(index, this.matWork);
  }

  public update(params: {
    dt: number;
    elapsedTime: number;
    driftOffset: number;
    driftSpeed: number;
    waveSpeed: number;
    waveDistortion: number;
    creatureActivity: number;
    cyberIntensity: number;
    moonGlow: number;
    cameraPos: THREE.Vector3;
    moonDirection: THREE.Vector3;
    moonCore: THREE.Color;
    moonHalo: THREE.Color;
    cyberAccent: THREE.Color;
  }): void {
    const { dt, elapsedTime, creatureActivity, cameraPos: cam } = params;

    const u = this.material.uniforms;
    u.uTime.value = elapsedTime;
    u.uWaveSpeed.value = params.waveSpeed;
    u.uWaveDistortion.value = params.waveDistortion;
    u.uDriftOffset.value = params.driftOffset;
    u.uCyberIntensity.value = params.cyberIntensity;
    u.uMoonGlow.value = params.moonGlow;
    u.uCameraPos.value.copy(cam);
    u.uMoonDirection.value.copy(params.moonDirection);

    if (!this.initialized) {
      for (const school of this.schools) this.respawnSchool(school, cam, true);
      this.initialized = true;
    }

    const enabled = creatureActivity > 0.01;
    // The sea carries everything gently toward the camera as it floats forward; schools
    // swim against it, so they get swept along a little more slowly
    this.driftRate = params.driftSpeed * 2.4;
    const driftZ = dt * this.driftRate;
    const schoolDriftZ = dt * params.driftSpeed * 1.5;
    const state = this.stateAttr.array as Float32Array;
    const motion = this.motionAttr.array as Float32Array;

    // Advance the splash physics first so this frame's emissions start from the current surface
    this.splash.update({
      dt,
      time: elapsedTime,
      driftZ,
      waveSpeed: params.waveSpeed,
      waveDistortion: params.waveDistortion,
      driftOffset: params.driftOffset,
      enabled,
      moonGlow: params.moonGlow,
      moonCore: params.moonCore,
      moonHalo: params.moonHalo,
      cyberAccent: params.cyberAccent,
    });

    // --- Schools ---
    const activeSchools = !enabled ? 0 : creatureActivity < 0.45 ? 2 : creatureActivity < 1.2 ? 3 : 4;
    for (let k = 0; k < SCHOOL_COUNT; k++) {
      const school = this.schools[k];
      const fadeTarget = k < activeSchools && !school.leaving ? 1 : 0;
      school.fade += (fadeTarget - school.fade) * (1 - Math.exp(-dt * (school.leaving ? 1.8 : 0.8)));

      if (dt > 0) {
        school.retargetTimer -= dt;
        if (school.retargetTimer <= 0 || school.center.distanceTo(school.target) < 2.5) {
          this.pickSchoolTarget(school, cam);
        }
        school.dartTimer -= dt;
        if (school.dartTimer <= 0) {
          school.dart = 1;
          school.dartTimer = randRange(6, 16);
        }
        school.dart = Math.max(0, school.dart - dt * 0.7);

        // Steer smoothly toward the wander target
        this.vWork.copy(school.target).sub(school.center);
        this.vWork.y *= 0.5;
        this.vWork.normalize();
        school.heading.lerp(this.vWork, 1 - Math.exp(-dt * (0.45 + school.dart * 0.8))).normalize();

        const speed = school.cruiseSpeed * (1 + 1.6 * school.dart);
        school.center.addScaledVector(school.heading, speed * dt);
        school.center.z += schoolDriftZ;
        school.center.y = THREE.MathUtils.clamp(school.center.y, -12, SCHOOL_CEILING);

        // Drifting out of view (past the camera or off to the sides): fade away, then
        // reappear out in the gloom ahead
        const relX = school.center.x - cam.x;
        const relZ = school.center.z - cam.z;
        if (relZ > -1.5 || relZ < -50 || Math.abs(relX) > 30) school.leaving = true;
        if (school.leaving && (school.fade < 0.03 || relZ > 8)) {
          this.respawnSchool(school, cam, false);
        }
      }

      const speed = school.cruiseSpeed * (1 + 1.6 * school.dart);
      for (const m of school.members) {
        if (dt > 0) {
          m.prevPos.copy(m.pos);
          this.slotPosition(school, m, elapsedTime, this.vWork2);
          m.pos.lerp(this.vWork2, 1 - Math.exp(-dt * (1.6 + school.dart * 2.0)));

          // Face along the motion through the water (ignoring the drift that carries the water itself)
          this.vWork.copy(m.pos).sub(m.prevPos).divideScalar(dt);
          this.vWork.z -= schoolDriftZ / dt;
          if (this.vWork.lengthSq() > 0.04) {
            this.vWork.normalize();
            this.vWork.y = THREE.MathUtils.clamp(this.vWork.y, -0.45, 0.45);
            this.vWork.normalize();
            m.dir.lerp(this.vWork, 1 - Math.exp(-dt * 3.5)).normalize();
          }
          const yaw = Math.atan2(m.dir.x, m.dir.z);
          const rawRate = wrapAngle(yaw - m.yaw) / dt;
          m.yawRate += (rawRate - m.yawRate) * (1 - Math.exp(-dt * 5));
          m.yaw = yaw;

          const beatHz = 1.8 + speed * 0.9 + Math.abs(m.yawRate) * 0.4;
          m.swimPhase += beatHz * Math.PI * 2 * dt;
        }

        const i = m.index;
        const fade = school.fade * Math.min(1, school.fade * 1.2);
        state[i * 4] = fade;
        state[i * 4 + 1] = 0;
        state[i * 4 + 2] = THREE.MathUtils.clamp(0.06 + 0.02 * school.dart + Math.abs(m.yawRate) * 0.03, 0.04, 0.12);
        state[i * 4 + 3] = m.swimPhase;
        motion[i * 4] = 0;
        motion[i * 4 + 1] = THREE.MathUtils.clamp(m.yawRate * 0.22, -0.4, 0.4);
        motion[i * 4 + 2] = 0;
        motion[i * 4 + 3] = school.dart * 0.8;

        const roll = THREE.MathUtils.clamp(-m.yawRate * 0.18, -0.4, 0.4);
        this.writeInstance(i, m.pos, m.dir, roll, m.scale, fade);
      }
    }

    // --- Leapers ---
    const maxConcurrent = creatureActivity > 1.3 ? 2 : 1;
    let activeJumpers = this.jumpers.filter((j) => j.active).length;

    if (this.pendingSummon) {
      this.pendingSummon = false;
      const idle = this.jumpers.find((j) => !j.active) ?? this.jumpers[0];
      this.startJump(idle, cam, true);
      activeJumpers = this.jumpers.filter((j) => j.active).length;
    }

    for (let jIdx = 0; jIdx < JUMPER_COUNT; jIdx++) {
      const j = this.jumpers[jIdx];
      const i = j.index;

      if (!j.active) {
        if (enabled && dt > 0) {
          j.cooldown -= dt * (0.4 + 0.8 * creatureActivity);
          if (j.cooldown <= 0 && activeJumpers < maxConcurrent) {
            this.startJump(j, cam, false);
            activeJumpers++;
          }
        }
        if (!j.active) {
          state[i * 4] = 0;
          this.writeInstance(i, j.exit, j.dir, 0, j.scale, 0);
          continue;
        }
      }

      if (dt > 0) {
        j.tau += dt;
        j.exit.z += driftZ;
        j.entry.z += driftZ;
      }

      const pos = this.vWork;
      const vel = this.vWork2;
      let arch = 0;
      let beatAmp = 0.1;
      let beatHz = 4.2;
      let wet = 0;
      let flare = 0;

      if (j.tau < 0) {
        // Rocketing up from the depths along the launch line, tail thrashing
        vel.set(j.dir.x * j.vh, j.vy, j.dir.z * j.vh);
        pos.copy(j.exit).addScaledVector(vel, j.tau);
        beatAmp = 0.11;
        beatHz = 4.6;
      } else if (j.tau < j.airTime) {
        // Ballistic arc through the air
        const t = j.tau;
        vel.set(j.dir.x * j.vh, j.vy - GRAVITY * t, j.dir.z * j.vh);
        pos.set(
          j.exit.x + j.dir.x * j.vh * t,
          j.vy * t - 0.5 * GRAVITY * t * t,
          j.exit.z + j.dir.z * j.vh * t
        );
        // Bend the body to the curvature of the path, easing in/out at the surface
        const speed = vel.length();
        const curvature = (GRAVITY * j.vh) / (speed * speed * speed);
        const airEnv = Math.min(1, t / 0.18, (j.airTime - t) / 0.18);
        arch = 0.55 * curvature * j.scale * Math.max(0, airEnv);
        beatAmp = 0.035 + 0.05 * Math.max(0, 1 - t / 0.3);
        beatHz = 2.4;
        wet = 1;
        flare = 0.8 * Math.max(0, airEnv);
      } else {
        // Knifing back in, slowing as it carves down into the depths
        const t = j.tau - j.airTime;
        const drag = 1.4;
        const travel = (1 - Math.exp(-drag * t)) / drag;
        pos.set(
          j.entry.x + j.dir.x * j.vh * travel,
          -j.vy * travel - 0.6 * t * t,
          j.entry.z + j.dir.z * j.vh * travel
        );
        const decay = Math.exp(-drag * t);
        vel.set(j.dir.x * j.vh * decay, -j.vy * decay - 1.2 * t, j.dir.z * j.vh * decay);
        wet = Math.max(0, 1 - t * 2);
        beatAmp = 0.09;
        beatHz = 3.6;
      }

      if (dt > 0) j.swimPhase += beatHz * Math.PI * 2 * dt;
      this.emitSplashes(j, pos, vel, dt);

      const fadeIn = THREE.MathUtils.smoothstep(j.tau, -j.preTime, -j.preTime + 0.5);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(j.tau, j.airTime + j.postTime * 0.5, j.airTime + j.postTime);
      const fade = fadeIn * fadeOut;

      state[i * 4] = fade;
      state[i * 4 + 1] = arch;
      state[i * 4 + 2] = beatAmp;
      state[i * 4 + 3] = j.swimPhase;
      motion[i * 4] = wet;
      motion[i * 4 + 1] = 0;
      motion[i * 4 + 2] = flare;
      motion[i * 4 + 3] = 0.6 + 0.6 * wet;

      const dir = vel.normalize();
      this.writeInstance(i, pos, dir, 0, j.scale, fade);

      if (j.tau >= j.airTime + j.postTime) {
        j.active = false;
        j.cooldown = randRange(9, 20);
      }
    }

    this.stateAttr.needsUpdate = true;
    this.motionAttr.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.splash.dispose();
  }
}
