import * as THREE from 'three';

export interface SkyWhaleInstance {
  id: number;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  // Orbital / flight trajectory parameters
  centerX: number;
  centerY: number;
  centerZ: number;
  orbitRadiusX: number;
  orbitRadiusZ: number;
  verticalAmp: number;
  flightSpeed: number;
  phaseAngle: number;
  direction: number; // 1 or -1
  scale: number;
  colorVariant: number;
  seed: number;
}

/**
 * Builds a procedural 3D geometry for a flying Jellyfish-Whale Leviathan ("Sky Cetacean"):
 * 1. Cetacean head & melon transitioning into a vaulted, ribbed translucent Medusa bell canopy,
 *    tapering into a sinuous tail peduncle and broad horizontal whale tail fluke.
 * 2. Two long, sweeping humpback-style pectoral wing-flippers with gossamer medusa frills.
 * 3. Ten long, streaming bioluminescent jellyfish tentacles & oral filaments trailing from beneath the bell.
 */
export function createSkyWhaleJellyGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const spineTs: number[] = [];
  const features: number[] = []; // [tentacleFactor, wingFactor, bellRimFactor, radialCoord]
  const indices: number[] = [];

  // ============================================================================
  // PART 1: Cetacean Body + Translucent Medusa Bell Canopy + Horizontal Tail Fluke
  // ============================================================================
  const spineSteps = 68;
  const radialSteps = 36;

  // Spine runs from t = 0 (snout at z = +4.4) to t = 1 (tail fluke notch at z = -5.6)
  const getSpineCenter = (t: number): THREE.Vector3 => {
    const z = 4.4 - t * 10.0;
    // Gentle cetacean dorsal arch
    const y =
      Math.sin(t * Math.PI * 0.95) * 0.42 -
      Math.pow(Math.max(0, t - 0.55), 1.8) * 0.65;
    return new THREE.Vector3(0, y, z);
  };

  for (let i = 0; i <= spineSteps; i++) {
    const t = i / spineSteps;
    const center = getSpineCenter(t);

    for (let j = 0; j <= radialSteps; j++) {
      const v = j / radialSteps;
      // angle: 0 = dorsal (top), +/-PI = ventral (belly), +/-PI/2 = left/right sides
      const angle = (v - 0.5) * Math.PI * 2.0;
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);

      let width = 0.5;
      let heightDorsal = 0.5;
      let heightVentral = 0.4;
      let zOffset = 0.0;
      let wingFactor = 0.0;
      let bellRimFactor = 0.0;

      if (t < 0.18) {
        // Bulbous cetacean melon / forehead & rounded snout
        const u = t / 0.18;
        const melonProfile = Math.pow(Math.sin(u * Math.PI * 0.5), 0.72);
        width = melonProfile * 1.15 + 0.04;
        heightDorsal = melonProfile * 1.05 + 0.04;
        heightVentral = melonProfile * 0.68 + 0.04;
      } else if (t < 0.60) {
        // Vaulted Medusa Jellyfish Bell Canopy over the back + ribbed whale torso underneath
        const u = (t - 0.18) / 0.42;
        const bellArc = Math.sin(u * Math.PI);

        // 14 radial jellyfish bell lobes along the upper canopy
        const isDorsal = smoothstep(-0.25, 0.35, cosA);
        const radialLobes = 1.0 + 0.075 * Math.cos(angle * 14.0) * isDorsal * bellArc;

        width = (1.15 + bellArc * 0.95 - u * 0.45) * radialLobes;
        heightDorsal = (1.05 + bellArc * 0.82 - u * 0.35) * radialLobes;
        heightVentral = 0.68 - u * 0.26 + Math.sin(u * Math.PI) * 0.12;

        // Overhanging scalloped jellyfish umbrella rim around t in [0.42..0.58]
        if (u > 0.52 && cosA > -0.35) {
          const rimU = (u - 0.52) / 0.48;
          const rimFlare = Math.sin(rimU * Math.PI);
          const scallop = 0.8 + 0.2 * Math.cos(angle * 14.0);
          const flareAmount = rimFlare * scallop * isDorsal * 0.52;
          width += flareAmount;
          heightDorsal += flareAmount * 0.45;
          zOffset -= flareAmount * 0.35;
          bellRimFactor = Math.min(1.0, rimFlare * isDorsal * 1.25);
        } else {
          bellRimFactor = isDorsal * bellArc * 0.65;
        }
      } else if (t < 0.82) {
        // Muscular cetacean tail stock (peduncle)
        const u = (t - 0.60) / 0.22;
        width = THREE.MathUtils.lerp(0.70, 0.22, u);
        heightDorsal = THREE.MathUtils.lerp(0.70, 0.26, u);
        heightVentral = THREE.MathUtils.lerp(0.42, 0.22, u);
      } else {
        // Broad horizontal Cetacean Tail Fluke
        const u = (t - 0.82) / 0.18;
        const flukeSpan = Math.sin(u * Math.PI * 0.78);
        // Notch at the very center of the trailing edge (t -> 1.0)
        const tipTaper = 1.0 - Math.pow(u, 3.2) * 0.35;
        width = (0.22 + flukeSpan * 1.95) * tipTaper;
        heightDorsal = THREE.MathUtils.lerp(0.24, 0.045, u);
        heightVentral = THREE.MathUtils.lerp(0.20, 0.045, u);
        // Sweep the outer fluke tips backward
        const lateralFrac = Math.abs(sinA);
        zOffset -= Math.pow(lateralFrac, 1.6) * u * 0.85;
        wingFactor = lateralFrac * u * 0.9;
        bellRimFactor = Math.pow(lateralFrac, 1.4) * u * 0.8;
      }

      // Bioluminescent Cetacean Eyes near t = 0.17, lateral sides
      const eyeT = (t - 0.17) / 0.035;
      const eyeA = (Math.abs(angle) - 1.42) / 0.22;
      const eyeDistSq = eyeT * eyeT + eyeA * eyeA;
      if (eyeDistSq < 1.0) {
        bellRimFactor = Math.max(bellRimFactor, 1.5 + (1.0 - eyeDistSq) * 0.5);
      }

      const radiusY = cosA >= 0 ? heightDorsal : heightVentral;
      const localX = sinA * width;
      const localY = center.y + cosA * radiusY;
      const localZ = center.z + zOffset;

      const nx = sinA / Math.max(width, 0.05);
      const ny = cosA / Math.max(radiusY, 0.05);
      const nz = 0.15 * (0.5 - t);
      const norm = new THREE.Vector3(nx, ny, nz).normalize();

      positions.push(localX, localY, localZ);
      normals.push(norm.x, norm.y, norm.z);
      spineTs.push(t);
      features.push(0.0, wingFactor, bellRimFactor, v);
    }
  }

  const bodyStride = radialSteps + 1;
  for (let i = 0; i < spineSteps; i++) {
    for (let j = 0; j < radialSteps; j++) {
      const a = i * bodyStride + j;
      const b = (i + 1) * bodyStride + j;
      const c = (i + 1) * bodyStride + (j + 1);
      const d = i * bodyStride + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // ============================================================================
  // PART 2: Sweeping Humpback Pectoral Wing-Flippers with Medusa Frill Edges
  // ============================================================================
  const wingUSteps = 24; // Spanwise from shoulder to wingtip
  const wingVSteps = 14; // Around airfoil cross-section
  const sides = [-1, 1];

  for (const side of sides) {
    const baseOffset = positions.length / 3;

    for (let iu = 0; iu <= wingUSteps; iu++) {
      const u = iu / wingUSteps; // 0 = shoulder root, 1 = wingtip
      // Sweep outward in X, gently arched in Y, swept back in Z
      const spanX = side * (0.88 + u * 3.85);
      const spanY = -0.18 + Math.sin(u * Math.PI * 0.75) * 0.28 - Math.pow(u, 2.0) * 0.45;
      const leadZ = 1.85 - Math.pow(u, 1.25) * 1.95;

      // Chord length tapers toward the wingtip with humpback leading-edge tubercles
      const tubercles = 1.0 + 0.06 * Math.sin(u * Math.PI * 9.0) * Math.sin(u * Math.PI);
      const chord = THREE.MathUtils.lerp(1.55, 0.22, Math.pow(u, 0.85)) * tubercles;
      const thickness = THREE.MathUtils.lerp(0.18, 0.025, u);

      for (let iv = 0; iv <= wingVSteps; iv++) {
        const v = iv / wingVSteps;
        const theta = v * Math.PI * 2.0;
        // chordFrac: 0 at leading edge, 1 at trailing medusa frill edge
        const chordFrac = 0.5 * (1.0 - Math.cos(theta));
        const surfaceSign = Math.sin(theta);

        // Gossamer jellyfish undulation along trailing edge of wing
        const trailingFrill =
          Math.pow(chordFrac, 2.2) * Math.sin(u * 28.0) * 0.08 * Math.sin(u * Math.PI);

        const wx = spanX;
        const wy =
          spanY +
          surfaceSign * thickness * (1.0 - chordFrac * 0.75) +
          trailingFrill;
        const wz = leadZ - chordFrac * chord;

        const wNorm = new THREE.Vector3(
          side * 0.15 * u,
          surfaceSign >= 0 ? 1 : -1,
          0.2 * (0.5 - chordFrac)
        ).normalize();

        positions.push(wx, wy, wz);
        normals.push(wNorm.x, wNorm.y, wNorm.z);
        // Map spineT along the wing so neural waves flow from shoulder to wingtip
        spineTs.push(0.26 + u * 0.45);
        features.push(
          0.0,
          u, // wingFactor (0 at root -> 1 at tip for graceful flapping)
          0.35 + 0.65 * Math.pow(chordFrac, 1.5), // glowing trailing edge & wingtip
          chordFrac
        );
      }
    }

    const wStride = wingVSteps + 1;
    for (let iu = 0; iu < wingUSteps; iu++) {
      for (let iv = 0; iv < wingVSteps; iv++) {
        const a = baseOffset + iu * wStride + iv;
        const b = baseOffset + (iu + 1) * wStride + iv;
        const c = baseOffset + (iu + 1) * wStride + (iv + 1);
        const d = baseOffset + iu * wStride + (iv + 1);

        if (side > 0) {
          indices.push(a, b, d);
          indices.push(b, c, d);
        } else {
          indices.push(a, d, b);
          indices.push(b, d, c);
        }
      }
    }
  }

  // ============================================================================
  // PART 3: Ten Streaming Bioluminescent Jellyfish Tentacles & Oral Filaments
  // ============================================================================
  const tentacleCount = 10;
  const tentacleSteps = 30;
  const tentacleRadial = 6;

  for (let tIdx = 0; tIdx < tentacleCount; tIdx++) {
    const baseOffset = positions.length / 3;
    const ringFrac = tIdx / tentacleCount;
    const ringAngle = ringFrac * Math.PI * 2.0;

    // Anchor tentacles in an elliptical ring underneath the jellyfish bell canopy
    const anchorX = Math.sin(ringAngle) * 1.15;
    const anchorY = -0.25 + Math.cos(ringAngle) * 0.28;
    const anchorZ = 0.55 + Math.cos(ringAngle) * 0.65;
    const tentacleLength = 6.8 + (tIdx % 3) * 1.65;

    for (let i = 0; i <= tentacleSteps; i++) {
      const u = i / tentacleSteps; // 0 = bell root, 1 = trailing tip
      // Stream backward and slightly downward in a graceful catenary curve
      const tx = anchorX * (1.0 + u * 0.25) + Math.sin(u * Math.PI * 2.0 + tIdx) * 0.18;
      const ty = anchorY - Math.pow(u, 1.25) * 1.15 + Math.cos(u * Math.PI * 1.5 + tIdx) * 0.14;
      const tz = anchorZ - u * tentacleLength;

      const rad = THREE.MathUtils.lerp(0.065, 0.008, Math.pow(u, 0.75));

      for (let j = 0; j <= tentacleRadial; j++) {
        const v = j / tentacleRadial;
        const ang = v * Math.PI * 2.0;
        const nx = Math.cos(ang);
        const ny = Math.sin(ang);

        positions.push(tx + nx * rad, ty + ny * rad, tz);
        normals.push(nx, ny, 0);
        // SpineT continues from 0.45 to 1.65 so bioluminescent pulses cascade down the tentacles
        spineTs.push(0.45 + u * 1.2 + (tIdx % 4) * 0.08);
        features.push(
          u, // tentacleFactor (0 -> 1)
          0.0,
          0.65 + 0.35 * u,
          ringFrac
        );
      }
    }

    const tStride = tentacleRadial + 1;
    for (let i = 0; i < tentacleSteps; i++) {
      for (let j = 0; j < tentacleRadial; j++) {
        const a = baseOffset + i * tStride + j;
        const b = baseOffset + (i + 1) * tStride + j;
        const c = baseOffset + (i + 1) * tStride + (j + 1);
        const d = baseOffset + i * tStride + (j + 1);

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
  geometry.setAttribute('aFeature', new THREE.Float32BufferAttribute(features, 4));

  return geometry;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Manages a pod of 4 flying Jellyfish-Whale Leviathans gliding through the night sky
 * above the lunar sea and reflecting onto the ocean surface below.
 */
export class SkyWhalePod {
  public readonly group: THREE.Group;
  public readonly instances: SkyWhaleInstance[] = [];

  private geometry: THREE.BufferGeometry;
  private baseMaterial: THREE.ShaderMaterial;

  constructor(vertexShader: string, fragmentShader: string) {
    this.group = new THREE.Group();
    this.geometry = createSkyWhaleJellyGeometry();

    // Additive/translucent bioluminescent rendering so the jellyfish bell & tentacles glow ethereally
    this.baseMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    // Curated sky trajectories at varying altitudes and distances in front of the camera
    const presets = [
      {
        // Majestic foreground-left glider cruising across the lunar sky
        centerX: -12,
        centerY: 20,
        centerZ: -88,
        orbitRadiusX: 46,
        orbitRadiusZ: 18,
        verticalAmp: 3.2,
        flightSpeed: 0.11,
        phaseAngle: 0.35,
        direction: 1,
        scale: 2.15,
        colorVariant: 0.15,
      },
      {
        // High-altitude leviathan soaring near the glowing moon corona
        centerX: 16,
        centerY: 36,
        centerZ: -135,
        orbitRadiusX: 62,
        orbitRadiusZ: 24,
        verticalAmp: 4.5,
        flightSpeed: 0.085,
        phaseAngle: 2.2,
        direction: -1,
        scale: 2.75,
        colorVariant: 0.65,
      },
      {
        // Mid-altitude graceful swimmer on the right horizon
        centerX: 28,
        centerY: 15.5,
        centerZ: -74,
        orbitRadiusX: 38,
        orbitRadiusZ: 16,
        verticalAmp: 2.6,
        flightSpeed: 0.125,
        phaseAngle: 4.1,
        direction: -1,
        scale: 1.75,
        colorVariant: 0.42,
      },
      {
        // Distant deep-sky companion
        centerX: -34,
        centerY: 29,
        centerZ: -165,
        orbitRadiusX: 55,
        orbitRadiusZ: 22,
        verticalAmp: 3.8,
        flightSpeed: 0.075,
        phaseAngle: 5.2,
        direction: 1,
        scale: 2.4,
        colorVariant: 0.88,
      },
    ];

    for (let i = 0; i < presets.length; i++) {
      const p = presets[i];
      const mat = this.baseMaterial.clone();
      mat.uniforms = {
        uTime: { value: 0 },
        uCreatureSeed: { value: i * 23.4 + 7.1 },
        uColorVariant: { value: p.colorVariant },
        uCyberIntensity: { value: 0.6 },
        uMoonGlow: { value: 1.2 },
        uOpacityScale: { value: 1.0 },
        uCameraPos: { value: new THREE.Vector3() },
        uMoonCore: { value: new THREE.Color('#f0f9ff') },
        uMoonHalo: { value: new THREE.Color('#38bdf8') },
        uCyberAccent: { value: new THREE.Color('#06b6d4') },
        uSkyHorizon: { value: new THREE.Color('#171332') },
      };

      const mesh = new THREE.Mesh(this.geometry, mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);

      this.instances.push({
        id: i,
        mesh,
        material: mat,
        centerX: p.centerX,
        centerY: p.centerY,
        centerZ: p.centerZ,
        orbitRadiusX: p.orbitRadiusX,
        orbitRadiusZ: p.orbitRadiusZ,
        verticalAmp: p.verticalAmp,
        flightSpeed: p.flightSpeed,
        phaseAngle: p.phaseAngle,
        direction: p.direction,
        scale: p.scale,
        colorVariant: p.colorVariant,
        seed: i * 23.4 + 7.1,
      });
    }
  }

  /**
   * Brings a Sky Whale-Jelly into a prominent foreground glide across the sky.
   */
  public summonSkyWhale(): void {
    const inst = this.instances[0];
    inst.phaseAngle = 1.35; // Positioned right in the central viewing corridor
  }

  public update(params: {
    dt: number;
    elapsedTime: number;
    creatureActivity: number;
    cyberIntensity: number;
    moonGlow: number;
    cameraPos: THREE.Vector3;
    moonCore: THREE.Color;
    moonHalo: THREE.Color;
    cyberAccent: THREE.Color;
    skyHorizon: THREE.Color;
  }): void {
    const {
      dt,
      elapsedTime,
      creatureActivity,
      cyberIntensity,
      moonGlow,
      cameraPos,
      moonCore,
      moonHalo,
      cyberAccent,
      skyHorizon,
    } = params;

    if (creatureActivity <= 0.01) {
      for (const inst of this.instances) {
        inst.mesh.visible = false;
      }
      return;
    }

    // Determine how many sky whales are visible based on creatureActivity slider
    const activeCount =
      creatureActivity > 1.4
        ? 4
        : creatureActivity > 0.85
        ? 3
        : creatureActivity > 0.35
        ? 2
        : 1;

    for (let i = 0; i < this.instances.length; i++) {
      const inst = this.instances[i];
      if (i >= activeCount) {
        inst.mesh.visible = false;
        continue;
      }
      inst.mesh.visible = true;

      // Advance figure-8 / elliptical aerial flight path
      inst.phaseAngle += dt * inst.flightSpeed * inst.direction;
      const a = inst.phaseAngle;

      const x = inst.centerX + Math.cos(a) * inst.orbitRadiusX;
      const z = inst.centerZ + Math.sin(a * 2.0) * inst.orbitRadiusZ;
      const y =
        inst.centerY +
        Math.sin(elapsedTime * 0.55 + inst.seed) * inst.verticalAmp;

      // Analytic velocity tangent for smooth 3D banking, pitch, and yaw orientation
      const vx = -Math.sin(a) * inst.orbitRadiusX * inst.flightSpeed * inst.direction;
      const vz =
        Math.cos(a * 2.0) *
        2.0 *
        inst.orbitRadiusZ *
        inst.flightSpeed *
        inst.direction;
      const vy =
        Math.cos(elapsedTime * 0.55 + inst.seed) *
        0.55 *
        inst.verticalAmp *
        0.35;

      inst.mesh.position.set(x, y, z);
      inst.mesh.scale.setScalar(inst.scale);

      // Orient whale along its velocity vector (+Z local faces forward)
      const targetPos = new THREE.Vector3(x + vx * 10.0, y + vy * 10.0, z + vz * 10.0);
      inst.mesh.lookAt(targetPos);

      // Subtle banking roll into turns
      const turnBank = Math.sin(a * 2.0) * 0.18 * inst.direction;
      inst.mesh.rotateZ(turnBank);

      const u = inst.material.uniforms;
      u.uTime.value = elapsedTime;
      u.uCyberIntensity.value = cyberIntensity;
      u.uMoonGlow.value = moonGlow;
      u.uOpacityScale.value = Math.min(1.25, 0.55 + 0.45 * creatureActivity);
      u.uCameraPos.value.copy(cameraPos);
      u.uMoonCore.value.copy(moonCore);
      u.uMoonHalo.value.copy(moonHalo);
      u.uCyberAccent.value.copy(cyberAccent);
      u.uSkyHorizon.value.copy(skyHorizon);
    }
  }

  public dispose(): void {
    this.geometry.dispose();
    this.baseMaterial.dispose();
    this.instances.forEach((inst) => inst.material.dispose());
  }
}
