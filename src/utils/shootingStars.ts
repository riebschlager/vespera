import * as THREE from 'three';

const MAX_SHOOTING_STARS = 20;
const TRAIL_SEGMENTS = 64;
// Seconds for a trail's glow to fall to 1/e after the head passes
const TRAIL_FADE_TIME = 3.2;
// A slot is free again once its trail has faded to nothing
const TRAIL_LINGER = TRAIL_FADE_TIME * 3.5;
const SKY_RADIUS_MIN = 640;
const SKY_RADIUS_MAX = 900;

interface ShootingStarSlot {
  spawnTime: number;
  flight: number;
}

/**
 * Neon shooting stars streaking across the night sky. Each meteor is a camera-facing ribbon whose
 * shape is evaluated on the GPU from its launch parameters, so the CPU only writes attributes when
 * a meteor spawns. Trails linger after the head burns out, billowing and cooling from white-hot
 * through neon cyan / magenta into violet haze.
 */
export class ShootingStarShower {
  public readonly group = new THREE.Group();

  private readonly trailGeometry: THREE.BufferGeometry;
  private readonly headGeometry: THREE.BufferGeometry;
  private readonly trailMaterial: THREE.ShaderMaterial;
  private readonly headMaterial: THREE.ShaderMaterial;
  private readonly slots: ShootingStarSlot[] = [];
  private nextSpawnIn = 1.5;
  private readonly uniforms = {
    uTime: { value: 0 },
    uGravity: { value: new THREE.Vector3(0, -22, 0) },
    uWind: { value: new THREE.Vector3(4.5, 1.2, -1.5) },
    uFadeTime: { value: TRAIL_FADE_TIME },
    uPixelRatio: { value: 1 },
    uMoonCore: { value: new THREE.Color() },
    uCyberAccent: { value: new THREE.Color() },
    uNeonPink: { value: new THREE.Color('#ff3fd2') },
    uNeonViolet: { value: new THREE.Color('#6d28d9') },
    uCyberIntensity: { value: 0 },
    uFogAmount: { value: 0 },
  };
  private readonly launchDir = new THREE.Vector3();
  private readonly east = new THREE.Vector3();
  private readonly north = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();

  constructor(
    shaders: {
      trailVertex: string;
      trailFragment: string;
      headVertex: string;
      headFragment: string;
    },
    pixelRatio: number
  ) {
    this.uniforms.uPixelRatio.value = pixelRatio;

    for (let i = 0; i < MAX_SHOOTING_STARS; i++) {
      this.slots.push({ spawnTime: -1e4, flight: 0 });
    }

    // Trail ribbons: one strip of (TRAIL_SEGMENTS + 1) vertex pairs per meteor
    const vertsPerTrail = (TRAIL_SEGMENTS + 1) * 2;
    const trailVerts = MAX_SHOOTING_STARS * vertsPerTrail;
    const trail = new Float32Array(trailVerts * 2);
    const indices: number[] = [];
    for (let m = 0; m < MAX_SHOOTING_STARS; m++) {
      const base = m * vertsPerTrail;
      for (let s = 0; s <= TRAIL_SEGMENTS; s++) {
        const v = base + s * 2;
        trail[v * 2] = s / TRAIL_SEGMENTS;
        trail[v * 2 + 1] = -1;
        trail[(v + 1) * 2] = s / TRAIL_SEGMENTS;
        trail[(v + 1) * 2 + 1] = 1;
        if (s < TRAIL_SEGMENTS) {
          indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        }
      }
    }
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setIndex(indices);
    this.trailGeometry.setAttribute('aTrail', new THREE.BufferAttribute(trail, 2));
    this.addLaunchAttributes(this.trailGeometry, trailVerts);

    this.headGeometry = new THREE.BufferGeometry();
    this.addLaunchAttributes(this.headGeometry, MAX_SHOOTING_STARS);

    this.trailMaterial = new THREE.ShaderMaterial({
      vertexShader: shaders.trailVertex,
      fragmentShader: shaders.trailFragment,
      uniforms: this.uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.headMaterial = new THREE.ShaderMaterial({
      vertexShader: shaders.headVertex,
      fragmentShader: shaders.headFragment,
      uniforms: this.uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Positions are computed in the vertex shader, so the CPU bounds mean nothing
    const trails = new THREE.Mesh(this.trailGeometry, this.trailMaterial);
    trails.frustumCulled = false;
    const heads = new THREE.Points(this.headGeometry, this.headMaterial);
    heads.frustumCulled = false;
    this.group.add(trails, heads);
  }

  private addLaunchAttributes(geometry: THREE.BufferGeometry, count: number): void {
    // `position` holds each meteor's launch point
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const params = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) params[i * 4] = -1e4;
    geometry.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
  }

  public setPixelRatio(pixelRatio: number): void {
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  public update(params: {
    dt: number;
    elapsedTime: number;
    ratePerMinute: number;
    viewDirection: THREE.Vector3;
    cyberIntensity: number;
    fogAmount: number;
    moonCore: THREE.Color;
    cyberAccent: THREE.Color;
  }): void {
    const { dt, elapsedTime, ratePerMinute, viewDirection } = params;

    this.uniforms.uTime.value = elapsedTime;
    this.uniforms.uCyberIntensity.value = params.cyberIntensity;
    this.uniforms.uFogAmount.value = params.fogAmount;
    this.uniforms.uMoonCore.value.copy(params.moonCore);
    this.uniforms.uCyberAccent.value.copy(params.cyberAccent);

    if (ratePerMinute <= 0 || dt <= 0) return;

    // Poisson arrivals; never wait much longer than the mean after the rate is raised
    const meanInterval = 60 / ratePerMinute;
    this.nextSpawnIn = Math.min(this.nextSpawnIn, meanInterval * 2.5) - dt;
    if (this.nextSpawnIn > 0) return;
    this.nextSpawnIn = -Math.log(1 - Math.random()) * meanInterval;

    // Launch somewhere in the part of the sky the camera is facing
    const viewAzimuth = Math.atan2(viewDirection.x, -viewDirection.z);
    const azimuth = viewAzimuth + (Math.random() - 0.5) * 1.4;
    const elevation = 0.14 + Math.random() * 0.4;
    this.launchDir.set(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      -Math.cos(azimuth) * Math.cos(elevation)
    );
    this.east.set(0, 1, 0).cross(this.launchDir).normalize();
    this.north.copy(this.launchDir).cross(this.east).normalize();

    // Streak across the sky, always angled downward toward the horizon
    const heading = -(0.15 + Math.random() * 0.7) * Math.PI;
    const speed = 260 + Math.random() * 180;
    this.velocity
      .copy(this.east)
      .multiplyScalar(Math.cos(heading))
      .addScaledVector(this.north, Math.sin(heading))
      .multiplyScalar(speed);

    const radius = SKY_RADIUS_MIN + Math.random() * (SKY_RADIUS_MAX - SKY_RADIUS_MIN);
    const launch = this.launchDir.multiplyScalar(radius);
    let flight = 0.55 + Math.random() * 0.6;
    // Burn out before dipping below the horizon
    const descent = -this.velocity.y;
    if (descent > 0) {
      flight = Math.min(flight, Math.max(0.25, (launch.y - radius * 0.06) / descent));
    }

    const hue = Math.random() < 0.5 ? Math.random() * 0.25 : 0.75 + Math.random() * 0.25;
    const width = 3.6 + Math.random() * 2.2;

    // Now and then a small cluster flies in formation
    const siblings = Math.random() < 0.18 ? 1 + Math.floor(Math.random() * 2) : 0;
    for (let i = 0; i <= siblings; i++) {
      this.offset.set(0, 0, 0);
      let delay = 0;
      if (i > 0) {
        this.offset
          .copy(this.north)
          .multiplyScalar((Math.random() - 0.5) * 70)
          .addScaledVector(this.east, (Math.random() - 0.5) * 70);
        delay = 0.06 + Math.random() * 0.3;
      }
      this.spawn(
        elapsedTime + delay,
        launch,
        this.offset,
        this.velocity,
        flight * (i > 0 ? 0.7 + Math.random() * 0.3 : 1),
        width * (i > 0 ? 0.75 : 1),
        hue
      );
    }
  }

  private spawn(
    spawnTime: number,
    launch: THREE.Vector3,
    offset: THREE.Vector3,
    velocity: THREE.Vector3,
    flight: number,
    width: number,
    hue: number
  ): void {
    const index = this.slots.findIndex(
      (slot) => spawnTime > slot.spawnTime + slot.flight + TRAIL_LINGER
    );
    if (index < 0) return;
    this.slots[index].spawnTime = spawnTime;
    this.slots[index].flight = flight;

    const write = (geometry: THREE.BufferGeometry, start: number, count: number) => {
      const position = geometry.getAttribute('position') as THREE.BufferAttribute;
      const vel = geometry.getAttribute('aVelocity') as THREE.BufferAttribute;
      const prm = geometry.getAttribute('aParams') as THREE.BufferAttribute;
      for (let i = start; i < start + count; i++) {
        position.setXYZ(i, launch.x + offset.x, launch.y + offset.y, launch.z + offset.z);
        vel.setXYZ(i, velocity.x, velocity.y, velocity.z);
        prm.setXYZW(i, spawnTime, flight, width, hue);
      }
      position.needsUpdate = true;
      vel.needsUpdate = true;
      prm.needsUpdate = true;
    };

    const vertsPerTrail = (TRAIL_SEGMENTS + 1) * 2;
    write(this.trailGeometry, index * vertsPerTrail, vertsPerTrail);
    write(this.headGeometry, index, 1);
  }

  public dispose(): void {
    this.trailGeometry.dispose();
    this.headGeometry.dispose();
    this.trailMaterial.dispose();
    this.headMaterial.dispose();
  }
}
