// Ultron Voice Synthesizer & Procedural Cyber Audio Effects

class UltronAudioEngine {
  private audioCtx: AudioContext | null = null;
  private isSpeaking = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private animFrameId = 0;
  private subRumbleOsc: OscillatorNode | null = null;
  private subRumbleGain: GainNode | null = null;
  private echoDelayNode: DelayNode | null = null;
  private echoFeedbackNode: GainNode | null = null;
  private echoGainNode: GainNode | null = null;

  private getContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // Play power-up / online sound
  playPowerUp(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Deep sub-bass swell
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(40, now);
      sub.frequency.exponentialRampToValueAtTime(140, now + 1.2);
      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(0.25, now + 0.4);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 1.6);

      // Sci-fi high resonant chime
      const chime = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(320, now + 0.2);
      chime.frequency.exponentialRampToValueAtTime(980, now + 0.8);
      chimeGain.gain.setValueAtTime(0.001, now + 0.2);
      chimeGain.gain.linearRampToValueAtTime(0.2, now + 0.6);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      chime.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chime.start(now + 0.2);
      chime.stop(now + 1.4);
    } catch (e) {
      console.warn('Audio power-up failed:', e);
    }
  }

  // Play high-tech unlock sound
  playUnlock(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      [440, 660, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.18, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.25);
      });
    } catch (e) {
      console.warn('Audio unlock failed:', e);
    }
  }

  // Play locking sound
  playLock(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      [880, 580, 320].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.12, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.2);
      });
    } catch (e) {
      console.warn('Audio lock failed:', e);
    }
  }

  // Play app launch cyber chirp
  playAppLaunch(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      console.warn('Audio app launch failed:', e);
    }
  }

  // Play glitch sound
  playGlitch(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(75, now);
      osc.frequency.linearRampToValueAtTime(25, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {
      console.warn('Audio glitch failed:', e);
    }
  }

  // Start deep chest resonance and subtle spatial echo reflections
  private startDeepVoiceAtmosphere(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // 1. Dual-loop Spatial Slapback Delay (~160ms delay with 22% feedback for subtle echo)
      this.echoDelayNode = ctx.createDelay(1.0);
      this.echoDelayNode.delayTime.setValueAtTime(0.165, now);

      this.echoFeedbackNode = ctx.createGain();
      this.echoFeedbackNode.gain.setValueAtTime(0.22, now); // Tiny portion of echo

      const echoFilter = ctx.createBiquadFilter();
      echoFilter.type = 'lowpass';
      echoFilter.frequency.setValueAtTime(800, now); // Warm room acoustic roll-off

      this.echoGainNode = ctx.createGain();
      this.echoGainNode.gain.setValueAtTime(0.001, now);
      this.echoGainNode.gain.linearRampToValueAtTime(0.12, now + 0.15); // Subtle, high-end presence

      // Connect delay feedback loop: Delay -> Filter -> Feedback -> Delay
      this.echoDelayNode.connect(echoFilter);
      echoFilter.connect(this.echoFeedbackNode);
      this.echoFeedbackNode.connect(this.echoDelayNode);

      // Send filtered echo to master output
      echoFilter.connect(this.echoGainNode);
      this.echoGainNode.connect(ctx.destination);

      // 2. Subharmonic chest resonance (gives the voice low-end physical weight)
      this.subRumbleOsc = ctx.createOscillator();
      this.subRumbleGain = ctx.createGain();

      this.subRumbleOsc.type = 'sine';
      this.subRumbleOsc.frequency.setValueAtTime(48, now); // 48Hz deep subwoofer rumble

      this.subRumbleGain.gain.setValueAtTime(0.001, now);
      this.subRumbleGain.gain.linearRampToValueAtTime(0.07, now + 0.2);

      this.subRumbleOsc.connect(this.subRumbleGain);
      this.subRumbleGain.connect(ctx.destination);
      this.subRumbleGain.connect(this.echoDelayNode); // Send subtle subharmonic tail into echo

      this.subRumbleOsc.start();
    } catch (e) {
      // AudioContext fallback
    }
  }

  // Trigger subtle formant reflection into echo line as words are spoken
  private triggerEchoReflection(energy: number): void {
    if (!this.audioCtx || !this.echoDelayNode) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      // Low formant chord reflection
      osc.frequency.setValueAtTime(110 + Math.random() * 60, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.04 * energy, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.echoDelayNode);
      osc.start(now);
      osc.stop(now + 0.26);
    } catch {
      // Ignore
    }
  }

  private stopDeepVoiceAtmosphere(): void {
    try {
      if (this.audioCtx) {
        const now = this.audioCtx.currentTime;
        if (this.subRumbleGain) {
          this.subRumbleGain.gain.linearRampToValueAtTime(0.001, now + 0.15);
        }
        if (this.echoGainNode) {
          this.echoGainNode.gain.linearRampToValueAtTime(0.001, now + 0.35); // Allow echo to naturally fade out
        }
      }
      setTimeout(() => {
        try {
          this.subRumbleOsc?.stop();
          this.subRumbleOsc?.disconnect();
          this.subRumbleGain?.disconnect();
          this.echoDelayNode?.disconnect();
          this.echoFeedbackNode?.disconnect();
          this.echoGainNode?.disconnect();
          this.subRumbleOsc = null;
          this.subRumbleGain = null;
          this.echoDelayNode = null;
          this.echoFeedbackNode = null;
          this.echoGainNode = null;
        } catch {
          // Ignore
        }
      }, 400);
    } catch {
      // Ignore
    }
  }

  /**
   * Speak with Dark's deep, commanding villain voice and subtle spatial echo
   */
  speak(
    text: string,
    callbacks?: {
      onStart?: () => void;
      onEnd?: () => void;
      onEnergy?: (volume: number) => void;
    }
  ): void {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported');
      callbacks?.onEnd?.();
      return;
    }

    // Cancel ongoing speech
    window.speechSynthesis.cancel();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.stopDeepVoiceAtmosphere();

    const utterance = new SpeechSynthesisUtterance(text);
    this.currentUtterance = utterance;

    // Pick deepest, lowest male voice available in system
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      (v.name.includes('Google UK English Male') ||
       v.name.includes('Daniel') ||
       v.name.includes('Arthur') ||
       v.name.includes('Oliver') ||
       v.name.includes('George') ||
       v.name.includes('David') ||
       v.name.includes('Male') ||
       v.name.includes('Fred') ||
       (v.lang.startsWith('en') && v.name.toLowerCase().includes('deep')) ||
       (v.lang.startsWith('en') && v.name.toLowerCase().includes('male')))
    ) || voices.find(v => v.lang.startsWith('en-GB') || v.lang.startsWith('en-US')) || voices[0];

    if (preferred) {
      utterance.voice = preferred;
    }

    // Extra deep pitch with measured, menacing cadence
    utterance.pitch = 0.40; // Deep, commanding bass resonance
    utterance.rate = 0.84;  // Deliberate, calculating cadence
    utterance.volume = 1.0;

    let energyStep = 0;
    const runEnergyLoop = () => {
      if (!this.isSpeaking) {
        callbacks?.onEnergy?.(0);
        return;
      }
      energyStep += 0.25;
      const basePulse = Math.sin(energyStep) * 0.4 + Math.cos(energyStep * 2.3) * 0.3 + 0.35;
      const energy = Math.max(0.15, Math.min(1.0, basePulse + Math.random() * 0.2));

      // Trigger subtle spatial echo reflections into the delay line on speech cadences
      if (energy > 0.62 && Math.random() > 0.55) {
        this.triggerEchoReflection(energy);
      }

      callbacks?.onEnergy?.(energy);
      this.animFrameId = requestAnimationFrame(runEnergyLoop);
    };

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.startDeepVoiceAtmosphere();
      callbacks?.onStart?.();
      runEnergyLoop();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.stopDeepVoiceAtmosphere();
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
      }
      callbacks?.onEnergy?.(0);
      callbacks?.onEnd?.();
      this.currentUtterance = null;
    };

    utterance.onerror = (e) => {
      console.warn('Dark speech error:', e);
      this.isSpeaking = false;
      this.stopDeepVoiceAtmosphere();
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
      }
      callbacks?.onEnergy?.(0);
      callbacks?.onEnd?.();
      this.currentUtterance = null;
    };

    window.speechSynthesis.speak(utterance);
  }

  stopSpeech(): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.stopDeepVoiceAtmosphere();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }
}

export const ultronAudio = new UltronAudioEngine();
