export type PresetId = 'nocturne' | 'synth_horizon' | 'aether_pulse' | 'violet_eclipse';

export type WeatherMode = 'clear' | 'fog' | 'drizzle' | 'intermittent';

export interface WeatherModeOption {
  id: WeatherMode;
  label: string;
  shortLabel: string;
}

export const WEATHER_MODES: WeatherModeOption[] = [
  { id: 'intermittent', label: 'Intermittent Mist & Drizzle', shortLabel: 'Intermittent' },
  { id: 'fog', label: 'Procedural Fog & DoF', shortLabel: 'Fog Bank' },
  { id: 'drizzle', label: 'Digital Drizzle & Ripples', shortLabel: 'Drizzle' },
  { id: 'clear', label: 'Clear Nocturne', shortLabel: 'Clear' },
];

export interface ColorPalette {
  skyZenith: string;
  skyHorizon: string;
  moonCore: string;
  moonHalo: string;
  waterDeep: string;
  waterShallow: string;
  cyberAccent: string;
}

export interface SceneConfig {
  presetId: PresetId;
  moonElevation: number;       // 0.06 to 0.42
  moonScale: number;           // 0.6 to 2.0
  moonGlow: number;            // 0.4 to 2.0
  moonPhase: number;           // 0.0 to 1.0 (0 = New, 0.25 = First Quarter, 0.5 = Full, 0.75 = Third Quarter)
  autoCyclePhase: boolean;     // Continuously animate waxing/waning transitions
  starfieldDensity: number;    // 0.0 to 2.0 (controls procedural starfield & cyber-constellation intensity)
  shootingStarRate: number;    // 0 to 30 (neon shooting stars per minute)
  creatureActivity: number;    // 0.0 to 2.0 (controls frequency & glow of bioluminescent creatures peering above water)
  weatherMode: WeatherMode;    // 'clear' | 'fog' | 'drizzle' | 'intermittent'
  weatherIntensity: number;    // 0.0 to 1.5 (controls fog density, digital drizzle, water pattering & ethereal DoF blur)
  waveDistortion: number;      // 0.15 to 1.5 (controls how much water ripples distort reflection)
  waveSpeed: number;           // 0.2 to 2.2
  driftSpeed: number;          // 0.0 to 2.5 (camera floating forward velocity)
  autoCameraDrift: boolean;   // Automatically look around and cycle above/below water
  cameraLookRate: number;      // 0.0 to 3.0 (look-around speed multiplier)
  cameraElevationRate: number; // 0.0 to 3.0 (dive/surface cycle speed multiplier)
  cameraLookMin: number;       // -90 to 90 degrees (leftmost auto look-around heading)
  cameraLookMax: number;       // -90 to 90 degrees (rightmost auto look-around heading)
  cameraElevationMin: number;  // -8.0 to 6.0 (lowest auto drift altitude)
  cameraElevationMax: number;  // -8.0 to 6.0 (highest auto drift altitude)
  cameraAltitude: number;      // -8.0 to 6.0 (height relative to water)
  mouseInfluence: number;      // 0.0 to 2.0 (range of camera motion & parallax from mouse/pointer)
  cyberDreamIntensity: number; // 0.0 to 1.0 (subtle holographic scanlines, chromatic aura, subsurface grid)
  palette: ColorPalette;
}

export interface MoonPhaseStop {
  id: string;
  label: string;
  cycleState: 'Waxing' | 'Waning' | 'Full' | 'New';
  value: number; // 0.0 to 1.0
}

export const MOON_PHASE_STOPS: MoonPhaseStop[] = [
  { id: 'full', label: 'Full Moon', cycleState: 'Full', value: 0.5 },
  { id: 'waning_gibbous', label: 'Waning Gibbous', cycleState: 'Waning', value: 0.625 },
  { id: 'third_quarter', label: 'Third Quarter', cycleState: 'Waning', value: 0.75 },
  { id: 'waning_crescent', label: 'Waning Crescent', cycleState: 'Waning', value: 0.875 },
  { id: 'new', label: 'New Moon', cycleState: 'New', value: 0.0 },
  { id: 'waxing_crescent', label: 'Waxing Crescent', cycleState: 'Waxing', value: 0.125 },
  { id: 'first_quarter', label: 'First Quarter', cycleState: 'Waxing', value: 0.25 },
  { id: 'waxing_gibbous', label: 'Waxing Gibbous', cycleState: 'Waxing', value: 0.375 },
];

export function getMoonPhaseInfo(phase: number): {
  label: string;
  cycleState: 'Waxing' | 'Waning' | 'Full' | 'New';
  illuminationPercent: number;
} {
  const normalized = ((phase % 1) + 1) % 1;
  const illumination = 0.5 * (1 - Math.cos(normalized * Math.PI * 2));
  const illuminationPercent = Math.round(illumination * 100);

  // Find closest named phase stop
  let closest = MOON_PHASE_STOPS[0];
  let minDiff = 1;
  for (const stop of MOON_PHASE_STOPS) {
    const rawDiff = Math.abs(normalized - stop.value);
    const circularDiff = Math.min(rawDiff, 1 - rawDiff);
    if (circularDiff < minDiff) {
      minDiff = circularDiff;
      closest = stop;
    }
  }

  return {
    label: closest.label,
    cycleState: closest.cycleState,
    illuminationPercent,
  };
}

export interface ScenePreset {
  id: PresetId;
  label: string;
  subtitle: string;
  config: SceneConfig;
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'nocturne',
    label: 'Lunar Drift',
    subtitle: 'Obsidian swells · Bioluminescent cyan-silver moon',
    config: {
      presetId: 'nocturne',
      moonElevation: 0.16,
      moonScale: 1.15,
      moonGlow: 1.25,
      moonPhase: 0.5,
      autoCyclePhase: false,
      starfieldDensity: 1.15,
      shootingStarRate: 6,
      creatureActivity: 1.0,
      weatherMode: 'intermittent',
      weatherIntensity: 0.68,
      waveDistortion: 0.52,
      waveSpeed: 0.85,
      driftSpeed: 1.0,
      autoCameraDrift: false,
      cameraLookRate: 1.0,
      cameraElevationRate: 1.0,
      cameraLookMin: -63,
      cameraLookMax: 63,
      cameraElevationMin: -6.0,
      cameraElevationMax: 4.0,
      cameraAltitude: 3.1,
      mouseInfluence: 1.25,
      cyberDreamIntensity: 0.55,
      palette: {
        skyZenith: '#040610',
        skyHorizon: '#171332',
        moonCore: '#f0f9ff',
        moonHalo: '#38bdf8',
        waterDeep: '#030611',
        waterShallow: '#0c2742',
        cyberAccent: '#06b6d4',
      },
    },
  },
  {
    id: 'synth_horizon',
    label: 'Synth Horizon',
    subtitle: 'Velvet dusk · Rose-pearl lunar reflection',
    config: {
      presetId: 'synth_horizon',
      moonElevation: 0.13,
      moonScale: 1.35,
      moonGlow: 1.4,
      moonPhase: 0.375,
      autoCyclePhase: false,
      starfieldDensity: 1.35,
      shootingStarRate: 14,
      creatureActivity: 1.15,
      weatherMode: 'drizzle',
      weatherIntensity: 0.78,
      waveDistortion: 0.64,
      waveSpeed: 0.95,
      driftSpeed: 1.25,
      autoCameraDrift: false,
      cameraLookRate: 1.0,
      cameraElevationRate: 1.0,
      cameraLookMin: -63,
      cameraLookMax: 63,
      cameraElevationMin: -6.0,
      cameraElevationMax: 4.0,
      cameraAltitude: 2.8,
      mouseInfluence: 1.3,
      cyberDreamIntensity: 0.72,
      palette: {
        skyZenith: '#070412',
        skyHorizon: '#2a123f',
        moonCore: '#fff1f7',
        moonHalo: '#e879f9',
        waterDeep: '#060514',
        waterShallow: '#1e1640',
        cyberAccent: '#22d3ee',
      },
    },
  },
  {
    id: 'aether_pulse',
    label: 'Aether Mirror',
    subtitle: 'Glassy calm · Opal-teal horizon shimmer',
    config: {
      presetId: 'aether_pulse',
      moonElevation: 0.21,
      moonScale: 1.0,
      moonGlow: 1.15,
      moonPhase: 0.625,
      autoCyclePhase: false,
      starfieldDensity: 1.1,
      shootingStarRate: 4,
      creatureActivity: 1.25,
      weatherMode: 'fog',
      weatherIntensity: 0.75,
      waveDistortion: 0.28,
      waveSpeed: 0.55,
      driftSpeed: 0.7,
      autoCameraDrift: false,
      cameraLookRate: 1.0,
      cameraElevationRate: 1.0,
      cameraLookMin: -63,
      cameraLookMax: 63,
      cameraElevationMin: -6.0,
      cameraElevationMax: 4.0,
      cameraAltitude: 2.4,
      mouseInfluence: 1.2,
      cyberDreamIntensity: 0.45,
      palette: {
        skyZenith: '#030812',
        skyHorizon: '#0d2638',
        moonCore: '#ecfeff',
        moonHalo: '#2dd4bf',
        waterDeep: '#020710',
        waterShallow: '#092e3a',
        cyberAccent: '#5eead4',
      },
    },
  },
  {
    id: 'violet_eclipse',
    label: 'Astral Low',
    subtitle: 'Low-hanging supermoon · Deep indigo swell',
    config: {
      presetId: 'violet_eclipse',
      moonElevation: 0.09,
      moonScale: 1.58,
      moonGlow: 1.6,
      moonPhase: 0.82,
      autoCyclePhase: false,
      starfieldDensity: 1.55,
      shootingStarRate: 10,
      creatureActivity: 1.1,
      weatherMode: 'intermittent',
      weatherIntensity: 0.82,
      waveDistortion: 0.75,
      waveSpeed: 0.75,
      driftSpeed: 0.9,
      autoCameraDrift: false,
      cameraLookRate: 1.0,
      cameraElevationRate: 1.0,
      cameraLookMin: -63,
      cameraLookMax: 63,
      cameraElevationMin: -6.0,
      cameraElevationMax: 4.0,
      cameraAltitude: 3.4,
      mouseInfluence: 1.25,
      cyberDreamIntensity: 0.68,
      palette: {
        skyZenith: '#05040d',
        skyHorizon: '#1d1642',
        moonCore: '#f5f3ff',
        moonHalo: '#818cf8',
        waterDeep: '#04040e',
        waterShallow: '#141538',
        cyberAccent: '#a78bfa',
      },
    },
  },
];
