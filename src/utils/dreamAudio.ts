/**
 * Procedural Web Audio API Cyber-Dream Ambient Synthesizer
 * Slowly cycles through a lush, voice-led 6-chord ambient progression
 * (Fmaj9 -> Em11 -> Dm9 -> Cmaj9 -> Bbmaj7#11 -> Am9) with overlapping
 * polyphonic pad swells, delicate upper-extension harmonic chimes,
 * stereo ping-pong delay, and ocean-swell low-pass filter modulation.
 */

export interface AmbientChord {
  name: string;
  /** 7-voice voicing from deep sub-bass root up to 9th/11th extensions (Hz) */
  frequencies: number[];
  /** Upper-register shimmer notes for gentle staggered harmonic bells (Hz) */
  shimmerNotes: number[];
}

export const DREAM_CHORD_PROGRESSION: AmbientChord[] = [
  {
    name: 'Fmaj9',
    // F2, C3, F3, A3, C4, E4, G4
    frequencies: [87.31, 130.81, 174.61, 220.0, 261.63, 329.63, 392.0],
    shimmerNotes: [523.25, 659.25, 783.99], // C5, E5, G5
  },
  {
    name: 'Em11',
    // E2, B2, E3, G3, B3, D4, F#4
    frequencies: [82.41, 123.47, 164.81, 196.0, 246.94, 293.66, 369.99],
    shimmerNotes: [493.88, 587.33, 739.99], // B4, D5, F#5
  },
  {
    name: 'Dm9',
    // D2, A2, D3, F3, A3, C4, E4
    frequencies: [73.42, 110.0, 146.83, 174.61, 220.0, 261.63, 329.63],
    shimmerNotes: [440.0, 523.25, 659.25], // A4, C5, E5
  },
  {
    name: 'Cmaj9',
    // C2, G2, C3, E3, G3, B3, D4
    frequencies: [65.41, 98.0, 130.81, 164.81, 196.0, 246.94, 293.66],
    shimmerNotes: [392.0, 493.88, 587.33], // G4, B4, D5
  },
  {
    name: 'Bbmaj7#11',
    // Bb1, F2, Bb2, D3, F3, A3, C4
    frequencies: [58.27, 87.31, 116.54, 146.83, 174.61, 220.0, 261.63],
    shimmerNotes: [440.0, 523.25, 587.33], // A4, C5, D5
  },
  {
    name: 'Am9',
    // A1, E2, A2, C3, E3, G3, B3
    frequencies: [55.0, 82.41, 110.0, 130.81, 164.81, 196.0, 246.94],
    shimmerNotes: [392.0, 493.88, 659.25], // G4, B4, E5
  },
];

export class CyberDreamAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muffleFilter: BiquadFilterNode | null = null;
  private submerged = false;
  private padBus: BiquadFilterNode | null = null;
  private shimmerBus: GainNode | null = null;
  private isPlaying = false;
  private chordIndex = 0;
  private chordTimer: number | null = null;
  private activeOscillators: Set<OscillatorNode> = new Set();
  private lfoNodes: OscillatorNode[] = [];

  /** Duration in seconds before advancing to the next chord in the cycle */
  private readonly chordStepSeconds = 8.5;

  public toggle(): boolean {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public start(): void {
    if (this.isPlaying) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    // Master output with gentle fade-in
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.001, now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.2, now + 2.2);

    // Low-pass muffling applied while the camera is underwater
    this.muffleFilter = this.ctx.createBiquadFilter();
    this.muffleFilter.type = 'lowpass';
    this.muffleFilter.Q.setValueAtTime(0.9, now);
    this.muffleFilter.frequency.setValueAtTime(this.submerged ? 480 : 18000, now);
    this.masterGain.connect(this.muffleFilter);
    this.muffleFilter.connect(this.ctx.destination);

    // Stereo feedback delay network for spacious lunar-sea atmosphere
    const delayLeft = this.ctx.createDelay(2.0);
    const delayRight = this.ctx.createDelay(2.0);
    delayLeft.delayTime.setValueAtTime(0.46, now);
    delayRight.delayTime.setValueAtTime(0.68, now);

    const feedbackLeft = this.ctx.createGain();
    const feedbackRight = this.ctx.createGain();
    feedbackLeft.gain.setValueAtTime(0.36, now);
    feedbackRight.gain.setValueAtTime(0.36, now);

    const delayFilter = this.ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.setValueAtTime(1100, now);

    const wetGain = this.ctx.createGain();
    wetGain.gain.setValueAtTime(0.32, now);

    delayLeft.connect(feedbackLeft);
    feedbackLeft.connect(delayRight);
    delayRight.connect(feedbackRight);
    feedbackRight.connect(delayFilter);
    delayFilter.connect(delayLeft);

    delayLeft.connect(wetGain);
    delayRight.connect(wetGain);
    wetGain.connect(this.masterGain);

    // Warm low-pass filter on the chord pad bus modulated by an ocean-swell LFO
    this.padBus = this.ctx.createBiquadFilter();
    this.padBus.type = 'lowpass';
    this.padBus.frequency.setValueAtTime(420, now);
    this.padBus.Q.setValueAtTime(1.4, now);
    this.padBus.connect(this.masterGain);
    this.padBus.connect(delayLeft);

    // Shimmer bell bus feeding both master and stereo delay
    this.shimmerBus = this.ctx.createGain();
    this.shimmerBus.gain.setValueAtTime(0.45, now);
    this.shimmerBus.connect(this.masterGain);
    this.shimmerBus.connect(delayLeft);
    this.shimmerBus.connect(delayRight);

    // Slow breathing LFO on the pad low-pass cutoff
    const filterLfo = this.ctx.createOscillator();
    const filterLfoGain = this.ctx.createGain();
    filterLfo.type = 'sine';
    filterLfo.frequency.setValueAtTime(0.11, now); // ~9s ocean swell cycle
    filterLfoGain.gain.setValueAtTime(190, now);
    filterLfo.connect(filterLfoGain);
    filterLfoGain.connect(this.padBus.frequency);
    filterLfo.start(now);
    this.lfoNodes.push(filterLfo);

    this.isPlaying = true;

    // Trigger the first chord immediately, then schedule the slow progression cycle
    this.triggerChordSwell(DREAM_CHORD_PROGRESSION[this.chordIndex]);

    this.chordTimer = window.setInterval(() => {
      if (!this.isPlaying) return;
      this.chordIndex = (this.chordIndex + 1) % DREAM_CHORD_PROGRESSION.length;
      this.triggerChordSwell(DREAM_CHORD_PROGRESSION[this.chordIndex]);
    }, this.chordStepSeconds * 1000);
  }

  /**
   * Blooms a single polyphonic chord pad with a long overlapping attack & release
   * so consecutive chords crossfade seamlessly, accompanied by soft harmonic chimes.
   */
  private triggerChordSwell(chord: AmbientChord): void {
    if (!this.ctx || !this.padBus || !this.shimmerBus || !this.isPlaying) return;

    const now = this.ctx.currentTime;
    const attack = 3.8;
    const sustain = 3.4;
    const release = 5.2;
    const totalDuration = attack + sustain + release;

    // Envelope for this entire chord layer
    const chordEnvelope = this.ctx.createGain();
    chordEnvelope.gain.setValueAtTime(0.0001, now);
    chordEnvelope.gain.linearRampToValueAtTime(1.0, now + attack);
    chordEnvelope.gain.setValueAtTime(1.0, now + attack + sustain);
    chordEnvelope.gain.exponentialRampToValueAtTime(0.0001, now + totalDuration);
    chordEnvelope.connect(this.padBus);

    // Spawn each voice in the 7-note voicing with subtle stereo spread & chorus detune
    chord.frequencies.forEach((freq, idx) => {
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const voiceGain = this.ctx.createGain();

      // Deep bass uses warm sine; mid/upper voices alternate triangle and sine
      osc.type = idx === 0 ? 'sine' : idx % 2 === 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      // Gentle analog drift detune per voice
      const detuneCents = (idx - 3) * 4.2 + (Math.random() - 0.5) * 2.5;
      osc.detune.setValueAtTime(detuneCents, now);

      // Voice balance: warm foundational bass + silky upper 9th/11th extensions
      const level = idx === 0 ? 0.19 : idx === 1 ? 0.14 : 0.075;
      voiceGain.gain.setValueAtTime(level, now);

      if (typeof this.ctx.createStereoPanner === 'function') {
        const panner = this.ctx.createStereoPanner();
        // Keep bass centered, spread upper chord extensions across the horizon
        const panPos = idx === 0 ? 0 : ((idx % 2 === 0 ? 1 : -1) * (idx * 0.11));
        panner.pan.setValueAtTime(Math.max(-0.75, Math.min(0.75, panPos)), now);
        osc.connect(voiceGain);
        voiceGain.connect(panner);
        panner.connect(chordEnvelope);
      } else {
        osc.connect(voiceGain);
        voiceGain.connect(chordEnvelope);
      }

      osc.start(now);
      osc.stop(now + totalDuration + 0.1);
      this.activeOscillators.add(osc);
      osc.onended = () => {
        this.activeOscillators.delete(osc);
        try {
          osc.disconnect();
        } catch {
          // ignore
        }
      };
    });

    // Trigger 2-3 delicate, staggered upper-extension harmonic chimes per chord change
    chord.shimmerNotes.forEach((noteFreq, idx) => {
      if (!this.ctx || !this.shimmerBus) return;

      const noteStart = now + 0.6 + idx * 1.85 + Math.random() * 0.35;
      const noteDuration = 4.2;

      const bellOsc = this.ctx.createOscillator();
      const bellGain = this.ctx.createGain();

      bellOsc.type = 'sine';
      bellOsc.frequency.setValueAtTime(noteFreq, noteStart);

      bellGain.gain.setValueAtTime(0.0001, noteStart);
      bellGain.gain.linearRampToValueAtTime(0.028, noteStart + 0.35);
      bellGain.gain.exponentialRampToValueAtTime(
        0.0001,
        noteStart + noteDuration
      );

      bellOsc.connect(bellGain);
      bellGain.connect(this.shimmerBus);

      bellOsc.start(noteStart);
      bellOsc.stop(noteStart + noteDuration + 0.05);
      this.activeOscillators.add(bellOsc);
      bellOsc.onended = () => {
        this.activeOscillators.delete(bellOsc);
        try {
          bellOsc.disconnect();
        } catch {
          // ignore
        }
      };
    });
  }

  /** Muffle the ambience when the camera slips beneath the surface. */
  public setSubmerged(submerged: boolean): void {
    if (submerged === this.submerged) return;
    this.submerged = submerged;
    if (!this.ctx || !this.muffleFilter) return;
    const now = this.ctx.currentTime;
    const freq = this.muffleFilter.frequency;
    freq.cancelScheduledValues(now);
    freq.setValueAtTime(freq.value, now);
    freq.exponentialRampToValueAtTime(submerged ? 480 : 18000, now + 1.6);
  }

  public stop(): void {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;

    if (this.chordTimer !== null) {
      clearInterval(this.chordTimer);
      this.chordTimer = null;
    }

    const now = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(
      Math.max(this.masterGain.gain.value, 0.001),
      now
    );
    this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

    const oscsToStop = Array.from(this.activeOscillators);
    const lfosToStop = [...this.lfoNodes];
    this.activeOscillators.clear();
    this.lfoNodes = [];
    this.isPlaying = false;

    setTimeout(() => {
      oscsToStop.forEach((o) => {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore already stopped
        }
      });
      lfosToStop.forEach((l) => {
        try {
          l.stop();
          l.disconnect();
        } catch {
          // ignore
        }
      });
    }, 900);
  }

  public dispose(): void {
    this.stop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
