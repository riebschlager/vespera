import * as THREE from 'three';

export interface CreatureInstanceState {
  id: number;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  worldX: number;
  worldZ: number;
  baseYaw: number;
  scale: number;
  colorVariant: number;
  seed: number;
  isActive: boolean;
  cooldownTimer: number;
  cycleTime: number;
  cycleDuration: number;
  // Computed per-frame animation values
  verticalOffset: number;
  lookYaw: number;
  lookPitch: number;
  neckArch: number;
  rippleIntensity: number;
  cycleProgress: number;
  wetness: number;
  rig: CreatureSpineRig;
}

/** Number of joints in the procedural spine rig (must match the shader's RIG_JOINTS define). */
export const RIG_JOINT_COUNT = 24;

// Spine t that the head-mounted crown tendrils are rigidly bound to
const TENDRIL_BIND_T = 0.8;

// Helper to evaluate the 3D rest-pose spine center for t in [0, 1]
// t = 0: submerged lower body (y = -3.1)
// t = 0.65: upper neck (y = +1.85)
// t = 0.78: cranium & eyes (y = +2.25)
// t = 1.0: tapered snout tip peering forward (+z)
function getSpinePoint(t: number): THREE.Vector3 {
  let y: number;
  let z: number;

  if (t < 0.74) {
    const u = t / 0.74;
    // Smooth rise from -3.1 up to +2.22
    y = -3.1 + u * 5.32 + Math.sin(u * Math.PI) * 0.18;
    // Graceful S-curve along Z
    z = -Math.sin(u * Math.PI * 1.15) * 0.42 + Math.pow(u, 2.6) * 0.55;
  } else {
    // Head & rostrum curving forward in +Z to peer over the water
    const u = (t - 0.74) / 0.26;
    y = 2.22 + Math.sin(u * Math.PI * 0.65) * 0.16 - Math.pow(u, 1.8) * 0.34;
    z = 0.74 + u * 0.95;
  }

  return new THREE.Vector3(0, y, z);
}

interface SpineFrame {
  center: THREE.Vector3;
  right: THREE.Vector3;
  dorsal: THREE.Vector3;
  tangent: THREE.Vector3;
}

// Rest-pose local frame along the spine. Columns (right, dorsal, tangent) form a
// right-handed basis, so the rig expresses local offsets as (x, y, z) = (right, dorsal, tangent).
function getSpineFrame(t: number): SpineFrame {
  const center = getSpinePoint(t);
  const eps = 0.005;
  const pPrev = getSpinePoint(Math.max(0, t - eps));
  const pNext = getSpinePoint(Math.min(1, t + eps));
  const tangent = pNext.sub(pPrev).normalize();
  const right = new THREE.Vector3(1, 0, 0);
  const dorsal = new THREE.Vector3().crossVectors(tangent, right).normalize();
  return { center, right, dorsal, tangent };
}

/**
 * Builds a procedural 3D geometry for a graceful cyber-dream bioluminescent sea creature:
 * - S-curved pelagic neck & torso
 * - Sculpted hydro-dynamic head with binocular glowing ocular nodes (eyes)
 * - Scalloped translucent dorsal crest & lateral sea-dragon gill frills
 * - Swept-back bioluminescent crown tendrils
 */
export function createBioluminescentCreatureGeometry(): THREE.BufferGeometry {
  const spineSteps = 68;
  const radialSteps = 32;

  const positions: number[] = [];
  const normals: number[] = [];
  const spineTs: number[] = [];
  const features: number[] = []; // [eyeMask, crestMask, patternCoord]
  // Skinning data for the spine rig: each vertex is bound to a spine t and stores its
  // position/normal in that rest frame, so the shader can rebuild it on the deformed spine
  const rigBinds: number[] = []; // [bindT, tendrilU]
  const localPositions: number[] = [];
  const localNormals: number[] = [];
  const indices: number[] = [];

  // Bind against the rig's own interpolated rest spine (not the analytic frame) so the
  // undeformed rig reproduces the sculpted pose exactly, even across the neck/head kink
  const restSample = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const invQuat = new THREE.Quaternion();
  const bindVertex = (
    bindT: number,
    tendrilU: number,
    worldPos: THREE.Vector3,
    worldNormal: THREE.Vector3
  ): void => {
    sampleRestSpine(bindT, restSample.pos, restSample.quat);
    invQuat.copy(restSample.quat).invert();
    const lp = worldPos.clone().sub(restSample.pos).applyQuaternion(invQuat);
    const ln = worldNormal.clone().applyQuaternion(invQuat);
    rigBinds.push(bindT, tendrilU);
    localPositions.push(lp.x, lp.y, lp.z);
    localNormals.push(ln.x, ln.y, ln.z);
  };

  // Generate main body, neck, head, dorsal crest, and lateral frills
  for (let i = 0; i <= spineSteps; i++) {
    const t = i / spineSteps;
    const { center, right, dorsal, tangent } = getSpineFrame(t);

    // Base radius profile along the creature
    let radiusW = 0.25;
    let radiusH = 0.25;

    if (t < 0.55) {
      // Torso tapering into slender graceful neck
      const u = t / 0.55;
      radiusW = THREE.MathUtils.lerp(0.54, 0.21, Math.pow(u, 0.75));
      radiusH = THREE.MathUtils.lerp(0.50, 0.22, Math.pow(u, 0.75));
    } else if (t < 0.72) {
      // Upper neck approaching head
      const u = (t - 0.55) / 0.17;
      radiusW = THREE.MathUtils.lerp(0.21, 0.25, u);
      radiusH = THREE.MathUtils.lerp(0.22, 0.24, u);
    } else {
      // Sculpted head & tapered rostrum
      const u = (t - 0.72) / 0.28;
      const headBulge = Math.sin(u * Math.PI);
      const snoutTaper = 1.0 - Math.pow(u, 1.45);
      radiusW = (0.25 + headBulge * 0.14) * snoutTaper + 0.015;
      radiusH = (0.24 + headBulge * 0.09) * snoutTaper + 0.012;
    }

    for (let j = 0; j <= radialSteps; j++) {
      const v = j / radialSteps;
      // Angle around cross-section: 0 = dorsal (top), PI = ventral (bottom)
      const angle = (v - 0.5) * Math.PI * 2.0;
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);

      let localX = sinA * radiusW;
      let localDorsal = cosA * radiusH;
      let localForward = 0.0;

      // 1. Scalloped Translucent Dorsal Crest along upper neck & cranium
      let crestMask = 0.0;
      const dorsalAlign = Math.max(0.0, cosA);
      if (t > 0.28 && t < 0.88 && dorsalAlign > 0.72) {
        const crestEnv = Math.sin(((t - 0.28) / 0.60) * Math.PI);
        const ridgeSharpness = Math.pow((dorsalAlign - 0.72) / 0.28, 1.6);
        const scallop = 0.78 + 0.22 * Math.sin(t * 58.0);
        const crestExtension = crestEnv * ridgeSharpness * scallop * 0.46;
        localDorsal += crestExtension;
        localForward -= crestExtension * 0.35; // Swept-back fin profile
        crestMask = Math.min(1.0, ridgeSharpness * crestEnv * 1.35);
      }

      // 2. Lateral Sea-Dragon Frills / Fin-Wings on neck & cheeks
      const sideAlign = Math.abs(sinA);
      if (t > 0.36 && t < 0.81 && sideAlign > 0.82 && Math.abs(cosA) < 0.55) {
        const frillEnv = Math.sin(((t - 0.36) / 0.45) * Math.PI);
        const sideSharpness = Math.pow((sideAlign - 0.82) / 0.18, 1.5);
        const wavelet = 0.75 + 0.25 * Math.cos(t * 44.0);
        const frillSpan = frillEnv * sideSharpness * wavelet * 0.38;
        localX += Math.sign(sinA) * frillSpan;
        localDorsal += frillSpan * 0.15;
        localForward -= frillSpan * 0.42;
        crestMask = Math.max(crestMask, Math.min(1.0, sideSharpness * frillEnv * 1.3));
      }

      // 3. Binocular Glowing Ocular Nodes (Eyes) on the sides/front of the head
      let eyeMask = 0.0;
      const eyeT = (t - 0.81) / 0.048;
      const eyeAngleDist = (Math.abs(angle) - 0.92) / 0.34;
      const eyeDistSq = eyeT * eyeT + eyeAngleDist * eyeAngleDist;
      if (eyeDistSq < 1.0) {
        eyeMask = Math.pow(1.0 - eyeDistSq, 1.5);
        // Subtle convex lens protrusion for the eyes
        const eyeBulge = eyeMask * 0.055;
        localX += Math.sign(sinA) * eyeBulge;
        localDorsal += cosA * eyeBulge * 0.6;
      }

      const vertexPos = center
        .clone()
        .addScaledVector(right, localX)
        .addScaledVector(dorsal, localDorsal)
        .addScaledVector(tangent, localForward);

      const normalVec = new THREE.Vector3()
        .addScaledVector(right, sinA / Math.max(radiusW, 0.01))
        .addScaledVector(dorsal, cosA / Math.max(radiusH, 0.01))
        .normalize();

      positions.push(vertexPos.x, vertexPos.y, vertexPos.z);
      normals.push(normalVec.x, normalVec.y, normalVec.z);
      spineTs.push(t);
      features.push(eyeMask, crestMask, v);
      bindVertex(t, 0, vertexPos, normalVec);
    }
  }

  const ringStride = radialSteps + 1;
  for (let i = 0; i < spineSteps; i++) {
    for (let j = 0; j < radialSteps; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Add 2 swept-back bioluminescent crown tendrils / sensory filaments
  const tendrilSteps = 22;
  const tendrilRadial = 8;
  const sides = [-1, 1];

  for (const side of sides) {
    const baseVertexOffset = positions.length / 3;

    const getTendrilPoint = (u: number): THREE.Vector3 => {
      // Originates near the temple/crown (y ~ 2.28, z ~ 0.62) and arches gracefully back
      const x = side * (0.14 + u * 0.34 + Math.sin(u * Math.PI * 1.5) * 0.08);
      const y = 2.26 + Math.sin(u * Math.PI * 0.8) * 0.38 - Math.pow(u, 1.7) * 0.65;
      const z = 0.62 - u * 1.45;
      return new THREE.Vector3(x, y, z);
    };

    for (let i = 0; i <= tendrilSteps; i++) {
      const u = i / tendrilSteps;
      const pt = getTendrilPoint(u);
      const ptNext = getTendrilPoint(Math.min(1, u + 0.02));
      const ptPrev = getTendrilPoint(Math.max(0, u - 0.02));
      const tang = ptNext.sub(ptPrev).normalize();

      const upRef = new THREE.Vector3(0, 1, 0);
      const binorm1 = new THREE.Vector3().crossVectors(tang, upRef).normalize();
      const binorm2 = new THREE.Vector3().crossVectors(binorm1, tang).normalize();

      const rad = THREE.MathUtils.lerp(0.038, 0.006, Math.pow(u, 0.85));

      for (let j = 0; j <= tendrilRadial; j++) {
        const v = j / tendrilRadial;
        const ang = v * Math.PI * 2;
        const nVec = binorm1
          .clone()
          .multiplyScalar(Math.cos(ang))
          .addScaledVector(binorm2, Math.sin(ang))
          .normalize();
        const vPos = pt.clone().addScaledVector(nVec, rad);

        positions.push(vPos.x, vPos.y, vPos.z);
        normals.push(nVec.x, nVec.y, nVec.z);
        // Map tendril spineT to [0.76 .. 1.0] so it moves with the head and pulses outward
        spineTs.push(0.76 + u * 0.24);
        features.push(0.0, 0.85 + 0.15 * u, u);
        // Rigidly bound to the cranium; tendrilU drives drag follow-through in the shader
        bindVertex(TENDRIL_BIND_T, u, vPos, nVec);
      }
    }

    const tStride = tendrilRadial + 1;
    for (let i = 0; i < tendrilSteps; i++) {
      for (let j = 0; j < tendrilRadial; j++) {
        const a = baseVertexOffset + i * tStride + j;
        const b = baseVertexOffset + (i + 1) * tStride + j;
        const c = baseVertexOffset + (i + 1) * tStride + (j + 1);
        const d = baseVertexOffset + i * tStride + (j + 1);

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aSpineT', new THREE.Float32BufferAttribute(spineTs, 1));
  geometry.setAttribute('aFeature', new THREE.Float32BufferAttribute(features, 3));
  geometry.setAttribute('aRig', new THREE.Float32BufferAttribute(rigBinds, 2));
  geometry.setAttribute('aLocalPos', new THREE.Float32BufferAttribute(localPositions, 3));
  geometry.setAttribute('aLocalNormal', new THREE.Float32BufferAttribute(localNormals, 3));

  return geometry;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Half-sine bump over [a, b], zero outside
function bell(t: number, a: number, b: number): number {
  if (t <= a || t >= b) return 0;
  return Math.sin(((t - a) / (b - a)) * Math.PI);
}

interface RestRig {
  t: number[];
  pos: THREE.Vector3[];
  quat: THREE.Quaternion[];
  // Rest rotation of joint i relative to joint i-1
  relQuat: THREE.Quaternion[];
  // Rest offset from joint i-1 to joint i, in joint i-1's frame
  offsetLocal: THREE.Vector3[];
  // Rest curvature at joint i (rotation about the local right axis, in radians)
  bend: number[];
}

let restRigCache: RestRig | null = null;

function getRestRig(): RestRig {
  if (restRigCache) return restRigCache;

  const rest: RestRig = { t: [], pos: [], quat: [], relQuat: [], offsetLocal: [], bend: [] };
  const basis = new THREE.Matrix4();

  for (let i = 0; i < RIG_JOINT_COUNT; i++) {
    const t = i / (RIG_JOINT_COUNT - 1);
    const frame = getSpineFrame(t);
    basis.makeBasis(frame.right, frame.dorsal, frame.tangent);
    rest.t.push(t);
    rest.pos.push(frame.center);
    rest.quat.push(new THREE.Quaternion().setFromRotationMatrix(basis));
  }

  for (let i = 0; i < RIG_JOINT_COUNT; i++) {
    if (i === 0) {
      rest.relQuat.push(new THREE.Quaternion());
      rest.offsetLocal.push(new THREE.Vector3());
      rest.bend.push(0);
      continue;
    }
    const parentInv = rest.quat[i - 1].clone().invert();
    const rel = parentInv.clone().multiply(rest.quat[i]);
    rest.relQuat.push(rel);
    rest.offsetLocal.push(rest.pos[i].clone().sub(rest.pos[i - 1]).applyQuaternion(parentInv));
    // All rest frames share right = +X, so the relative rotation is purely about local X
    rest.bend.push(2 * Math.atan2(rel.x, rel.w));
  }

  restRigCache = rest;
  return rest;
}

/**
 * CPU mirror of the creature vertex shader's sampleSpine(): Hermite-interpolated position
 * and nlerp orientation between rest joints. Keep the two in sync.
 */
function sampleRestSpine(t: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): void {
  const rest = getRestRig();
  const f = THREE.MathUtils.clamp(t, 0, 1) * (RIG_JOINT_COUNT - 1);
  const i0 = Math.min(Math.floor(f), RIG_JOINT_COUNT - 2);
  const s = f - i0;

  const p0 = rest.pos[i0];
  const p1 = rest.pos[i0 + 1];
  const q0 = rest.quat[i0];
  const q1 = rest.quat[i0 + 1].clone();
  if (q0.dot(q1) < 0) q1.set(-q1.x, -q1.y, -q1.z, -q1.w);

  const segLen = p0.distanceTo(p1);
  const m0 = new THREE.Vector3(0, 0, 1).applyQuaternion(q0).multiplyScalar(segLen);
  const m1 = new THREE.Vector3(0, 0, 1).applyQuaternion(q1).multiplyScalar(segLen);

  const s2 = s * s;
  const s3 = s2 * s;
  outPos
    .copy(p0)
    .multiplyScalar(2 * s3 - 3 * s2 + 1)
    .addScaledVector(m0, s3 - 2 * s2 + s)
    .addScaledVector(p1, -2 * s3 + 3 * s2)
    .addScaledVector(m1, s3 - s2);

  // Component-wise lerp + normalise, matching GLSL normalize(mix(q0, q1, s))
  outQuat
    .set(
      q0.x + (q1.x - q0.x) * s,
      q0.y + (q1.y - q0.y) * s,
      q0.z + (q1.z - q0.z) * s,
      q0.w + (q1.w - q0.w) * s
    )
    .normalize();
}

// Model-space XZ where the rest spine meets the water while poised (vertical offset ~ +0.18)
let restWaterlineCache: THREE.Vector2 | null = null;

function getRestWaterlineCrossing(): THREE.Vector2 {
  if (restWaterlineCache) return restWaterlineCache;
  const poisedOffset = 0.18;
  const pos = getRestRig().pos;
  restWaterlineCache = new THREE.Vector2(0, 0);
  for (let i = 1; i < pos.length; i++) {
    const ay = pos[i - 1].y + poisedOffset;
    const by = pos[i].y + poisedOffset;
    if (ay < 0 && by >= 0) {
      const f = -ay / (by - ay);
      restWaterlineCache.set(
        THREE.MathUtils.lerp(pos[i - 1].x, pos[i].x, f),
        THREE.MathUtils.lerp(pos[i - 1].z, pos[i].z, f)
      );
      break;
    }
  }
  return restWaterlineCache;
}

const HEAD_JOINT =Math.round(0.86 * (RIG_JOINT_COUNT - 1));

/**
 * Procedural spine rig: a forward-kinematic chain of joints whose local bend angles
 * (x: ventral curl, y: lateral bend, z: twist) chase choreographed targets through
 * underdamped springs. Joints nearer the head use softer springs, so motion
 * overlaps and follows through along the body instead of moving as one rigid piece.
 * The solved joint transforms are written straight into shader uniform arrays.
 */
export class CreatureSpineRig {
  public readonly jointPos: THREE.Vector3[] = [];
  public readonly jointQuat: THREE.Vector4[] = [];
  public readonly headVelocity = new THREE.Vector3();

  // Root transform (model space), set by the choreography each frame
  public readonly rootOffset = new THREE.Vector3();
  public rootTilt = 0; // Lean toward +Z (forward)
  public rootRoll = 0; // Lean sideways

  private readonly targets = new Float32Array(RIG_JOINT_COUNT * 3);
  private readonly angles = new Float32Array(RIG_JOINT_COUNT * 3);
  private readonly velocities = new Float32Array(RIG_JOINT_COUNT * 3);
  private readonly stiffness = new Float32Array(RIG_JOINT_COUNT);
  private needsSnap = true;
  private hasPrevHead = false;
  private readonly prevHead = new THREE.Vector3();

  private readonly qWork = new THREE.Quaternion();
  private readonly qParent = new THREE.Quaternion();
  private readonly qBend = new THREE.Quaternion();
  private readonly eulerWork = new THREE.Euler();
  private readonly vWork = new THREE.Vector3();

  constructor() {
    const rest = getRestRig();
    for (let i = 0; i < RIG_JOINT_COUNT; i++) {
      this.jointPos.push(rest.pos[i].clone());
      const q = rest.quat[i];
      this.jointQuat.push(new THREE.Vector4(q.x, q.y, q.z, q.w));
      // Angular frequency: stiff near the submerged trunk, loose toward the head
      this.stiffness[i] = THREE.MathUtils.lerp(11.0, 6.0, rest.t[i]);
    }
  }

  /** Snap springs to their targets on the next update (call on respawn). */
  public reset(): void {
    this.needsSnap = true;
    this.hasPrevHead = false;
    this.headVelocity.set(0, 0, 0);
  }

  public setTarget(i: number, curl: number, lateral: number, twist: number): void {
    this.targets[i * 3] = curl;
    this.targets[i * 3 + 1] = lateral;
    this.targets[i * 3 + 2] = twist;
  }

  public update(dt: number): void {
    this.stepSprings(dt);
    this.solve();

    const head = this.jointPos[HEAD_JOINT];
    if (dt > 0) {
      if (this.hasPrevHead) {
        this.vWork.copy(head).sub(this.prevHead).divideScalar(dt);
        this.vWork.clampLength(0, 4.0);
        this.headVelocity.lerp(this.vWork, 1 - Math.exp(-dt * 10));
      }
      this.prevHead.copy(head);
      this.hasPrevHead = true;
    }
  }

  private stepSprings(dt: number): void {
    if (this.needsSnap) {
      this.angles.set(this.targets);
      this.velocities.fill(0);
      this.needsSnap = false;
      return;
    }
    if (dt <= 0) return;

    const damping = 0.5;
    const substeps = Math.max(1, Math.ceil(Math.min(dt, 0.1) / (1 / 120)));
    const h = Math.min(dt, 0.1) / substeps;
    for (let s = 0; s < substeps; s++) {
      for (let i = 0; i < RIG_JOINT_COUNT; i++) {
        const w = this.stiffness[i];
        for (let k = 0; k < 3; k++) {
          const idx = i * 3 + k;
          const accel =
            w * w * (this.targets[idx] - this.angles[idx]) -
            2 * damping * w * this.velocities[idx];
          this.velocities[idx] += accel * h;
          this.angles[idx] += this.velocities[idx] * h;
        }
      }
    }
  }

  private solve(): void {
    const rest = getRestRig();

    // Root joint: rest frame tilted about the trunk base, then offset
    this.eulerWork.set(this.rootTilt, 0, this.rootRoll, 'XYZ');
    this.qParent.setFromEuler(this.eulerWork).multiply(rest.quat[0]);
    const p0 = this.jointPos[0].copy(rest.pos[0]).add(this.rootOffset);
    this.jointQuat[0].set(this.qParent.x, this.qParent.y, this.qParent.z, this.qParent.w);

    let prevPos = p0;
    for (let i = 1; i < RIG_JOINT_COUNT; i++) {
      this.eulerWork.set(
        this.angles[i * 3],
        this.angles[i * 3 + 1],
        this.angles[i * 3 + 2],
        'XYZ'
      );
      this.qBend.setFromEuler(this.eulerWork);
      // Animated bend at the parent joint swings the outgoing segment
      this.qWork.copy(this.qParent).multiply(this.qBend);

      const pos = this.jointPos[i]
        .copy(rest.offsetLocal[i])
        .applyQuaternion(this.qWork)
        .add(prevPos);

      this.qParent.copy(this.qWork).multiply(rest.relQuat[i]);
      this.jointQuat[i].set(this.qParent.x, this.qParent.y, this.qParent.z, this.qParent.w);
      prevPos = pos;
    }
  }
}

// Per-joint distribution weights for the choreography (normalised so totals are predictable)
function normalizedWeights(fn: (t: number) => number): number[] {
  const rest = getRestRig();
  const w = rest.t.map((t, i) => (i === 0 ? 0 : fn(t)));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => x / sum);
}

/**
 * Manages a pod of 4 bioluminescent creatures that periodically emerge and peer
 * above the surface of the water, casting glowing ripples and planar reflections.
 */
export class BioluminescentCreaturePod {
  public readonly group: THREE.Group;
  public readonly instances: CreatureInstanceState[] = [];
  public readonly rippleUniformArray: THREE.Vector4[] = [
    new THREE.Vector4(0, 0, 0, 0),
    new THREE.Vector4(0, 0, 0, 0),
    new THREE.Vector4(0, 0, 0, 0),
    new THREE.Vector4(0, 0, 0, 0),
  ];

  private geometry: THREE.BufferGeometry;
  private baseMaterial: THREE.ShaderMaterial;

  // Choreography weights per rig joint
  private readonly pitchWeights = normalizedWeights((t) => bell(t, 0.42, 0.98));
  private readonly twistWeights = normalizedWeights((t) => bell(t, 0.22, 0.8));
  private readonly headTurnWeights = normalizedWeights((t) => bell(t, 0.66, 0.9));
  private readonly headCockWeights = normalizedWeights((t) => bell(t, 0.7, 1.0));

  // Scenic sectors ahead of the camera so creatures don't overlap each other
  private static readonly SECTORS = [
    { minX: -22, maxX: -6, minZ: -44, maxZ: -26 },
    { minX: 6, maxX: 22, minZ: -48, maxZ: -28 },
    { minX: -14, maxX: 12, minZ: -68, maxZ: -46 },
    { minX: -30, maxX: 30, minZ: -56, maxZ: -32 },
  ];

  constructor(vertexShader: string, fragmentShader: string) {
    this.group = new THREE.Group();
    this.geometry = createBioluminescentCreatureGeometry();

    this.baseMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      defines: { RIG_JOINTS: RIG_JOINT_COUNT },
    });

    for (let i = 0; i < 4; i++) {
      const mat = this.baseMaterial.clone();
      const rig = new CreatureSpineRig();
      mat.uniforms = {
        uTime: { value: 0 },
        uWaveSpeed: { value: 0.85 },
        uWaveDistortion: { value: 0.5 },
        uDriftOffset: { value: 0 },
        uJointPos: { value: rig.jointPos },
        uJointQuat: { value: rig.jointQuat },
        uHeadVelocity: { value: rig.headVelocity },
        uWetness: { value: 0 },
        uCycleProgress: { value: 0 },
        uCreatureSeed: { value: i * 17.31 + 3.7 },
        uColorVariant: { value: i / 3 },
        uCyberIntensity: { value: 0.6 },
        uMoonGlow: { value: 1.2 },
        uCameraPos: { value: new THREE.Vector3() },
        uMoonCore: { value: new THREE.Color('#f0f9ff') },
        uMoonHalo: { value: new THREE.Color('#38bdf8') },
        uCyberAccent: { value: new THREE.Color('#06b6d4') },
        uWaterDeep: { value: new THREE.Color('#030611') },
        uSubmergedView: { value: 0 },
      };

      const mesh = new THREE.Mesh(this.geometry, mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);

      const inst: CreatureInstanceState = {
        id: i,
        mesh,
        material: mat,
        worldX: 0,
        worldZ: -35,
        baseYaw: 0,
        scale: 1.0,
        colorVariant: i / 3,
        seed: i * 17.31 + 3.7,
        isActive: false,
        cooldownTimer: 0,
        cycleTime: 0,
        cycleDuration: 10.0,
        verticalOffset: -3.5,
        lookYaw: 0,
        lookPitch: 0,
        neckArch: 0,
        rippleIntensity: 0,
        cycleProgress: 0,
        wetness: 0,
        rig,
      };

      this.respawnCreature(inst, i, true);
      this.instances.push(inst);
    }
  }

  private respawnCreature(
    inst: CreatureInstanceState,
    sectorIdx: number,
    isInitialLoad = false
  ): void {
    const sector =
      BioluminescentCreaturePod.SECTORS[
        sectorIdx % BioluminescentCreaturePod.SECTORS.length
      ];

    inst.worldX = THREE.MathUtils.lerp(sector.minX, sector.maxX, Math.random());
    inst.worldZ = THREE.MathUtils.lerp(sector.minZ, sector.maxZ, Math.random());
    inst.scale = 0.88 + Math.random() * 0.34;
    inst.colorVariant = (sectorIdx * 0.28 + Math.random() * 0.25) % 1.0;
    inst.cycleDuration = 9.0 + Math.random() * 2.8;
    inst.rig.reset();
    inst.wetness = 1;

    // Orient generally toward the camera (+Z) at a graceful three-quarter profile
    // so both the arched neck/dorsal crown and the glowing eyes are clearly visible
    const angleToOrigin = Math.atan2(-inst.worldX, -inst.worldZ);
    const profileBias = (inst.worldX < 0 ? 1 : -1) * (0.35 + Math.random() * 0.45);
    inst.baseYaw = angleToOrigin + profileBias;

    if (isInitialLoad) {
      if (sectorIdx === 0) {
        // First creature starts already beginning to rise so the user sees one right away
        inst.worldX = -7.2;
        inst.worldZ = -31.0;
        inst.baseYaw = 0.52;
        inst.scale = 1.08;
        inst.isActive = true;
        inst.cycleTime = 1.15;
        inst.cooldownTimer = 0;
      } else if (sectorIdx === 1) {
        inst.worldX = 10.5;
        inst.worldZ = -40.0;
        inst.baseYaw = -0.58;
        inst.isActive = false;
        inst.cooldownTimer = 2.8;
        inst.cycleTime = 0;
      } else {
        inst.isActive = false;
        inst.cooldownTimer = 5.5 + sectorIdx * 3.2;
        inst.cycleTime = 0;
      }
    } else {
      inst.isActive = false;
      inst.cycleTime = 0;
      inst.cooldownTimer = 3.5 + Math.random() * 6.5;
    }
  }

  /**
   * Immediately triggers a creature to emerge and peer above the water in front of the camera.
   */
  public summonCreature(): void {
    // Find an inactive creature or the one furthest along its cycle
    let candidate = this.instances.find((c) => !c.isActive);
    if (!candidate) {
      candidate = this.instances.reduce((prev, curr) =>
        curr.cycleTime > prev.cycleTime ? curr : prev
      );
    }

    // Place in a prime foreground viewing spot
    const side = Math.random() > 0.5 ? 1 : -1;
    candidate.worldX = side * (4.5 + Math.random() * 7.5);
    candidate.worldZ = -25.0 - Math.random() * 12.0;
    candidate.scale = 1.05 + Math.random() * 0.22;
    candidate.baseYaw = -side * (0.45 + Math.random() * 0.3);
    candidate.cycleDuration = 9.8;
    candidate.isActive = true;
    candidate.cycleTime = 1.1; // Right at the start of breaching the surface
    candidate.cooldownTimer = 0;
    candidate.rig.reset();
    candidate.wetness = 1;
  }

  /**
   * Drives the spine rig from the lifecycle phase. Instead of sliding a frozen pose
   * up and down, the body changes shape as it breaches: it rises straightened and
   * swimming with its head tipped skyward, uncurls into the S-pose while peering,
   * then curls forward and arcs back under so the head leads the body into the water.
   */
  private poseRig(
    inst: CreatureInstanceState,
    p: number,
    elapsedTime: number,
    rise: number,
    dive: number,
    peerWindow: number
  ): void {
    const rig = inst.rig;
    const rest = getRestRig();
    const seed = inst.seed;

    // Head tips up toward the moon as it breaks the surface, then settles to peer
    const breachLookUp = smoothstep(0.08, 0.17, p) * (1.0 - smoothstep(0.22, 0.4, p));
    // Rest curvature scale: straight & streamlined while rising, full S while poised,
    // over-curled forward when diving
    const curl = THREE.MathUtils.lerp(0.45, 1.0, smoothstep(0.12, 0.38, p)) + 0.35 * dive;
    // Serpentine swim wave travelling head -> tail; strong while moving, a lazy drift while peering
    const swimAmp = THREE.MathUtils.lerp(0.055, 0.02, peerWindow) + 0.03 * dive;
    const swimPhase = elapsedTime * THREE.MathUtils.lerp(2.6, 1.3, peerWindow) + seed;
    // Curious head-cock roll while peering
    const headCock = Math.sin(elapsedTime * 0.9 + seed * 1.7) * 0.22 * peerWindow;
    const lookPitch = inst.lookPitch + breachLookUp * 0.75;

    for (let i = 1; i < RIG_JOINT_COUNT; i++) {
      const t = rest.t[i];

      let curlAngle = (curl - 1.0) * rest.bend[i];
      // Positive curl bends ventrally (head down), so looking up subtracts
      curlAngle -= lookPitch * this.pitchWeights[i];
      // Slow breathing ripple through the chest & neck
      curlAngle += Math.sin(elapsedTime * 1.1 + seed - t * 3.0) * 0.012 * bell(t, 0.15, 0.7);

      let lateral =
        swimAmp *
        Math.sin(swimPhase + t * Math.PI * 2.4) *
        (1.0 - smoothstep(0.68, 0.92, t));
      lateral += inst.lookYaw * 0.3 * this.headTurnWeights[i];

      // Twisting the near-vertical neck turns the head about the vertical axis, like a swan
      const twist = inst.lookYaw * 0.75 * this.twistWeights[i] + headCock * this.headCockWeights[i];

      rig.setTarget(i, curlAngle, lateral, twist);
    }

    // Root: approach at a forward lean, stand upright while poised, then pitch forward
    // and glide ahead into the dive so the head traces an arc back into the water
    rig.rootTilt = 0.32 * (1.0 - rise) + 0.6 * dive + Math.sin(elapsedTime * 0.7 + seed) * 0.03;
    rig.rootRoll = -inst.lookYaw * 0.08 + Math.sin(elapsedTime * 0.55 + seed * 0.3) * 0.025;
    rig.rootOffset.set(0, inst.verticalOffset, -0.9 * (1.0 - rise) + 1.5 * dive);
  }

  /**
   * World XZ of the ripple source: where the spine pierces the surface in the settled
   * peering pose. It is anchored to the creature's (water-drifting) spawn point rather
   * than the live pose, so emitted rings keep propagating through the water instead of
   * wiggling along with the body's sway, bob and dive.
   */
  private computeWaterlineCrossing(inst: CreatureInstanceState, out: THREE.Vector2): void {
    const { x: lx, y: lz } = getRestWaterlineCrossing();
    const c = Math.cos(inst.baseYaw);
    const s = Math.sin(inst.baseYaw);
    out.set(
      inst.worldX + (lx * c + lz * s) * inst.scale,
      inst.worldZ + (-lx * s + lz * c) * inst.scale
    );
  }

  private readonly crossingWork = new THREE.Vector2();

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
    moonCore: THREE.Color;
    moonHalo: THREE.Color;
    cyberAccent: THREE.Color;
    waterDeep: THREE.Color;
  }): void {
    const {
      dt,
      elapsedTime,
      driftOffset,
      driftSpeed,
      waveSpeed,
      waveDistortion,
      creatureActivity,
      cyberIntensity,
      moonGlow,
      cameraPos,
      moonCore,
      moonHalo,
      cyberAccent,
      waterDeep,
    } = params;

    // If creatureActivity is turned all the way down to 0, hide all creatures and ripples
    if (creatureActivity <= 0.01) {
      for (let i = 0; i < 4; i++) {
        this.instances[i].mesh.visible = false;
        this.rippleUniformArray[i].set(0, 0, 0, 0);
      }
      return;
    }

    // Limit max simultaneous active creatures based on creatureActivity slider
    const maxConcurrent = creatureActivity > 1.35 ? 3 : creatureActivity > 0.65 ? 2 : 1;
    const currentActiveCount = this.instances.filter((c) => c.isActive).length;

    for (let i = 0; i < 4; i++) {
      const inst = this.instances[i];

      if (!inst.isActive) {
        inst.cooldownTimer -= dt * (0.45 + 0.75 * creatureActivity);
        inst.mesh.visible = false;
        this.rippleUniformArray[i].set(inst.worldX, inst.worldZ, 0, 0);

        if (inst.cooldownTimer <= 0 && currentActiveCount < maxConcurrent) {
          inst.isActive = true;
          inst.cycleTime = 0;
        }
        continue;
      }

      // Advance active peering lifecycle
      inst.cycleTime += dt;
      // Drift gently relative to the floating camera so the creature feels anchored in the sea
      inst.worldZ += dt * driftSpeed * 2.4;

      // If cycle finished or drifted too close to the camera lens, respawn
      if (inst.cycleTime >= inst.cycleDuration || inst.worldZ > -9.0) {
        this.respawnCreature(inst, i, false);
        inst.mesh.visible = false;
        this.rippleUniformArray[i].set(0, 0, 0, 0);
        continue;
      }

      const p = inst.cycleTime / inst.cycleDuration;
      inst.cycleProgress = p;

      // 1. Vertical emergence envelope:
      // 0.00 -> 0.12: subsurface approach
      // 0.12 -> 0.32: rising gracefully out of the water
      // 0.32 -> 0.72: poised above the surface peering around
      // 0.72 -> 0.90: submerging back beneath the waves
      const riseFactor = smoothstep(0.10, 0.33, p);
      const diveFactor = 1.0 - smoothstep(0.70, 0.90, p);
      const surfacePresence = riseFactor * diveFactor;

      // Gentle buoyant bobbing while peering above the surface
      const bob = Math.sin(elapsedTime * 1.6 + inst.seed) * 0.12 * surfacePresence;
      inst.verticalOffset = THREE.MathUtils.lerp(-2.85, 0.18, surfacePresence) + bob;

      // 2. Curious Peering Head-Turn & Tilt Choreography:
      // While poised above the surface (p in 0.30..0.75), the creature turns its head
      // to scan the horizon and peer toward the camera / moon
      const peerWindow = smoothstep(0.24, 0.38, p) * (1.0 - smoothstep(0.68, 0.84, p));
      inst.lookYaw =
        Math.sin((p - 0.32) * Math.PI * 3.2 + inst.seed) * 0.58 * peerWindow;

      // Arch head slightly upward when emerging, level out while peering, and dip downward when diving
      const diveDip = smoothstep(0.68, 0.88, p) * -0.55;
      const curiosityTilt =
        Math.sin((p - 0.3) * Math.PI * 2.2) * 0.18 * peerWindow;
      inst.lookPitch = curiosityTilt + diveDip;
      inst.neckArch = surfacePresence;

      // Pose and solve the spine rig (springs give overlap & follow-through)
      this.poseRig(inst, p, elapsedTime, riseFactor, 1.0 - diveFactor, peerWindow);
      inst.rig.update(dt);

      // Freshly surfaced skin streams with water, drying off while poised
      const wetTarget = p < 0.36 ? 1.0 : 0.12;
      inst.wetness += (wetTarget - inst.wetness) * (1 - Math.exp(-dt / 3.0));

      // 3. Water Surface Ripple & Subsurface Bioluminescence Intensity:
      // Begins glowing just before breach (p = 0.04) and lingers as ripples fade (p = 0.98)
      const rippleEnv =
        smoothstep(0.03, 0.18, p) * (1.0 - smoothstep(0.82, 0.99, p));
      inst.rippleIntensity =
        rippleEnv * Math.min(1.5, 0.65 + 0.45 * creatureActivity);

      // Update mesh transform & shader uniforms
      inst.mesh.visible = p > 0.08 && p < 0.92;
      inst.mesh.position.set(inst.worldX, 0, inst.worldZ);
      inst.mesh.rotation.set(0, inst.baseYaw, 0);
      inst.mesh.scale.setScalar(inst.scale);

      const u = inst.material.uniforms;
      u.uTime.value = elapsedTime;
      u.uWaveSpeed.value = waveSpeed;
      u.uWaveDistortion.value = waveDistortion;
      u.uDriftOffset.value = driftOffset;
      u.uWetness.value = inst.wetness;
      u.uCycleProgress.value = p;
      u.uColorVariant.value = inst.colorVariant;
      u.uCyberIntensity.value = cyberIntensity;
      u.uMoonGlow.value = moonGlow;
      u.uCameraPos.value.copy(cameraPos);
      u.uMoonCore.value.copy(moonCore);
      u.uMoonHalo.value.copy(moonHalo);
      u.uCyberAccent.value.copy(cyberAccent);
      u.uWaterDeep.value.copy(waterDeep);

      // Update vec4(crossingX, crossingZ, cycleProgress, rippleIntensity) for the Ocean Shader,
      // centred where the body actually pierces the surface
      this.computeWaterlineCrossing(inst, this.crossingWork);
      this.rippleUniformArray[i].set(
        this.crossingWork.x,
        this.crossingWork.y,
        p,
        inst.rippleIntensity
      );
    }
  }

  /** Toggle between drawing the emerged upper body (above water) and the submerged trunk (underwater view). */
  public setSubmergedView(submerged: boolean): void {
    const value = submerged ? 1 : 0;
    for (const inst of this.instances) {
      inst.material.uniforms.uSubmergedView.value = value;
    }
  }

  public dispose(): void {
    this.geometry.dispose();
    this.baseMaterial.dispose();
    this.instances.forEach((inst) => {
      inst.material.dispose();
    });
  }
}
