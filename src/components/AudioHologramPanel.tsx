import React, { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { Mic, MicOff, Activity, Radio, Volume2 } from "lucide-react";

interface AudioHologramPanelProps {
  isListening?: boolean;
  isSpeaking?: boolean;
  speechEnergy?: number;
  onAudioLevel?: (level: number) => void;
}

export const AudioHologramPanel: React.FC<AudioHologramPanelProps> = ({
  isListening = false,
  isSpeaking = false,
  speechEnergy = 0,
  onAudioLevel,
}) => {
  const [isMicActive, setIsMicActive] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [dbLevel, setDbLevel] = useState(-60);
  const [peakFreq, setPeakFreq] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number>(0);
  const peakCapsRef = useRef<number[]>(new Array(32).fill(0));

  // Start live microphone stream
  const startMicStream = useCallback(async () => {
    try {
      if (streamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; // Yields 32 frequency bins
      analyser.smoothingTimeConstant = 0.82;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsMicActive(true);
    } catch (err) {
      console.warn("Microphone access for EQ panel denied/unavailable:", err);
      setIsMicActive(false);
    }
  }, []);

  // Stop microphone stream
  const stopMicStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsMicActive(false);
  }, []);

  // Automatically start when parent is listening or user clicks
  useEffect(() => {
    if (isListening && !isMicActive) {
      startMicStream();
    }
  }, [isListening, isMicActive, startMicStream]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopMicStream();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [stopMicStream]);

  // D3.js Render Loop
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = 280;
    const height = 140;
    const barCount = 28;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    // Defs: Gradients and Glow filters
    const defs = svg.append("defs");

    // Cyan to Violet bar gradient
    const barGradient = defs
      .append("linearGradient")
      .attr("id", "eqBarGradient")
      .attr("x1", "0%")
      .attr("y1", "100%")
      .attr("x2", "0%")
      .attr("y2", "0%");

    barGradient.append("stop").attr("offset", "0%").attr("stop-color", "#38bdf8").attr("stop-opacity", 0.4);
    barGradient.append("stop").attr("offset", "60%").attr("stop-color", "#818cf8").attr("stop-opacity", 0.85);
    barGradient.append("stop").attr("offset", "100%").attr("stop-color", "#00f0ff").attr("stop-opacity", 1.0);

    // Glowing wave gradient
    const waveGradient = defs
      .append("linearGradient")
      .attr("id", "eqWaveGradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%");

    waveGradient.append("stop").attr("offset", "0%").attr("stop-color", "#38bdf8").attr("stop-opacity", 0.2);
    waveGradient.append("stop").attr("offset", "50%").attr("stop-color", "#a855f7").attr("stop-opacity", 0.9);
    waveGradient.append("stop").attr("offset", "100%").attr("stop-color", "#00f0ff").attr("stop-opacity", 0.3);

    // Background decorative grid lines
    const gridG = svg.append("g").attr("class", "grid-lines").attr("opacity", 0.15);
    for (let y = 20; y < height - 15; y += 25) {
      gridG
        .append("line")
        .attr("x1", 10)
        .attr("y1", y)
        .attr("x2", width - 10)
        .attr("y2", y)
        .attr("stroke", "#38bdf8")
        .attr("stroke-dasharray", "2,3")
        .attr("stroke-width", 1);
    }

    // D3 groups for dynamic elements
    const barsG = svg.append("g").attr("class", "eq-bars");
    const capsG = svg.append("g").attr("class", "eq-caps");
    const wavePath = svg
      .append("path")
      .attr("class", "eq-wave")
      .attr("fill", "none")
      .attr("stroke", "url(#eqWaveGradient)")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.75);

    // Baseline axis
    svg
      .append("line")
      .attr("x1", 8)
      .attr("y1", height - 12)
      .attr("x2", width - 8)
      .attr("y2", height - 12)
      .attr("stroke", "#38bdf8")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-width", 1);

    const freqData = new Uint8Array(32);
    const timeData = new Uint8Array(32);

    const xScale = d3
      .scaleLinear()
      .domain([0, barCount - 1])
      .range([12, width - 18]);

    const yScale = d3
      .scaleLinear()
      .domain([0, 255])
      .range([height - 12, 18]);

    const barWidth = Math.max(3, (width - 36) / barCount - 2.5);

    // Animation frame render loop
    let t = 0;
    const render = () => {
      t += 0.05;

      let values: number[] = [];
      let currentMax = 0;
      let sumSquares = 0;

      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freqData);
        analyserRef.current.getByteTimeDomainData(timeData);

        for (let i = 0; i < barCount; i++) {
          const val = freqData[i] || 0;
          values.push(val);
          if (val > currentMax) currentMax = val;
          const norm = (val - 128) / 128;
          sumSquares += norm * norm;
        }

        // Calculate real dB level
        const rms = Math.sqrt(sumSquares / barCount);
        const calculatedDb = rms > 0 ? Math.max(-60, Math.min(0, 20 * Math.log10(rms))) : -60;
        setDbLevel(Math.round(calculatedDb));
        setPeakFreq(Math.round((currentMax / 255) * 8000));

        if (onAudioLevel) {
          onAudioLevel(rms * 1.5);
        }
      } else {
        // Synthesizer or ambient cybernetic frequency emulation
        const energy = isSpeaking ? speechEnergy : 0.12;
        for (let i = 0; i < barCount; i++) {
          const wave = Math.sin(t * 3 + i * 0.45) * 0.5 + 0.5;
          const wave2 = Math.cos(t * 1.8 - i * 0.3) * 0.5 + 0.5;
          const ambientVal = (wave * 0.6 + wave2 * 0.4) * (energy * 220 + 25);
          values.push(Math.min(255, ambientVal));
        }
        setDbLevel(isSpeaking ? Math.round(-30 + speechEnergy * 25) : -54);
        setPeakFreq(Math.round(1200 + Math.sin(t) * 800));
      }

      // Update D3 Bars
      const bars = barsG.selectAll<SVGRectElement, number>("rect").data(values);

      bars
        .enter()
        .append("rect")
        .attr("width", barWidth)
        .attr("rx", 1.5)
        .attr("fill", "url(#eqBarGradient)")
        .merge(bars)
        .attr("x", (_, i) => xScale(i))
        .attr("y", (d) => yScale(d))
        .attr("height", (d) => Math.max(1.5, height - 12 - yScale(d)));

      bars.exit().remove();

      // Update Peak Floating Caps
      const caps = peakCapsRef.current;
      values.forEach((v, i) => {
        if (v > caps[i]) {
          caps[i] = v;
        } else {
          caps[i] = Math.max(0, caps[i] - 3.2); // Smooth gravity drop
        }
      });

      const capElements = capsG.selectAll<SVGRectElement, number>("rect").data(values.map((_, i) => caps[i]));

      capElements
        .enter()
        .append("rect")
        .attr("width", barWidth)
        .attr("height", 1.8)
        .attr("rx", 0.5)
        .attr("fill", "#00f0ff")
        .attr("opacity", 0.95)
        .merge(capElements)
        .attr("x", (_, i) => xScale(i))
        .attr("y", (d) => Math.max(16, yScale(d) - 3));

      capElements.exit().remove();

      // Update Oscilloscope Curved Waveform Line
      const waveLineGenerator = d3
        .line<number>()
        .x((_, i) => xScale(i) + barWidth / 2)
        .y((d) => Math.max(14, yScale(d) - 6))
        .curve(d3.curveMonotoneX);

      wavePath.attr("d", waveLineGenerator(values));

      rafIdRef.current = requestAnimationFrame(render);
    };

    rafIdRef.current = requestAnimationFrame(render);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isMicActive, isSpeaking, speechEnergy, onAudioLevel]);

  return (
    <div className="fixed top-24 left-6 z-30 font-mono select-none pointer-events-auto">
      {/* Holographic Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 border border-sky-400/25 rounded-t-lg backdrop-blur-md text-[10px] text-sky-400 opacity-80 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1.5">
          <Activity size={12} className={isMicActive ? "animate-pulse text-sky-300" : "text-sky-500"} />
          <span className="font-bold tracking-widest">AUDIO SPECTRUM ANALYZER</span>
          <span className="text-[9px] text-sky-400/60">
            {isMicActive ? "[LIVE MIC]" : isSpeaking ? "[SYNTH]" : "[STANDBY]"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={isMicActive ? stopMicStream : startMicStream}
            className={`p-1 rounded text-[9px] border transition flex items-center gap-1 ${
              isMicActive
                ? "bg-red-950/40 border-red-500/50 text-red-400"
                : "bg-sky-950/30 border-sky-400/30 text-sky-300 hover:bg-sky-900/40"
            }`}
            title={isMicActive ? "Disable live mic equalizer" : "Enable live microphone stream"}
          >
            {isMicActive ? <Mic size={10} /> : <MicOff size={10} />}
            <span>{isMicActive ? "ACTIVE" : "LINK MIC"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-[9px] text-sky-400/70 hover:text-sky-200 px-1"
            title={isCollapsed ? "Expand panel" : "Collapse panel"}
          >
            {isCollapsed ? "[+]" : "[-]"}
          </button>
        </div>
      </div>

      {/* Main Holographic SVG Panel */}
      {!isCollapsed && (
        <div className="relative bg-black/35 border-x border-b border-sky-400/25 rounded-b-lg backdrop-blur-md p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] opacity-75 hover:opacity-100 transition-opacity">
          {/* Cybernetic Corner Reticles */}
          <div className="absolute top-1 left-1 text-[8px] text-sky-400/40">+</div>
          <div className="absolute top-1 right-1 text-[8px] text-sky-400/40">+</div>
          <div className="absolute bottom-1 left-1 text-[8px] text-sky-400/40">+</div>
          <div className="absolute bottom-1 right-1 text-[8px] text-sky-400/40">+</div>

          {/* D3 SVG Equalizer */}
          <svg
            ref={svgRef}
            width={280}
            height={140}
            className="w-full h-auto overflow-visible block"
            style={{ filter: "drop-shadow(0 0 6px rgba(56,189,248,0.25))" }}
          />

          {/* Holographic Telemetry HUD Footer */}
          <div className="flex items-center justify-between pt-1.5 border-t border-sky-400/15 text-[9px] text-sky-300/70">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              PEAK: {peakFreq} Hz
            </span>
            <span>GAIN: {dbLevel} dB</span>
            <span className="text-sky-400/50">FFT: 32 BINS</span>
          </div>
        </div>
      )}
    </div>
  );
};
