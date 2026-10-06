import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  skyVertexShader,
  skyFragmentShader,
  moonVertexShader,
  moonFragmentShader,
  coronaVertexShader,
  coronaFragmentShader,
  oceanVertexShader,
  oceanFragmentShader,
  starfieldVertexShader,
  starfieldFragmentShader,
  constellationVertexShader,
  constellationFragmentShader,
  skyWhaleVertexShader,
  skyWhaleFragmentShader,
  drizzleVertexShader,
  drizzleFragmentShader,
  mistVertexShader,
  mistFragmentShader,
} from '../shaders/cyberSeaShaders';
import {
  oceanUndersideFragmentShader,
  underwaterBackdropVertexShader,
  underwaterBackdropFragmentShader,
  marineSnowVertexShader,
  marineSnowFragmentShader,
  compositeVertexShader,
  compositeFragmentShader,
} from '../shaders/underwaterShaders';
import {
  fishVertexShader,
  fishFragmentShader,
  dropletVertexShader,
  dropletFragmentShader,
  microRingVertexShader,
  microRingFragmentShader,
  bubbleVertexShader,
  bubbleFragmentShader,
} from '../shaders/fishShaders';
import { SceneConfig } from '../types/scene';
// The peering sea-dragon pod (../utils/bioluminescentCreatures) is disabled for now in favour of the fish
import { BioluminescentFishSchool } from '../utils/bioluminescentFish';
import { SkyWhalePod } from '../utils/skyWhaleCreatures';
import { generateProceduralStarfield } from '../utils/starfieldGenerator';
import { CyberWeatherSystem } from '../utils/weatherSystem';
import { swellHeightAt } from '../utils/oceanSwell';

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// How far in front of the camera the composite tests for the waterline (must match compositeFragmentShader)
const LENS_REACH = 0.6;

interface CyberLunarSeaCanvasProps {
  config: SceneConfig;
  isPaused: boolean;
  summonSignal?: number;
  onCameraUpdate?: (altitude: number, submerged: boolean) => void;
  onFpsUpdate?: (fps: number) => void;
}

export const CyberLunarSeaCanvas: React.FC<CyberLunarSeaCanvasProps> = ({
  config,
  isPaused,
  summonSignal = 0,
  onFpsUpdate,
  onCameraUpdate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState<boolean>(false);

  // Keep latest config & pause state accessible inside requestAnimationFrame without recreating the scene
  const configRef = useRef<SceneConfig>(config);
  const cameraUpdateRef = useRef(onCameraUpdate);
  cameraUpdateRef.current = onCameraUpdate;
  const pausedRef = useRef<boolean>(isPaused);
  const fishSchoolRef = useRef<BioluminescentFishSchool | null>(null);
  const skyWhalePodRef = useRef<SkyWhalePod | null>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (summonSignal > 0) {
      fishSchoolRef.current?.summonJump();
      skyWhalePodRef.current?.summonSkyWhale();
    }
  }, [summonSignal]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch {
      setWebglError(true);
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    renderer.setSize(width, height);
    renderer.setPixelRatio(pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const canvas = renderer.domElement;
    canvas.className = 'w-full h-full block cursor-grab active:cursor-grabbing';
    container.innerHTML = '';
    container.appendChild(canvas);

    // WebGL context loss & restoration handlers
    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    const handleContextRestored = () => {
      setWebglError(false);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    // Main Scene & Cameras
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, width / height, 0.2, 2000);
    const reflectionCamera = new THREE.PerspectiveCamera(52, width / height, 0.2, 2000);

    // Planar Reflection RenderTarget (half-res or 0.75x res for silky bloom & high FPS)
    const reflScale = 0.75;
    const reflectionRenderTarget = new THREE.WebGLRenderTarget(
      Math.max(256, Math.floor(width * pixelRatio * reflScale)),
      Math.max(256, Math.floor(height * pixelRatio * reflScale)),
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
      }
    );

    const initialCfg = configRef.current;
    const moonDistance = 480;

    // Helper to compute 3D moon position from elevation angle
    const getMoonPosition = (elevation: number) => {
      const y = Math.sin(elevation) * moonDistance;
      const z = -Math.cos(elevation) * moonDistance;
      return new THREE.Vector3(0, y, z);
    };

    const initialMoonPos = getMoonPosition(initialCfg.moonElevation);

    // 1. Sky Dome
    const skyGeo = new THREE.SphereGeometry(1200, 48, 32);
    const skyUniforms = {
      uTime: { value: 0 },
      uSkyZenith: { value: new THREE.Color(initialCfg.palette.skyZenith) },
      uSkyHorizon: { value: new THREE.Color(initialCfg.palette.skyHorizon) },
      uMoonCore: { value: new THREE.Color(initialCfg.palette.moonCore) },
      uMoonHalo: { value: new THREE.Color(initialCfg.palette.moonHalo) },
      uCyberAccent: { value: new THREE.Color(initialCfg.palette.cyberAccent) },
      uMoonDirection: { value: initialMoonPos.clone().normalize() },
      uMoonGlow: { value: initialCfg.moonGlow },
      uMoonPhase: { value: initialCfg.moonPhase },
      uStarfieldDensity: { value: initialCfg.starfieldDensity },
      uFogAmount: { value: 0.25 },
      uCyberIntensity: { value: initialCfg.cyberDreamIntensity },
    };
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyMesh);

    // 1b. Procedural 3D Multi-Shell Starfield & Cyber-Constellation Filaments
    const starfieldGroup = new THREE.Group();
    scene.add(starfieldGroup);

    const { starsGeometry, constellationGeometry } = generateProceduralStarfield({
      starCount: 2400,
      minRadius: 560,
      maxRadius: 1080,
    });

    const starfieldUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uStarfieldDensity: { value: initialCfg.starfieldDensity },
      uCyberIntensity: { value: initialCfg.cyberDreamIntensity },
      uMoonPhase: { value: initialCfg.moonPhase },
      uMoonDirection: { value: initialMoonPos.clone().normalize() },
      uMoonCore: { value: new THREE.Color(initialCfg.palette.moonCore) },
      uMoonHalo: { value: new THREE.Color(initialCfg.palette.moonHalo) },
      uCyberAccent: { value: new THREE.Color(initialCfg.palette.cyberAccent) },
    };

    const starfieldMat = new THREE.ShaderMaterial({
      vertexShader: starfieldVertexShader,
      fragmentShader: starfieldFragmentShader,
      uniforms: starfieldUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const starfieldPoints = new THREE.Points(starsGeometry, starfieldMat);
    starfieldGroup.add(starfieldPoints);

    const constellationUniforms = {
      uTime: { value: 0 },
      uStarfieldDensity: { value: initialCfg.starfieldDensity },
      uCyberIntensity: { value: initialCfg.cyberDreamIntensity },
      uMoonPhase: { value: initialCfg.moonPhase },
      uMoonDirection: { value: initialMoonPos.clone().normalize() },
      uMoonHalo: { value: new THREE.Color(initialCfg.palette.moonHalo) },
      uCyberAccent: { value: new THREE.Color(initialCfg.palette.cyberAccent) },
    };

    const constellationMat = new THREE.ShaderMaterial({
      vertexShader: constellationVertexShader,
      fragmentShader: constellationFragmentShader,
      uniforms: constellationUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const constellationLines = new THREE.LineSegments(
      constellationGeometry,
      constellationMat
    );
    starfieldGroup.add(constellationLines);

    // 2. Glowing Moon Group (Sphere + Volumetric Corona Billboard + Subtle Cyber Orbital Ring)
    const moonGroup = new THREE.Group();
    moonGroup.position.copy(initialMoonPos);
    scene.add(moonGroup);

    const moonBaseRadius = 29;
    const moonGeo = new THREE.SphereGeometry(moonBaseRadius, 64, 64);
    const moonUniforms = {
      uTime: { value: 0 },
      uMoonCore: { value: new THREE.Color(initialCfg.palette.moonCore) },
      uMoonHalo: { value: new THREE.Color(initialCfg.palette.moonHalo) },
      uCyberAccent: { value: new THREE.Color(initialCfg.palette.cyberAccent) },
      uMoonGlow: { value: initialCfg.moonGlow },
      uMoonPhase: { value: initialCfg.moonPhase },
      uCyberIntensity: { value: initialCfg.cyberDreamIntensity },
    };
    const moonMat = new THREE.ShaderMaterial({
      vertexShader: moonVertexShader,
      fragmentShader: moonFragmentShader,
      uniforms: moonUniforms,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonGroup.add(moonMesh);

    // Volumetric Corona Halo Plane around the Moon
    const coronaGeo = new THREE.PlaneGeometry(moonBaseRadius * 8.5, moonBaseRadius * 8.5);
    const coronaUniforms = {
      uTime: { value: 0 },
      uMoonCore: { value: new THREE.Color(initialCfg.palette.moonCore) },
      uMoonHalo: { value: new THREE.Color(initialCfg.palette.moonHalo) },
      uCyberAccent: { value: new THREE.Color(initialCfg.palette.cyberAccent) },
      uMoonGlow: { value: initialCfg.moonGlow },
      uMoonPhase: { value: initialCfg.moonPhase },
      uCyberIntensity: { value: initialCfg.cyberDreamIntensity },
    };
    const coronaMat = new THREE.ShaderMaterial({
      vertexShader: coronaVertexShader,
      fragmentShader: coronaFragmentShader,
      uniforms: coronaUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
    coronaMesh.position.set(0, 0, -2);
    moonGroup.add(coronaMesh);

    // Delicate Cyber-Dream Orbital Ring tilted around the Moon
    const ringGeo = new THREE.RingGeometry(moonBaseRadius * 1.42, moonBaseRadius * 1.47, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(initialCfg.palette.cyberAccent),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28 * initialCfg.cyberDreamIntensity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orbitalRing = new THREE.Mesh(ringGeo, ringMat);
    orbitalRing.rotation.x = Math.PI * 0.41;
    orbitalRing.rotation.y = Math.PI * 0.12;
    moonGroup.add(orbitalRing);

    // 2b. Bioluminescent fish schooling beneath the surface, with the odd one leaping clear of the sea
    const fishSchool = new BioluminescentFishSchool(fishVertexShader, fishFragmentShader, {
      dropletVertex: dropletVertexShader,
      dropletFragment: dropletFragmentShader,
      microRingVertex: microRingVertexShader,
      microRingFragment: microRingFragmentShader,
      bubbleVertex: bubbleVertexShader,
      bubbleFragment: bubbleFragmentShader,
    });
    fishSchoolRef.current = fishSchool;
    scene.add(fishSchool.group);
    scene.add(fishSchool.splash.droplets, fishSchool.splash.microRings);

    // 2c. Flying Jellyfish-Whale Leviathans Pod gliding in the night sky
    const skyWhalePod = new SkyWhalePod(
      skyWhaleVertexShader,
      skyWhaleFragmentShader
    );
    skyWhalePodRef.current = skyWhalePod;
    scene.add(skyWhalePod.group);

    // 2d. Procedural Weather System (Intermittent Fog Banks, Digital Drizzle & Ethereal DoF)
    const weatherSystem = new CyberWeatherSystem(
      drizzleVertexShader,
      drizzleFragmentShader,
      mistVertexShader,
      mistFragmentShader
    );
    scene.add(weatherSystem.group);

    // 3. Smooth Sea Mesh with custom reflection & distortion shader
    const oceanGeo = new THREE.PlaneGeometry(1100, 1100, 260, 260);
    oceanGeo.rotateX(-Math.PI / 2);

    const oceanUniforms = {
      uReflectionMap: { value: reflectionRenderTarget.texture },
      uTime: { value: 0 },
      uWaveSpeed: { value: initialCfg.waveSpeed },
      uWaveDistortion: { value: initialCfg.waveDistortion },
      uDriftOffset: { value: 0 },
      uMoonGlow: { value: initialCfg.moonGlow },
      uMoonScale: { value: initialCfg.moonScale },
      uMoonPhase: { value: initialCfg.moonPhase },
      uFogAmount: { value: 0.25 },
      uDrizzleAmount: { value: 0.25 },
      uDofStrength: { value: 0.35 },
      uFocalDistance: { value: 34.0 },
      uCyberIntensity: { value: initialCfg.cyberDreamIntensity },
      uCameraPos: { value: new THREE.Vector3() },
      uMoonDirection: { value: initialMoonPos.clone().normalize() },
      uSkyZenith: { value: new THREE.Color(initialCfg.palette.skyZenith) },
      uSkyHorizon: { value: new THREE.Color(initialCfg.palette.skyHorizon) },
      uMoonCore: { value: new THREE.Color(initialCfg.palette.moonCore) },
      uMoonHalo: { value: new THREE.Color(initialCfg.palette.moonHalo) },
      uWaterDeep: { value: new THREE.Color(initialCfg.palette.waterDeep) },
      uWaterShallow: { value: new THREE.Color(initialCfg.palette.waterShallow) },
      uCyberAccent: { value: new THREE.Color(initialCfg.palette.cyberAccent) },
      uCreatureRipples: { value: fishSchool.rippleUniformArray },
    };

    const oceanMat = new THREE.ShaderMaterial({
      vertexShader: oceanVertexShader,
      fragmentShader: oceanFragmentShader,
      uniforms: oceanUniforms,
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.set(0, 0, -240);
    scene.add(oceanMesh);

    // 4. Subtle Drifting Bioluminescent Cyber-Motes hovering over the water
    const particleCount = 160;
    const particlePositions = new Float32Array(particleCount * 3);
    const particlePhases = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 140;
      particlePositions[i * 3 + 1] = 0.4 + Math.random() * 14.0;
      particlePositions[i * 3 + 2] = -Math.random() * 180;
      particlePhases[i] = Math.random() * Math.PI * 2;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(particlePhases, 1));

    const particleUniforms = {
      uTime: { value: 0 },
      uDriftOffset: { value: 0 },
      uColor1: { value: new THREE.Color(initialCfg.palette.moonHalo) },
      uColor2: { value: new THREE.Color(initialCfg.palette.cyberAccent) },
      uCyberIntensity: { value: initialCfg.cyberDreamIntensity },
    };

    const particleMat = new THREE.ShaderMaterial({
      uniforms: particleUniforms,
      vertexShader: /* glsl */ `
        attribute float aPhase;
        uniform float uTime;
        uniform float uDriftOffset;
        varying float vAlpha;
        varying float vMix;

        void main() {
          vec3 pos = position;
          // Wrap Z position continuously so motes glide past the floating camera
          float wrappedZ = -mod(-(pos.z + uDriftOffset * 1.4), 180.0);
          pos.z = wrappedZ;
          pos.x += sin(uTime * 0.4 + aPhase) * 1.2;
          pos.y += cos(uTime * 0.65 + aPhase * 1.7) * 0.35;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          float dist = -mvPosition.z;
          gl_PointSize = clamp((24.0 / max(dist, 1.0)) * (0.7 + 0.5 * sin(aPhase)), 1.5, 5.5);

          // Fade in from far and fade out smoothly near camera
          float distFade = smoothstep(175.0, 95.0, dist) * smoothstep(2.0, 14.0, dist);
          float pulse = 0.45 + 0.55 * sin(uTime * 1.3 + aPhase * 3.0);
          vAlpha = distFade * pulse;
          vMix = fract(aPhase);

          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uCyberIntensity;
        varying float vAlpha;
        varying float vMix;

        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float softCircle = exp(-d * d * 16.0);
          vec3 col = mix(uColor1, uColor2, vMix);
          gl_FragColor = vec4(col * 1.4, softCircle * vAlpha * (0.35 + 0.65 * uCyberIntensity));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    // Everything that only exists in the sky / above the surface, hidden while rendering the underwater view
    const aboveWaterOnly: THREE.Object3D[] = [
      skyMesh,
      starfieldGroup,
      moonGroup,
      skyWhalePod.group,
      weatherSystem.group,
      particleSystem,
      fishSchool.splash.droplets,
      fishSchool.splash.microRings,
    ];

    // 5. Underwater World: water-column backdrop, the surface seen from beneath, and drifting marine snow
    const underwaterGroup = new THREE.Group();
    underwaterGroup.visible = false;
    scene.add(underwaterGroup);

    // The sky hemisphere captured from just above the surface, refracted through Snell's window from below
    const skyCubeTarget = new THREE.WebGLCubeRenderTarget(512, {
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const skyCubeCamera = new THREE.CubeCamera(0.2, 2000, skyCubeTarget);

    // Water-column uniforms shared by every underwater shader (colours are shared with the ocean)
    const waterVolumeUniforms = {
      uWaterDeep: oceanUniforms.uWaterDeep,
      uWaterShallow: oceanUniforms.uWaterShallow,
      uMoonHalo: oceanUniforms.uMoonHalo,
      uMoonCore: oceanUniforms.uMoonCore,
      uCyberAccent: oceanUniforms.uCyberAccent,
      uMoonDirWater: { value: new THREE.Vector3(0, 1, 0) },
      uMoonLight: { value: 1 },
      uDepth: { value: 0 },
    };
    fishSchool.shareWaterVolumeUniforms(waterVolumeUniforms);

    const backdropGeo = new THREE.SphereGeometry(600, 48, 32);
    const backdropMat = new THREE.ShaderMaterial({
      vertexShader: underwaterBackdropVertexShader,
      fragmentShader: underwaterBackdropFragmentShader,
      uniforms: { ...waterVolumeUniforms, uCameraPos: oceanUniforms.uCameraPos },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const backdropMesh = new THREE.Mesh(backdropGeo, backdropMat);
    backdropMesh.renderOrder = -1;
    backdropMesh.frustumCulled = false;
    underwaterGroup.add(backdropMesh);

    const undersideMat = new THREE.ShaderMaterial({
      vertexShader: oceanVertexShader,
      fragmentShader: oceanUndersideFragmentShader,
      uniforms: {
        ...waterVolumeUniforms,
        uSkyCube: { value: skyCubeTarget.texture },
        uTime: oceanUniforms.uTime,
        uWaveSpeed: oceanUniforms.uWaveSpeed,
        uWaveDistortion: oceanUniforms.uWaveDistortion,
        uDriftOffset: oceanUniforms.uDriftOffset,
        uDrizzleAmount: oceanUniforms.uDrizzleAmount,
        uCyberIntensity: oceanUniforms.uCyberIntensity,
        uCameraPos: oceanUniforms.uCameraPos,
        uSkyHorizon: oceanUniforms.uSkyHorizon,
        uCreatureRipples: oceanUniforms.uCreatureRipples,
      },
      side: THREE.BackSide,
    });
    const undersideMesh = new THREE.Mesh(oceanGeo, undersideMat);
    undersideMesh.position.copy(oceanMesh.position);
    underwaterGroup.add(undersideMesh);

    const snowCount = 900;
    const snowPositions = new Float32Array(snowCount * 3);
    const snowSeeds = new Float32Array(snowCount);
    const snowKinds = new Float32Array(snowCount);
    for (let i = 0; i < snowCount; i++) {
      snowPositions[i * 3] = Math.random();
      snowPositions[i * 3 + 1] = Math.random();
      snowPositions[i * 3 + 2] = Math.random();
      snowSeeds[i] = Math.random();
      const r = Math.random();
      snowKinds[i] = r < 0.07 ? 2 : r < 0.2 ? 1 : 0;
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    snowGeo.setAttribute('aSeed', new THREE.BufferAttribute(snowSeeds, 1));
    snowGeo.setAttribute('aKind', new THREE.BufferAttribute(snowKinds, 1));
    const snowUniforms = {
      uTime: oceanUniforms.uTime,
      uDriftOffset: oceanUniforms.uDriftOffset,
      uPixelRatio: starfieldUniforms.uPixelRatio,
      uCameraPos: oceanUniforms.uCameraPos,
      uCyberIntensity: oceanUniforms.uCyberIntensity,
      uMoonHalo: oceanUniforms.uMoonHalo,
      uMoonCore: oceanUniforms.uMoonCore,
      uCyberAccent: oceanUniforms.uCyberAccent,
      uBox: { value: new THREE.Vector3(48, 22, 56) },
    };
    const snowMat = new THREE.ShaderMaterial({
      vertexShader: marineSnowVertexShader,
      fragmentShader: marineSnowFragmentShader,
      uniforms: snowUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const marineSnow = new THREE.Points(snowGeo, snowMat);
    marineSnow.frustumCulled = false;
    underwaterGroup.add(marineSnow);
    underwaterGroup.add(fishSchool.splash.bubbles);

    // Full-resolution targets for the above/below views, blended across the waterline by a composite pass
    const createViewTarget = () =>
      new THREE.WebGLRenderTarget(
        Math.floor(width * pixelRatio),
        Math.floor(height * pixelRatio),
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          depthBuffer: true,
          samples: 4,
        }
      );
    const aboveTarget = createViewTarget();
    const belowTarget = createViewTarget();

    const compositeUniforms = {
      ...waterVolumeUniforms,
      tAbove: { value: aboveTarget.texture },
      tBelow: { value: belowTarget.texture },
      uHasAbove: { value: 1 },
      uHasBelow: { value: 0 },
      uInvProjection: { value: camera.projectionMatrixInverse },
      uCameraWorld: { value: camera.matrixWorld },
      uCameraPos: oceanUniforms.uCameraPos,
      uResolution: { value: new THREE.Vector2(width, height) },
      uTime: oceanUniforms.uTime,
      uWaveTime: { value: 0 },
      uWaveDistortion: oceanUniforms.uWaveDistortion,
      uDriftOffset: oceanUniforms.uDriftOffset,
      uDivePulse: { value: 0 },
      uSurfacePulse: { value: 0 },
      uCyberIntensity: oceanUniforms.uCyberIntensity,
    };
    const compositeMat = new THREE.ShaderMaterial({
      vertexShader: compositeVertexShader,
      fragmentShader: compositeFragmentShader,
      uniforms: compositeUniforms,
      depthTest: false,
      depthWrite: false,
    });
    const compositeGeo = new THREE.PlaneGeometry(2, 2);
    const compositeQuad = new THREE.Mesh(compositeGeo, compositeMat);
    compositeQuad.frustumCulled = false;
    const compositeScene = new THREE.Scene();
    compositeScene.add(compositeQuad);
    const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Interactive Pointer / Mouse Parallax & Free-Look Drag State
    const pointerTarget = { x: 0, y: 0 };
    const pointerCurrent = { x: 0, y: 0 };
    let hoverNormalized = { x: 0, y: 0 };
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let dragOffset = { x: 0, y: 0 };
    let isInteractingWithUi = false;

    const updatePointerTarget = () => {
      if (isInteractingWithUi) {
        pointerTarget.x = 0;
        pointerTarget.y = 0;
        return;
      }
      const influence = configRef.current.mouseInfluence ?? 1.25;
      pointerTarget.x = hoverNormalized.x * 0.68 * influence + dragOffset.x;
      pointerTarget.y = -hoverNormalized.y * 0.56 * influence + dragOffset.y;
    };

    const returnToDefaultView = () => {
      isInteractingWithUi = true;
      isDragging = false;
      hoverNormalized.x = 0;
      hoverNormalized.y = 0;
      dragOffset.x = 0;
      dragOffset.y = 0;
      updatePointerTarget();
    };

    const onPointerMove = (e: PointerEvent) => {
      // UI controls sit above the canvas; their pointer positions should not steer the view.
      if (e.target !== canvas) {
        returnToDefaultView();
        return;
      }
      isInteractingWithUi = false;
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      hoverNormalized = { x: nx, y: ny };
      if (isDragging) {
        const influence = Math.max(0.4, configRef.current.mouseInfluence ?? 1.25);
        dragOffset.x = Math.max(
          -1.45,
          Math.min(1.45, dragOffset.x + (e.clientX - dragStart.x) * 0.0048 * influence)
        );
        dragOffset.y = Math.max(
          -0.95,
          Math.min(1.05, dragOffset.y - (e.clientY - dragStart.y) * 0.0042 * influence)
        );
        dragStart = { x: e.clientX, y: e.clientY };
      }
      updatePointerTarget();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.target !== canvas) {
        returnToDefaultView();
        return;
      }
      isInteractingWithUi = false;
      isDragging = true;
      dragStart = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const onDoubleClick = () => {
      dragOffset = { x: 0, y: 0 };
      updatePointerTarget();
    };

    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && !container.contains(e.target)) {
        returnToDefaultView();
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('focusin', onFocusIn);
    canvas.addEventListener('dblclick', onDoubleClick);
    window.addEventListener('pointerup', onPointerUp);

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      const pr = Math.min(window.devicePixelRatio || 1, 2);

      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();

      reflectionCamera.aspect = newW / newH;
      reflectionCamera.updateProjectionMatrix();

      renderer.setSize(newW, newH);
      renderer.setPixelRatio(pr);
      starfieldUniforms.uPixelRatio.value = pr;

      reflectionRenderTarget.setSize(
        Math.max(256, Math.floor(newW * pr * reflScale)),
        Math.max(256, Math.floor(newH * pr * reflScale))
      );
      aboveTarget.setSize(Math.floor(newW * pr), Math.floor(newH * pr));
      belowTarget.setSize(Math.floor(newW * pr), Math.floor(newH * pr));
      compositeUniforms.uResolution.value.set(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop State
    let animationFrameId: number;
    let lastFrameTime = performance.now();
    let elapsedTime = 0;
    let driftOffset = 0;
    let frameCounter = 0;
    let fpsAccumulator = 0;

    // Reusable color objects for smooth preset transitions
    const targetSkyZenith = new THREE.Color();
    const targetSkyHorizon = new THREE.Color();
    const targetMoonCore = new THREE.Color();
    const targetMoonHalo = new THREE.Color();
    const targetWaterDeep = new THREE.Color();
    const targetWaterShallow = new THREE.Color();
    const targetCyberAccent = new THREE.Color();

    let smoothedElevation = initialCfg.moonElevation;
    let smoothedScale = initialCfg.moonScale;
    let smoothedGlow = initialCfg.moonGlow;
    let smoothedPhase = initialCfg.moonPhase;
    let smoothedStarfield = initialCfg.starfieldDensity;
    let smoothedDistortion = initialCfg.waveDistortion;
    let smoothedWaveSpeed = initialCfg.waveSpeed;
    let smoothedAltitude = initialCfg.cameraAltitude;
    let wasAutoDrifting = false;
    let lookPhase = 0;
    let elevationPhase = 0;
    let autoYaw = 0;
    let autoPitch = 0;
    let smoothedCyber = initialCfg.cyberDreamIntensity;

    // Underwater transition state
    let wasUnderwater = initialCfg.cameraAltitude < 0;
    let divePulse = 0;
    let surfacePulse = 0;

    const animate = (now: number) => {
      animationFrameId = requestAnimationFrame(animate);

      const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
      lastFrameTime = now;

      // FPS Calculation
      frameCounter++;
      fpsAccumulator += dt;
      if (fpsAccumulator >= 0.5) {
        if (onFpsUpdate) {
          onFpsUpdate(Math.round(frameCounter / fpsAccumulator));
        }
        frameCounter = 0;
        fpsAccumulator = 0;
      }

      const cfg = configRef.current;
      const lerpRate = Math.min(1, dt * 4.5);

      // Smoothly interpolate parameters when switching presets or sliders
      smoothedElevation += (cfg.moonElevation - smoothedElevation) * lerpRate;
      smoothedScale += (cfg.moonScale - smoothedScale) * lerpRate;
      smoothedGlow += (cfg.moonGlow - smoothedGlow) * lerpRate;
      // Shortest-arc circular interpolation for moonPhase (0.0 -> 1.0 wrap-around)
      const phaseDiff = ((((cfg.moonPhase - smoothedPhase) + 0.5) % 1) + 1) % 1 - 0.5;
      smoothedPhase = (((smoothedPhase + phaseDiff * Math.min(1, dt * 5.5)) % 1) + 1) % 1;

      smoothedStarfield += (cfg.starfieldDensity - smoothedStarfield) * lerpRate;
      smoothedDistortion += (cfg.waveDistortion - smoothedDistortion) * lerpRate;
      smoothedWaveSpeed += (cfg.waveSpeed - smoothedWaveSpeed) * lerpRate;
      const motionDt = pausedRef.current ? 0 : dt;
      const lookCenter = THREE.MathUtils.degToRad((cfg.cameraLookMin + cfg.cameraLookMax) / 2);
      const lookSpan = THREE.MathUtils.degToRad(Math.abs(cfg.cameraLookMax - cfg.cameraLookMin) / 2);
      const elevationCenter = (cfg.cameraElevationMin + cfg.cameraElevationMax) / 2;
      const elevationSpan = Math.abs(cfg.cameraElevationMax - cfg.cameraElevationMin) / 2;
      if (cfg.autoCameraDrift && !wasAutoDrifting) {
        // Start from the current height, with no jump when enabling or resuming drift.
        elevationPhase = Math.PI - Math.asin(
          THREE.MathUtils.clamp((smoothedAltitude - elevationCenter) / Math.max(elevationSpan, 1e-3), -1, 1)
        );
        lookPhase = 0;
      }
      wasAutoDrifting = cfg.autoCameraDrift;
      if (cfg.autoCameraDrift) {
        lookPhase = (lookPhase + motionDt * cfg.cameraLookRate * 0.15) % (Math.PI * 2);
        elevationPhase = (elevationPhase + motionDt * cfg.cameraElevationRate * 0.12) % (Math.PI * 2);
      }
      const autoLerp = 1 - Math.exp(-motionDt * 2);
      autoYaw += ((cfg.autoCameraDrift ? lookCenter + Math.sin(lookPhase) * lookSpan : 0) - autoYaw) * autoLerp;
      // Pitch nods scale with the look span, so a zero-width range holds the gaze still
      const pitchSwing = Math.min(1, lookSpan / 1.1) * 0.22;
      autoPitch += ((cfg.autoCameraDrift ? Math.sin(lookPhase * 2) * pitchSwing : 0) - autoPitch) * autoLerp;
      const targetAltitude = cfg.autoCameraDrift
        ? elevationCenter + Math.sin(elevationPhase) * elevationSpan
        : cfg.cameraAltitude;
      const altitudeDt = cfg.autoCameraDrift ? motionDt : dt;
      // Altitude glides more slowly than other parameters, and eases off further while crossing
      // the surface so the waterline visibly sweeps across the lens
      const surfaceProximity = Math.exp(-Math.abs(smoothedAltitude) * 0.6);
      const maxClimbRate = THREE.MathUtils.lerp(4.5, 0.4, surfaceProximity);
      smoothedAltitude += THREE.MathUtils.clamp(
        (targetAltitude - smoothedAltitude) * Math.min(1, altitudeDt * 2.2),
        -maxClimbRate * altitudeDt,
        maxClimbRate * altitudeDt
      );
      smoothedCyber += (cfg.cyberDreamIntensity - smoothedCyber) * lerpRate;

      targetSkyZenith.set(cfg.palette.skyZenith);
      targetSkyHorizon.set(cfg.palette.skyHorizon);
      targetMoonCore.set(cfg.palette.moonCore);
      targetMoonHalo.set(cfg.palette.moonHalo);
      targetWaterDeep.set(cfg.palette.waterDeep);
      targetWaterShallow.set(cfg.palette.waterShallow);
      targetCyberAccent.set(cfg.palette.cyberAccent);

      skyUniforms.uSkyZenith.value.lerp(targetSkyZenith, lerpRate);
      skyUniforms.uSkyHorizon.value.lerp(targetSkyHorizon, lerpRate);
      skyUniforms.uMoonCore.value.lerp(targetMoonCore, lerpRate);
      skyUniforms.uMoonHalo.value.lerp(targetMoonHalo, lerpRate);
      skyUniforms.uCyberAccent.value.lerp(targetCyberAccent, lerpRate);

      oceanUniforms.uSkyZenith.value.copy(skyUniforms.uSkyZenith.value);
      oceanUniforms.uSkyHorizon.value.copy(skyUniforms.uSkyHorizon.value);
      oceanUniforms.uMoonCore.value.copy(skyUniforms.uMoonCore.value);
      oceanUniforms.uMoonHalo.value.copy(skyUniforms.uMoonHalo.value);
      oceanUniforms.uCyberAccent.value.copy(skyUniforms.uCyberAccent.value);
      oceanUniforms.uWaterDeep.value.lerp(targetWaterDeep, lerpRate);
      oceanUniforms.uWaterShallow.value.lerp(targetWaterShallow, lerpRate);

      moonUniforms.uMoonCore.value.copy(skyUniforms.uMoonCore.value);
      moonUniforms.uMoonHalo.value.copy(skyUniforms.uMoonHalo.value);
      moonUniforms.uCyberAccent.value.copy(skyUniforms.uCyberAccent.value);

      coronaUniforms.uMoonCore.value.copy(skyUniforms.uMoonCore.value);
      coronaUniforms.uMoonHalo.value.copy(skyUniforms.uMoonHalo.value);
      coronaUniforms.uCyberAccent.value.copy(skyUniforms.uCyberAccent.value);

      particleUniforms.uColor1.value.copy(skyUniforms.uMoonHalo.value);
      particleUniforms.uColor2.value.copy(skyUniforms.uCyberAccent.value);
      particleUniforms.uCyberIntensity.value = smoothedCyber;

      starfieldUniforms.uMoonCore.value.copy(skyUniforms.uMoonCore.value);
      starfieldUniforms.uMoonHalo.value.copy(skyUniforms.uMoonHalo.value);
      starfieldUniforms.uCyberAccent.value.copy(skyUniforms.uCyberAccent.value);

      constellationUniforms.uMoonHalo.value.copy(skyUniforms.uMoonHalo.value);
      constellationUniforms.uCyberAccent.value.copy(skyUniforms.uCyberAccent.value);

      if (!pausedRef.current) {
        elapsedTime += dt;
        driftOffset += dt * cfg.driftSpeed * 9.5;
      }

      // Update Moon Transform
      const moonPos = getMoonPosition(smoothedElevation);
      moonGroup.position.copy(moonPos);
      moonGroup.scale.setScalar(smoothedScale);
      orbitalRing.rotation.z = elapsedTime * 0.12;
      ringMat.color.copy(skyUniforms.uCyberAccent.value);
      ringMat.opacity = 0.28 * smoothedCyber;

      const moonDirNormalized = moonPos.clone().normalize();
      skyUniforms.uMoonDirection.value.copy(moonDirNormalized);
      oceanUniforms.uMoonDirection.value.copy(moonDirNormalized);
      starfieldUniforms.uMoonDirection.value.copy(moonDirNormalized);
      constellationUniforms.uMoonDirection.value.copy(moonDirNormalized);

      // Slowly rotate the 3D celestial starfield dome for subtle cosmic drift
      starfieldGroup.rotation.y = elapsedTime * 0.0045;

      // Update Uniforms
      skyUniforms.uTime.value = elapsedTime;
      skyUniforms.uMoonGlow.value = smoothedGlow;
      skyUniforms.uMoonPhase.value = smoothedPhase;
      skyUniforms.uStarfieldDensity.value = smoothedStarfield;
      skyUniforms.uCyberIntensity.value = smoothedCyber;

      starfieldUniforms.uTime.value = elapsedTime;
      starfieldUniforms.uStarfieldDensity.value = smoothedStarfield;
      starfieldUniforms.uCyberIntensity.value = smoothedCyber;
      starfieldUniforms.uMoonPhase.value = smoothedPhase;

      constellationUniforms.uTime.value = elapsedTime;
      constellationUniforms.uStarfieldDensity.value = smoothedStarfield;
      constellationUniforms.uCyberIntensity.value = smoothedCyber;
      constellationUniforms.uMoonPhase.value = smoothedPhase;

      moonUniforms.uTime.value = elapsedTime;
      moonUniforms.uMoonGlow.value = smoothedGlow;
      moonUniforms.uMoonPhase.value = smoothedPhase;
      moonUniforms.uCyberIntensity.value = smoothedCyber;

      coronaUniforms.uTime.value = elapsedTime;
      coronaUniforms.uMoonGlow.value = smoothedGlow;
      coronaUniforms.uMoonPhase.value = smoothedPhase;
      coronaUniforms.uCyberIntensity.value = smoothedCyber;

      oceanUniforms.uTime.value = elapsedTime;
      oceanUniforms.uWaveSpeed.value = smoothedWaveSpeed;
      oceanUniforms.uWaveDistortion.value = smoothedDistortion;
      oceanUniforms.uDriftOffset.value = driftOffset;
      oceanUniforms.uMoonGlow.value = smoothedGlow;
      oceanUniforms.uMoonScale.value = smoothedScale;
      oceanUniforms.uMoonPhase.value = smoothedPhase;
      oceanUniforms.uCyberIntensity.value = smoothedCyber;

      particleUniforms.uTime.value = elapsedTime;
      particleUniforms.uDriftOffset.value = driftOffset;

      // Smooth Camera Floating Choreography over the Sea with Expanded Mouse Range of Motion
      updatePointerTarget();
      const prevPointerX = pointerCurrent.x;
      const pointerLerp = Math.min(1, dt * 4.8);
      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * pointerLerp;
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * pointerLerp;
      const pointerVelocityX = (pointerCurrent.x - prevPointerX) / Math.max(dt, 0.001);

      // 0 above the water -> 1 once comfortably submerged: steers the camera into an upward gaze
      const submergeLook = smoothstep(0.4, -1.6, smoothedAltitude);

      const floatBobY =
        (Math.sin(elapsedTime * 0.85) * 0.22 + Math.cos(elapsedTime * 0.48) * 0.12) *
        (1 - 0.5 * submergeLook);
      // Wide lateral spatial glide across the water surface
      const floatSwayX =
        Math.sin(elapsedTime * 0.37) * 0.45 + pointerCurrent.x * 16.5;
      // Vertical altitude response: dip down close to the glassy wave crests or rise into the night air
      const pointerAltitudeOffset = pointerCurrent.y * 2.8 * (1 - 0.8 * submergeLook);
      // Subtle fore-aft surge with vertical mouse tilt
      const floatSurgeZ = pointerCurrent.y * -7.5;

      // Above water the camera never dips below 0.85m; that floor relaxes continuously as it dives
      const camY = Math.max(
        Math.min(0.85, smoothedAltitude - 0.3),
        smoothedAltitude + floatBobY + pointerAltitudeOffset
      );
      camera.position.set(floatSwayX, camY, floatSurgeZ);
      oceanUniforms.uCameraPos.value.copy(camera.position);

      // Expansive spherical yaw & pitch look-around across the horizon, sea, and cosmos
      const lookDist = moonDistance * 0.55;
      // Underwater, tilt the gaze up toward Snell's window where the refracted moon hangs
      const basePitch = Math.atan2(moonPos.y * 0.34 - camY, lookDist) + submergeLook * 0.62;
      const yawAngle =
        autoYaw + pointerCurrent.x * 0.72 + Math.sin(elapsedTime * 0.25) * 0.012;
      const pitchAngle = THREE.MathUtils.clamp(
        basePitch + autoPitch +
          pointerCurrent.y * (0.48 + 0.22 * submergeLook) +
          Math.cos(elapsedTime * 0.65) * 0.005,
        THREE.MathUtils.lerp(-0.36, -0.95, submergeLook),
        THREE.MathUtils.lerp(0.72, 1.35, submergeLook)
      );

      const cosPitch = Math.cos(pitchAngle);
      const lookAtTarget = new THREE.Vector3(
        camera.position.x + Math.sin(yawAngle) * cosPitch * lookDist,
        camera.position.y + Math.sin(pitchAngle) * lookDist,
        camera.position.z - Math.cos(yawAngle) * cosPitch * lookDist
      );

      // Dynamic aerial banking roll responsive to pointer position and turn rate
      const bankRoll = THREE.MathUtils.clamp(
        Math.sin(elapsedTime * 0.42) * 0.012 -
          pointerCurrent.x * 0.075 -
          pointerVelocityX * 0.022,
        -0.22,
        0.22
      );
      camera.up.set(bankRoll, 1, 0).normalize();
      camera.lookAt(lookAtTarget);
      camera.updateMatrixWorld();

      // Ensure Corona Billboard always faces camera
      coronaMesh.lookAt(camera.position);

      // Update the bioluminescent fish (schools below, leaps & splash ripples at the surface)
      fishSchool.update({
        dt: pausedRef.current ? 0 : dt,
        elapsedTime,
        driftOffset,
        driftSpeed: cfg.driftSpeed,
        waveSpeed: smoothedWaveSpeed,
        waveDistortion: smoothedDistortion,
        creatureActivity: cfg.creatureActivity,
        cyberIntensity: smoothedCyber,
        moonGlow: smoothedGlow,
        cameraPos: camera.position,
        moonDirection: moonDirNormalized,
        moonCore: skyUniforms.uMoonCore.value,
        moonHalo: skyUniforms.uMoonHalo.value,
        cyberAccent: skyUniforms.uCyberAccent.value,
      });

      // Update Flying Jellyfish-Whale Leviathans Pod in the sky
      skyWhalePod.update({
        dt: pausedRef.current ? 0 : dt,
        elapsedTime,
        creatureActivity: cfg.creatureActivity,
        cyberIntensity: smoothedCyber,
        moonGlow: smoothedGlow,
        cameraPos: camera.position,
        moonCore: skyUniforms.uMoonCore.value,
        moonHalo: skyUniforms.uMoonHalo.value,
        cyberAccent: skyUniforms.uCyberAccent.value,
        skyHorizon: skyUniforms.uSkyHorizon.value,
      });

      // Update Procedural Weather System (Intermittent Fog, Digital Drizzle & Ethereal DoF)
      const weatherState = weatherSystem.update({
        dt: pausedRef.current ? 0 : dt,
        elapsedTime,
        driftOffset,
        weatherMode: cfg.weatherMode,
        weatherIntensity: cfg.weatherIntensity,
        cyberIntensity: smoothedCyber,
        moonGlow: smoothedGlow,
        skyHorizon: skyUniforms.uSkyHorizon.value,
        moonCore: skyUniforms.uMoonCore.value,
        moonHalo: skyUniforms.uMoonHalo.value,
        cyberAccent: skyUniforms.uCyberAccent.value,
      });

      skyUniforms.uFogAmount.value = weatherState.fogAmount;
      oceanUniforms.uFogAmount.value = weatherState.fogAmount;
      oceanUniforms.uDrizzleAmount.value = weatherState.drizzleAmount;
      oceanUniforms.uDofStrength.value = weatherState.dofStrength;
      oceanUniforms.uFocalDistance.value = weatherState.focalDistance;

      // Where is the camera relative to the undulating surface?
      const waveTime = elapsedTime * smoothedWaveSpeed;
      const surfaceAtCamera = swellHeightAt(
        camera.position.x,
        camera.position.z,
        waveTime,
        smoothedDistortion,
        driftOffset
      );
      const cameraHeightAboveSurface = camera.position.y - surfaceAtCamera;
      // Near the surface the lens straddles the waterline, so both worlds are rendered
      const lensMargin = LENS_REACH + 0.1;
      const hasAbove = cameraHeightAboveSurface > -lensMargin;
      const hasBelow = cameraHeightAboveSurface < lensMargin;

      const isUnderwater = cameraHeightAboveSurface < 0;
      cameraUpdateRef.current?.(smoothedAltitude, isUnderwater);
      if (isUnderwater !== wasUnderwater) {
        if (isUnderwater) divePulse = 1;
        else surfacePulse = 1;
        wasUnderwater = isUnderwater;
      }
      divePulse = Math.max(0, divePulse - dt / 1.8);
      surfacePulse = Math.max(0, surfacePulse - dt / 3.2);

      // Apparent moon direction from underwater: Snell's law bends it up toward the zenith
      const sinWater = Math.cos(smoothedElevation) / 1.333;
      waterVolumeUniforms.uMoonDirWater.value.set(0, Math.sqrt(1 - sinWater * sinWater), -sinWater);
      const phaseIllum = 0.5 - 0.5 * Math.cos(smoothedPhase * Math.PI * 2);
      waterVolumeUniforms.uMoonLight.value = smoothedGlow * (0.28 + 0.72 * phaseIllum);
      waterVolumeUniforms.uDepth.value = Math.max(0, -cameraHeightAboveSurface);
      backdropMesh.position.copy(camera.position);

      const needsComposite = hasBelow || divePulse > 0 || surfacePulse > 0;

      if (hasAbove) {
        // PASS 1: Render Planar Reflection into reflectionRenderTarget
        // Mirror camera across water plane (y = 0)
        reflectionCamera.position.set(camera.position.x, -camera.position.y, camera.position.z);
        reflectionCamera.up.set(-camera.up.x, camera.up.y, -camera.up.z).normalize();
        reflectionCamera.lookAt(lookAtTarget.x, -lookAtTarget.y, lookAtTarget.z);

        oceanMesh.visible = false;
        renderer.setRenderTarget(reflectionRenderTarget);
        renderer.clear();
        renderer.render(scene, reflectionCamera);
        oceanMesh.visible = true;

        // PASS 2: Render the above-water scene (straight to screen unless it needs compositing)
        renderer.setRenderTarget(needsComposite ? aboveTarget : null);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      }

      if (hasBelow) {
        // PASS 3: Capture the sky, moon & creatures from just above the surface for refraction
        oceanMesh.visible = false;
        skyCubeCamera.position.set(
          camera.position.x,
          Math.max(surfaceAtCamera, 0) + 0.35,
          camera.position.z
        );
        skyCubeCamera.update(renderer, scene);

        // PASS 4: Render the underwater world: water column, the surface from beneath & submerged creatures
        aboveWaterOnly.forEach((obj) => (obj.visible = false));
        underwaterGroup.visible = true;
        fishSchool.setSubmergedView(true);

        renderer.setRenderTarget(belowTarget);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);

        fishSchool.setSubmergedView(false);
        underwaterGroup.visible = false;
        aboveWaterOnly.forEach((obj) => (obj.visible = true));
        oceanMesh.visible = true;
      }

      if (needsComposite) {
        // PASS 5: Blend both worlds across the waterline with underwater light shafts, bubbles & droplets
        compositeUniforms.uHasAbove.value = hasAbove ? 1 : 0;
        compositeUniforms.uHasBelow.value = hasBelow ? 1 : 0;
        compositeUniforms.uWaveTime.value = waveTime;
        compositeUniforms.uDivePulse.value = divePulse;
        compositeUniforms.uSurfacePulse.value = surfacePulse;
        renderer.render(compositeScene, compositeCamera);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('focusin', onFocusIn);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);

      reflectionRenderTarget.dispose();
      aboveTarget.dispose();
      belowTarget.dispose();
      skyCubeTarget.dispose();
      backdropGeo.dispose();
      backdropMat.dispose();
      undersideMat.dispose();
      snowGeo.dispose();
      snowMat.dispose();
      compositeGeo.dispose();
      compositeMat.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      starsGeometry.dispose();
      starfieldMat.dispose();
      constellationGeometry.dispose();
      constellationMat.dispose();
      moonGeo.dispose();
      moonMat.dispose();
      coronaGeo.dispose();
      coronaMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      oceanGeo.dispose();
      oceanMat.dispose();
      fishSchoolRef.current = null;
      fishSchool.dispose();
      skyWhalePodRef.current = null;
      skyWhalePod.dispose();
      weatherSystem.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
    };
  }, []);

  if (webglError) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#040610] via-[#171332] to-[#030611] p-6 text-center">
        <div className="w-28 h-28 rounded-full bg-cyan-200/90 shadow-[0_0_80px_rgba(56,189,248,0.7)] mb-8" />
        <h2 className="font-display text-2xl font-semibold text-white mb-2">
          Vespera Lunar Horizon
        </h2>
        <p className="text-sm text-slate-300 max-w-md">
          WebGL hardware acceleration is currently unavailable in this browser context.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-full overflow-hidden z-0"
      aria-label="Interactive 3D animation of a glowing moon reflected over a smooth cyber-dream sea"
    />
  );
};
