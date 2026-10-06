import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CloudRain,
  Eye,
  EyeOff,
  Moon,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
  X,
} from 'lucide-react';
import { CyberLunarSeaCanvas } from './components/CyberLunarSeaCanvas';
import {
  getMoonPhaseInfo,
  MOON_PHASE_STOPS,
  PresetId,
  SCENE_PRESETS,
  SceneConfig,
  WEATHER_MODES,
  WeatherMode,
} from './types/scene';
import { CyberDreamAudio } from './utils/dreamAudio';

const DIVE_DEPTH = -3.5;
const ZEN_POINTER_IDLE_MS = 1000;

export default function App() {
  const [config, setConfig] = useState<SceneConfig>(SCENE_PRESETS[0].config);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isControlsOpen, setIsControlsOpen] = useState<boolean>(false);
  const [isZenMode, setIsZenMode] = useState<boolean>(true);
  const [isZenPointerActive, setIsZenPointerActive] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState<boolean>(false);
  const [captureFlash, setCaptureFlash] = useState<boolean>(false);
  const [summonSignal, setSummonSignal] = useState<number>(0);

  useEffect(() => {
    setIsZenPointerActive(false);
    if (!isZenMode) return;

    let idleTimeout: ReturnType<typeof setTimeout> | undefined;
    let pointerActive = false;
    const showPointer = () => {
      if (!pointerActive) {
        pointerActive = true;
        setIsZenPointerActive(true);
      }
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        pointerActive = false;
        setIsZenPointerActive(false);
      }, ZEN_POINTER_IDLE_MS);
    };
    // A tap also reveals the exit control on devices without a mouse.
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') showPointer();
    };

    window.addEventListener('pointermove', showPointer);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      clearTimeout(idleTimeout);
      window.removeEventListener('pointermove', showPointer);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isZenMode]);

  const audioRef = useRef<CyberDreamAudio | null>(null);
  // Altitude to return to when surfacing from a dive
  const surfaceAltitudeRef = useRef<number>(SCENE_PRESETS[0].config.cameraAltitude);

  const cameraAltitudeRef = useRef(config.cameraAltitude);
  const cameraSubmergedRef = useRef(false);
  const [cameraSubmerged, setCameraSubmerged] = useState(false);
  const handleCameraUpdate = useCallback((altitude: number, submerged: boolean) => {
    cameraAltitudeRef.current = altitude;
    // Only notify React at a waterline crossing; motion stays in the render loop.
    if (cameraSubmergedRef.current !== submerged) {
      cameraSubmergedRef.current = submerged;
      setCameraSubmerged(submerged);
    }
  }, []);
  const isSubmerged = config.autoCameraDrift ? cameraSubmerged : config.cameraAltitude < 0;

  const handleToggleCameraDrift = () => {
    setConfig((prev) => ({
      ...prev,
      autoCameraDrift: !prev.autoCameraDrift,
      cameraAltitude: cameraAltitudeRef.current,
    }));
  };

  const handleToggleDive = () => {
    setConfig((prev) => {
      const submerged = prev.autoCameraDrift ? cameraSubmergedRef.current : prev.cameraAltitude < 0;
      if (!submerged) {
        surfaceAltitudeRef.current = Math.max(1.6, cameraAltitudeRef.current);
        return { ...prev, autoCameraDrift: false, cameraAltitude: DIVE_DEPTH };
      }
      return { ...prev, autoCameraDrift: false, cameraAltitude: Math.max(1.6, surfaceAltitudeRef.current) };
    });
  };

  useEffect(() => {
    audioRef.current?.setSubmerged(isSubmerged);
  }, [isSubmerged, isAudioActive]);

  useEffect(() => {
    audioRef.current = new CyberDreamAudio();
    return () => {
      audioRef.current?.dispose();
    };
  }, []);

  // Continuous dynamic waxing/waning phase animation when autoCyclePhase is enabled
  useEffect(() => {
    if (!config.autoCyclePhase || isPaused) return;

    let rafId: number;
    let lastTime = performance.now();

    const stepPhase = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      setConfig((prev) => ({
        ...prev,
        moonPhase: (((prev.moonPhase + dt * 0.055) % 1) + 1) % 1,
      }));

      rafId = requestAnimationFrame(stepPhase);
    };

    rafId = requestAnimationFrame(stepPhase);
    return () => cancelAnimationFrame(rafId);
  }, [config.autoCyclePhase, isPaused]);

  // Keyboard shortcuts: Space to pause/play, H to toggle Zen mode, D to dive / surface
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPaused((prev) => !prev);
      } else if (e.key === 'h' || e.key === 'H') {
        setIsZenMode((prev) => !prev);
      } else if (e.key === 'd' || e.key === 'D') {
        handleToggleDive();
      } else if (e.key === 'Escape') {
        setIsControlsOpen(false);
        setIsZenMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectPreset = (presetId: PresetId) => {
    const found = SCENE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      // Stay underwater when switching atmospheres mid-dive
      setConfig((prev) => ({
        ...found.config,
        palette: { ...found.config.palette },
        cameraAltitude: (prev.autoCameraDrift ? cameraSubmergedRef.current : prev.cameraAltitude < 0)
          ? (prev.autoCameraDrift ? cameraAltitudeRef.current : prev.cameraAltitude)
          : found.config.cameraAltitude,
      }));
    }
  };

  const handleResetCurrentPreset = () => {
    handleSelectPreset(config.presetId);
  };

  // Cycle sequentially through the 8 lunar phases (Full -> Waning -> New -> Waxing)
  const handleCycleMoonPhase = () => {
    setConfig((prev) => {
      const normalized = ((prev.moonPhase % 1) + 1) % 1;
      let currentIndex = 0;
      let minDiff = 1;
      MOON_PHASE_STOPS.forEach((stop, idx) => {
        const rawDiff = Math.abs(normalized - stop.value);
        const circularDiff = Math.min(rawDiff, 1 - rawDiff);
        if (circularDiff < minDiff) {
          minDiff = circularDiff;
          currentIndex = idx;
        }
      });
      const nextStop = MOON_PHASE_STOPS[(currentIndex + 1) % MOON_PHASE_STOPS.length];
      return {
        ...prev,
        moonPhase: nextStop.value,
      };
    });
  };

  const handleToggleAutoPhaseCycle = () => {
    setConfig((prev) => ({
      ...prev,
      autoCyclePhase: !prev.autoCyclePhase,
    }));
  };

  const handleToggleAudio = () => {
    if (!audioRef.current) return;
    const playing = audioRef.current.toggle();
    setIsAudioActive(playing);
  };

  const handleCaptureSnapshot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 180);

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `vespera-${config.presetId}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // Fallback if canvas export is restricted
    }
  };

  const currentPreset =
    SCENE_PRESETS.find((p) => p.id === config.presetId) || SCENE_PRESETS[0];

  const elevationDegrees = Math.round((config.moonElevation * 180) / Math.PI);
  const distortionPercent = Math.round((config.waveDistortion / 1.5) * 100);
  const phaseInfo = getMoonPhaseInfo(config.moonPhase);
  const currentWeatherOption =
    WEATHER_MODES.find((w) => w.id === config.weatherMode) || WEATHER_MODES[0];

  const handleToggleWeatherConditions = () => {
    setConfig((prev) => {
      const idx = WEATHER_MODES.findIndex((w) => w.id === prev.weatherMode);
      const nextMode = WEATHER_MODES[(idx + 1) % WEATHER_MODES.length].id;
      return {
        ...prev,
        weatherMode: nextMode,
        weatherIntensity:
          nextMode !== 'clear' && prev.weatherIntensity < 0.15
            ? 0.72
            : prev.weatherIntensity,
      };
    });
  };

  const handleSelectWeatherMode = (mode: WeatherMode) => {
    setConfig((prev) => ({
      ...prev,
      weatherMode: mode,
      weatherIntensity:
        mode !== 'clear' && prev.weatherIntensity < 0.15
          ? 0.72
          : prev.weatherIntensity,
    }));
  };

  return (
    <div className={`relative w-screen h-screen overflow-hidden bg-[#05060f] select-none ${
      isZenMode && !isZenPointerActive ? 'zen-pointer-idle' : ''
    }`}>
      {/* Full-Viewport 3D WebGL Ocean & Moon Reflection Canvas */}
      <CyberLunarSeaCanvas
        config={config}
        isPaused={isPaused}
        summonSignal={summonSignal}
        onCameraUpdate={handleCameraUpdate}
      />

      {/* Brief visual shutter feedback when capturing a frame */}
      <div
        className={`pointer-events-none fixed inset-0 bg-cyan-100/20 z-30 transition-opacity duration-150 ${
          captureFlash ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Top Navigation Bar — Strict 3-Zone Contract */}
      {!isZenMode && (
        <header className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/70 via-black/30 to-transparent">
          {/* Zone 1: Single text element Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleSelectPreset('nocturne');
            }}
            className="font-display text-lg font-bold tracking-tight text-white hover:text-cyan-200 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            Vespera
          </a>

          {/* Zone 2: 4 Clean Text Navigation Links for Atmospheric Presets */}
          <nav
            aria-label="Scene atmospheres"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {SCENE_PRESETS.map((preset) => {
              const isActive = config.presetId === preset.id;
              return (
                <a
                  key={preset.id}
                  href={`#${preset.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelectPreset(preset.id);
                  }}
                  className={`relative py-1 whitespace-nowrap transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'text-slate-300/80 hover:text-white'
                  }`}
                >
                  {preset.label}
                  <span
                    className={`absolute left-0 right-0 -bottom-0.5 h-[1.5px] bg-cyan-400 transition-transform duration-150 origin-left ${
                      isActive ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </a>
              );
            })}
          </nav>

          {/* Zone 3: 2 Primary Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleAudio}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isAudioActive
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-100'
                  : 'bg-black/40 backdrop-blur-sm border-white/10 text-slate-200 hover:bg-white/10 hover:text-white'
              }`}
              title="Toggle procedural cyber-dream synth ambience"
            >
              {isAudioActive ? (
                <Volume2 className="w-3.5 h-3.5 text-cyan-300" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{isAudioActive ? 'Ambience On' : 'Ambience'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsControlsOpen((prev) => !prev)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isControlsOpen
                  ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                  : 'bg-black/40 backdrop-blur-sm border-white/10 text-white hover:bg-white/10'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Atmosphere</span>
            </button>
          </div>
        </header>
      )}

      {/* Mobile Preset Switcher (visible only on small viewports when not in Zen mode) */}
      {!isZenMode && (
        <div className="fixed top-16 left-6 right-6 z-20 flex md:hidden items-center gap-1 p-1 bg-black/45 backdrop-blur-md border border-white/10 rounded-lg overflow-x-auto">
          {SCENE_PRESETS.map((preset) => {
            const isActive = config.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Subtle Bottom-Left Editorial Caption & Quick Transport Controls */}
      {!isZenMode ? (
        <div className="fixed bottom-6 left-6 right-6 z-20 flex flex-col sm:flex-row sm:items-end justify-between gap-4 pointer-events-none">
          <div className="pointer-events-auto max-w-md">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-1 [text-wrap:balance]">
              {currentPreset.label}
            </h1>
            {/* Zero-Pill Metadata Discipline: Clean unboxed text with middot separators */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300/85 tracking-wide">
              <span>{currentPreset.subtitle}</span>
              <span aria-hidden="true">·</span>
              <span className="text-cyan-200/90 font-medium">
                {phaseInfo.label} ({phaseInfo.illuminationPercent}%)
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Elevation {elevationDegrees}°
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Ripple {distortionPercent}%
              </span>
              <span aria-hidden="true">·</span>
              <span>{currentWeatherOption.shortLabel}</span>
              {isSubmerged && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-cyan-200/90">
                    {config.autoCameraDrift ? 'Submerged · Auto Drift' : `Submerged ${(-config.cameraAltitude).toFixed(1)}m`}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Discreet Corner Action Bar */}
          <div className="pointer-events-auto flex items-center gap-2 self-start sm:self-end">
            <button
              type="button"
              onClick={handleToggleDive}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium backdrop-blur-sm border rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isSubmerged
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-100 hover:bg-cyan-500/30'
                  : 'bg-black/40 border-white/10 text-slate-200 hover:text-white hover:bg-white/10'
              }`}
              title="Dive beneath the surface or rise back up (D)"
            >
              <Waves className={`w-3.5 h-3.5 ${isSubmerged ? 'text-cyan-300' : 'text-slate-300'}`} />
              <span>{isSubmerged ? 'Surface' : 'Dive'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPaused((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Pause or resume ocean motion (Space)"
            >
              {isPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Resume Drift</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-slate-300" />
                  <span>Pause Drift</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCaptureSnapshot}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Save PNG snapshot"
            >
              <Camera className="w-3.5 h-3.5 text-slate-300" />
              <span>Capture</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsZenMode(true);
                setIsControlsOpen(false);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Hide interface overlay (H)"
            >
              <EyeOff className="w-3.5 h-3.5 text-slate-300" />
              <span>Zen View</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsZenMode(false)}
          className={`fixed bottom-6 right-6 z-20 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-black/45 backdrop-blur-sm border border-white/10 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-all duration-200 whitespace-nowrap cursor-pointer focus-visible:opacity-100 focus-visible:pointer-events-auto ${
            isZenPointerActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <Eye className="w-3.5 h-3.5 text-cyan-300" />
          <span>Controls</span>
        </button>
      )}

      {/* Floating Right-Hand Atmosphere & Wave Distortion Tuning Drawer */}
      {!isZenMode && isControlsOpen && (
        <aside
          aria-label="Atmosphere and Ocean Controls"
          className="fixed top-20 right-6 z-20 w-80 max-w-[calc(100vw-3rem)] max-h-[calc(100vh-8.5rem)] overflow-y-auto p-5 bg-black/55 backdrop-blur-md border border-white/10 rounded-xl text-slate-100 shadow-2xl"
        >
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                01. Horizon & Sea Optics
              </h2>
              <p className="text-xs text-slate-400">
                Real-time shader & reflection parameters
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleResetCurrentPreset}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Reset preset defaults"
                aria-label="Reset preset defaults"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsControlsOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Close panel"
                aria-label="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Lunar Phase Cycling & Dynamic Waxing/Waning Control */}
            <div className="p-3 bg-white/[0.04] border border-white/10 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-200 font-medium flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Lunar Phase</span>
                </span>
                <span className="font-mono tabular-nums text-cyan-300">
                  {phaseInfo.label} · {phaseInfo.illuminationPercent}%
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCycleMoonPhase}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/15 border border-white/10 rounded-md text-white transition-colors whitespace-nowrap cursor-pointer"
                  title="Step to next lunar phase (Waxing / Waning)"
                >
                  <Moon className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Cycle Phase</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleAutoPhaseCycle}
                  aria-pressed={config.autoCyclePhase}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    config.autoCyclePhase
                      ? 'bg-cyan-400/20 border-cyan-400/60 text-cyan-100'
                      : 'bg-black/40 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Continuously animate waxing and waning moon phases"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      config.autoCyclePhase ? 'text-cyan-300 animate-spin' : 'text-slate-400'
                    }`}
                  />
                  <span>{config.autoCyclePhase ? 'Wax/Wane On' : 'Auto-Cycle'}</span>
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>New</span>
                  <span>Waxing</span>
                  <span>Full</span>
                  <span>Waning</span>
                </div>
                <input
                  id="ctrl-phase"
                  type="range"
                  aria-label="Lunar Phase Angle"
                  min={0.0}
                  max={0.995}
                  step={0.005}
                  value={config.moonPhase}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      moonPhase: parseFloat(e.target.value),
                    }))
                  }
                  className="cyber-slider"
                />
              </div>
            </div>

            {/* Control 1: Moon Elevation */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="ctrl-elevation" className="text-slate-300 font-medium">
                  Lunar Elevation
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {elevationDegrees}°
                </span>
              </div>
              <input
                id="ctrl-elevation"
                type="range"
                min={0.05}
                max={0.38}
                step={0.005}
                value={config.moonElevation}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    moonElevation: parseFloat(e.target.value),
                  }))
                }
                className="cyber-slider"
              />
            </div>

            {/* Control 2: Moon Scale */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="ctrl-scale" className="text-slate-300 font-medium">
                  Lunar Disk Scale
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {config.moonScale.toFixed(2)}x
                </span>
              </div>
              <input
                id="ctrl-scale"
                type="range"
                min={0.65}
                max={1.85}
                step={0.02}
                value={config.moonScale}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    moonScale: parseFloat(e.target.value),
                  }))
                }
                className="cyber-slider"
              />
            </div>

            {/* Control 3: Moon Corona & Reflection Luminance */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="ctrl-glow" className="text-slate-300 font-medium">
                  Lunar Glow & Bloom
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {Math.round(config.moonGlow * 100)}%
                </span>
              </div>
              <input
                id="ctrl-glow"
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.moonGlow}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    moonGlow: parseFloat(e.target.value),
                  }))
                }
                className="cyber-slider"
              />
            </div>

            {/* Control 3b: Procedural Starfield & Cyber-Constellations Density */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="ctrl-starfield" className="text-slate-300 font-medium">
                  Starfield & Constellations
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {Math.round(config.starfieldDensity * 100)}%
                </span>
              </div>
              <input
                id="ctrl-starfield"
                type="range"
                min={0.0}
                max={2.0}
                step={0.05}
                value={config.starfieldDensity}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    starfieldDensity: parseFloat(e.target.value),
                  }))
                }
                className="cyber-slider"
              />
            </div>

            {/* Weather Conditions Toggle & Intensity Slider (Procedural Fog, Digital Drizzle & DoF) */}
            <div className="p-3 bg-white/[0.04] border border-white/10 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-200 font-medium flex items-center gap-1.5">
                  <CloudRain className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Weather Conditions</span>
                </span>
                <button
                  type="button"
                  onClick={handleToggleWeatherConditions}
                  className="font-mono tabular-nums text-cyan-300 hover:text-cyan-200 underline decoration-cyan-400/40 underline-offset-2 transition-colors cursor-pointer"
                  title="Cycle weather mode (Intermittent / Fog Bank / Drizzle / Clear)"
                >
                  {currentWeatherOption.shortLabel} ·{' '}
                  {config.weatherMode === 'clear'
                    ? '0%'
                    : `${Math.round(config.weatherIntensity * 100)}%`}
                </button>
              </div>

              {/* Segmented Weather Mode Toggle */}
              <div
                role="group"
                aria-label="Weather condition mode"
                className="grid grid-cols-4 gap-1 p-1 bg-black/45 border border-white/10 rounded-md"
              >
                {WEATHER_MODES.map((mode) => {
                  const isActive = config.weatherMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => handleSelectWeatherMode(mode.id)}
                      aria-pressed={isActive}
                      className={`px-1.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap truncate cursor-pointer ${
                        isActive
                          ? 'bg-cyan-400/25 text-cyan-100 border border-cyan-400/50'
                          : 'text-slate-400 hover:text-white border border-transparent'
                      }`}
                      title={mode.label}
                    >
                      {mode.shortLabel}
                    </button>
                  );
                })}
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <label htmlFor="ctrl-weather-intensity">
                    Fog, Drizzle & Ethereal DoF
                  </label>
                  <span className="font-mono tabular-nums text-slate-300">
                    {Math.round(config.weatherIntensity * 100)}%
                  </span>
                </div>
                <input
                  id="ctrl-weather-intensity"
                  type="range"
                  aria-label="Weather Conditions Intensity"
                  min={0.0}
                  max={1.5}
                  step={0.02}
                  value={config.weatherIntensity}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setConfig((prev) => ({
                      ...prev,
                      weatherMode:
                        val > 0.05 && prev.weatherMode === 'clear'
                          ? 'intermittent'
                          : prev.weatherMode,
                      weatherIntensity: val,
                    }));
                  }}
                  className="cyber-slider"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-white/10">
              <h3 className="font-display text-sm font-semibold text-white mb-3">
                02. Water Reflection & Motion
              </h3>

              {/* Control 4: Water Ripple Distortion */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="ctrl-distortion" className="text-slate-300 font-medium">
                    Reflection Distortion
                  </label>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {distortionPercent}%
                  </span>
                </div>
                <input
                  id="ctrl-distortion"
                  type="range"
                  min={0.12}
                  max={1.5}
                  step={0.02}
                  value={config.waveDistortion}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      waveDistortion: parseFloat(e.target.value),
                    }))
                  }
                  className="cyber-slider"
                />
              </div>

              {/* Control 5: Wave Swell Speed */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="ctrl-wavespeed" className="text-slate-300 font-medium">
                    Swell Frequency
                  </label>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {config.waveSpeed.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="ctrl-wavespeed"
                  type="range"
                  min={0.2}
                  max={2.0}
                  step={0.05}
                  value={config.waveSpeed}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      waveSpeed: parseFloat(e.target.value),
                    }))
                  }
                  className="cyber-slider"
                />
              </div>

              {/* Control 6: Camera Floating Glide Velocity */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="ctrl-drift" className="text-slate-300 font-medium">
                    Camera Float Speed
                  </label>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {config.driftSpeed.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="ctrl-drift"
                  type="range"
                  min={0.0}
                  max={2.5}
                  step={0.05}
                  value={config.driftSpeed}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      driftSpeed: parseFloat(e.target.value),
                    }))
                  }
                  className="cyber-slider"
                />
              </div>

              <div className="mb-4 p-3 bg-white/[0.04] border border-white/10 rounded-lg space-y-3">
                <button
                  type="button"
                  onClick={handleToggleCameraDrift}
                  aria-pressed={config.autoCameraDrift}
                  className={`w-full px-3 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                    config.autoCameraDrift
                      ? 'bg-cyan-400/20 border-cyan-400/60 text-cyan-100'
                      : 'bg-black/40 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  Auto Camera Drift {config.autoCameraDrift ? 'On' : 'Off'}
                </button>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Sweeps the view and altitude back and forth between each min and max. Manual altitude or Dive/Surface takes over. Zero speed holds a motion.
                </p>
                {([
                  {
                    title: 'Look Around',
                    idPrefix: 'ctrl-look',
                    speed: 'cameraLookRate',
                    min: 'cameraLookMin',
                    max: 'cameraLookMax',
                    range: [-90, 90, 1],
                    format: (v: number) => (v === 0 ? '0°' : `${Math.abs(v).toFixed(0)}° ${v < 0 ? 'left' : 'right'}`),
                  },
                  {
                    title: 'Elevation',
                    idPrefix: 'ctrl-elevation',
                    speed: 'cameraElevationRate',
                    min: 'cameraElevationMin',
                    max: 'cameraElevationMax',
                    range: [-8, 6, 0.1],
                    format: (v: number) => (v < 0 ? `${(-v).toFixed(1)}m below` : `${v.toFixed(1)}m above`),
                  },
                ] as const).map(({ title, idPrefix, speed, min, max, range, format }) => (
                  <fieldset key={title} className="space-y-2 pt-2 border-t border-white/10">
                    <legend className="text-[11px] uppercase tracking-wider text-slate-400 pt-2">{title}</legend>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <label htmlFor={`${idPrefix}-speed`} className="text-slate-300 font-medium">Speed</label>
                        <span className="font-mono tabular-nums text-cyan-300">{config[speed].toFixed(2)}x</span>
                      </div>
                      <input
                        id={`${idPrefix}-speed`}
                        type="range"
                        min={0}
                        max={3}
                        step={0.05}
                        value={config[speed]}
                        onChange={(e) => setConfig((prev) => ({ ...prev, [speed]: parseFloat(e.target.value) }))}
                        className="cyber-slider"
                      />
                    </div>
                    {([
                      ['Min', min, max, Math.max] as const,
                      ['Max', max, min, Math.min] as const,
                    ]).map(([label, field, other, keepOrdered]) => (
                      <div key={field}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <label htmlFor={`${idPrefix}-${label.toLowerCase()}`} className="text-slate-300 font-medium">
                            {label}
                          </label>
                          <span className="font-mono tabular-nums text-cyan-300">{format(config[field])}</span>
                        </div>
                        <input
                          id={`${idPrefix}-${label.toLowerCase()}`}
                          type="range"
                          min={range[0]}
                          max={range[1]}
                          step={range[2]}
                          value={config[field]}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            // Push the opposite bound along so min never exceeds max
                            setConfig((prev) => ({ ...prev, [field]: value, [other]: keepOrdered(prev[other], value) }));
                          }}
                          className="cyber-slider"
                        />
                      </div>
                    ))}
                  </fieldset>
                ))}
              </div>

              {/* Control 7: Camera Altitude */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="ctrl-altitude" className="text-slate-300 font-medium">
                    {config.autoCameraDrift ? 'Manual Altitude (takes over)' : isSubmerged ? 'Dive Depth' : 'Camera Altitude'}
                  </label>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {config.autoCameraDrift
                      ? 'Auto'
                      : isSubmerged
                      ? `${(-config.cameraAltitude).toFixed(1)}m below`
                      : `${config.cameraAltitude.toFixed(1)}m`}
                  </span>
                </div>
                <input
                  id="ctrl-altitude"
                  type="range"
                  min={-8.0}
                  max={6.0}
                  step={0.1}
                  value={config.cameraAltitude}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      autoCameraDrift: false,
                      cameraAltitude: parseFloat(e.target.value),
                    }))
                  }
                  className="cyber-slider"
                />
              </div>

              {/* Control 7b: Mouse Influence & Parallax Range */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="ctrl-mouse" className="text-slate-300 font-medium">
                    Mouse Parallax Range
                  </label>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {Math.round(config.mouseInfluence * 100)}%
                  </span>
                </div>
                <input
                  id="ctrl-mouse"
                  type="range"
                  min={0.0}
                  max={2.0}
                  step={0.05}
                  value={config.mouseInfluence}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      mouseInfluence: parseFloat(e.target.value),
                    }))
                  }
                  className="cyber-slider"
                />
              </div>

              {/* Control 8: Cyber-Dream Shimmer */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="ctrl-cyber" className="text-slate-300 font-medium">
                    Cyber-Dream Shimmer
                  </label>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {Math.round(config.cyberDreamIntensity * 100)}%
                  </span>
                </div>
                <input
                  id="ctrl-cyber"
                  type="range"
                  min={0.0}
                  max={1.0}
                  step={0.02}
                  value={config.cyberDreamIntensity}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      cyberDreamIntensity: parseFloat(e.target.value),
                    }))
                  }
                  className="cyber-slider"
                />
              </div>

              {/* Control 9: Bioluminescent Creatures Frequency & Summon */}
              <div className="p-3 bg-white/[0.04] border border-white/10 rounded-lg space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="ctrl-creatures" className="text-slate-200 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Bioluminescent Fauna</span>
                  </label>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {Math.round(config.creatureActivity * 100)}%
                  </span>
                </div>

                <input
                  id="ctrl-creatures"
                  type="range"
                  min={0.0}
                  max={2.0}
                  step={0.05}
                  value={config.creatureActivity}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      creatureActivity: parseFloat(e.target.value),
                    }))
                  }
                  className="cyber-slider"
                />

                <button
                  type="button"
                  onClick={() => {
                    if (config.creatureActivity < 0.2) {
                      setConfig((prev) => ({ ...prev, creatureActivity: 1.0 }));
                    }
                    setSummonSignal((s) => s + 1);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/15 border border-white/10 rounded-md text-white transition-colors whitespace-nowrap cursor-pointer"
                  title="Make a bioluminescent fish leap from the waves"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Summon Sighting</span>
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
