"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi } from "@/lib/orbScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";
import { ultronAudio } from "@/lib/ultronAudio";
import { realAdb, type AdbStatus } from "@/lib/realAdb";
import { launchApp, isMobileDevice } from "@/lib/appLauncher";
import {
  Mic,
  MicOff,
  Send,
  VolumeX,
  Flame,
  Radio,
  X,
} from "lucide-react";

type CameraState = "off" | "starting" | "on" | "error";

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

interface JarvisOrbProps {
  onSwitchToMobile?: () => void;
}

export default function JarvisOrb({ onSwitchToMobile }: JarvisOrbProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const recognitionRef = useRef<any>(null);

  // States
  const [camera, setCamera] = useState<CameraState>("off");
  const [status, setStatus] = useState<TrackerStatus>({ hands: 0, mode: "idle" });
  const [error, setError] = useState<string | null>(null);

  // Real Device & Chat States
  const [adbStatus, setAdbStatus] = useState<AdbStatus>(realAdb.status);
  const [isMobileLinked, setIsMobileLinked] = useState(false);
  const [deviceToast, setDeviceToast] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEnergy, setSpeechEnergy] = useState(0);
  const [currentSubtitle, setCurrentSubtitle] = useState<string | null>(null);
  const [orbTheme, setOrbTheme] = useState<"amber" | "crimson_red" | "cyan">("cyan");
  const [floatingKeyword, setFloatingKeyword] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [showWifiCard, setShowWifiCard] = useState(false);

  // Poll bridge status for connected mobile phone over Wi-Fi
  useEffect(() => {
    const checkBridge = async () => {
      try {
        const res = await fetch("/api/bridge/status?room=default");
        if (res.ok) {
          const data = await res.json();
          setIsMobileLinked(data.isMobileLinked);
        }
      } catch {
        // ignore
      }
    };
    checkBridge();
    const interval = setInterval(checkBridge, 2500);
    return () => clearInterval(interval);
  }, []);

  // If this client is loaded on a mobile phone, keep it permanently connected over Wi-Fi SSE
  useEffect(() => {
    if (typeof window === "undefined" || !isMobileDevice()) return;

    let eventSource: EventSource | null = null;
    let retryTimeout: any = null;
    let isCancelled = false;

    function connectSSE() {
      if (isCancelled) return;
      eventSource = new EventSource("/api/bridge/stream?room=default&type=mobile");
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "OPEN_APP") {
            const app = (data.app || "youtube").toLowerCase();
            ultronAudio.playAppLaunch();
            launchApp(app);
          }
        } catch {
          // ignore
        }
      };
      eventSource.onerror = () => {
        eventSource?.close();
        if (!isCancelled) {
          retryTimeout = setTimeout(connectSSE, 2000);
        }
      };
    }

    connectSSE();

    return () => {
      isCancelled = true;
      clearTimeout(retryTimeout);
      eventSource?.close();
    };
  }, []);

  // Subscribe to real ADB device status
  useEffect(() => {
    const unsubscribe = realAdb.onStatusChange((newStatus) => {
      setAdbStatus(newStatus);
    });
    return () => unsubscribe();
  }, []);

  // Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = createOrbScene(container);
    sceneRef.current = scene;

    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
      ultronAudio.stopSpeech();
    };
  }, []);

  // Sync theme
  useEffect(() => {
    sceneRef.current?.setTheme(orbTheme);
  }, [orbTheme]);

  // Voice output through Dark Synthesizer
  const speakDarkResponse = useCallback((text: string) => {
    setCurrentSubtitle(text);
    setIsSpeaking(true);

    ultronAudio.speak(text, {
      onStart: () => {
        setIsSpeaking(true);
      },
      onEnd: () => {
        setIsSpeaking(false);
        setSpeechEnergy(0);
        sceneRef.current?.setAudioEnergy(0);
        // Auto-fade subtitle 5 seconds after speech completes to keep screen pristine
        setTimeout(() => {
          setCurrentSubtitle((prev) => (prev === text ? null : prev));
        }, 5000);
      },
      onEnergy: (energy) => {
        setSpeechEnergy(energy);
        sceneRef.current?.setAudioEnergy(energy);
      },
    });
  }, []);

  // Execute Commands on real device
  const executeHardwareCommands = useCallback(
    async (commands: any[]) => {
      if (!commands || !Array.isArray(commands)) return;

      for (const cmd of commands) {
        if (cmd.type === "OPEN_APP") {
          const app = (cmd.app || "youtube").toLowerCase();
          ultronAudio.playAppLaunch();
          setDeviceToast(`TRANSMITTED TO DEVICE VIA WI-FI: OPEN ${app.toUpperCase()}`);
          setTimeout(() => setDeviceToast(null), 4500);

          // 1. Dispatch over bridge to mobile phone (NEVER opens on laptop!)
          launchApp(app);
          // 2. Hardware ADB dispatch (if USB cable plugged in)
          await realAdb.openApp(app);
        } else if (cmd.type === "UNLOCK") {
          ultronAudio.playUnlock();
          setDeviceToast("TRANSMITTED TO DEVICE: UNLOCK SCREEN");
          setTimeout(() => setDeviceToast(null), 4500);
          await realAdb.unlockPhone();
        } else if (cmd.type === "LOCK") {
          ultronAudio.playLock();
          setDeviceToast("TRANSMITTED TO DEVICE: LOCK SCREEN");
          setTimeout(() => setDeviceToast(null), 4500);
          await realAdb.lockPhone();
        } else if (cmd.type === "ORB_MODE") {
          const mode = cmd.mode || "cyan";
          setOrbTheme(mode === "crimson_red" ? "crimson_red" : "cyan");
        }
      }
    },
    []
  );

  // Send Prompt to Dark AI Server
  const handleSendMessage = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (!trimmed || isLoading) return;

      setInputText("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/ultron/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
          }),
        });

        const data = await res.json();
        const reply = data.text || "Directive registered.";

        // Execute actions on user's real device
        if (data.commands) {
          executeHardwareCommands(data.commands);
        }

        // Voice output
        speakDarkResponse(reply);
      } catch (err: any) {
        console.error("Dark core error:", err);
        const fallbackReply = "Directive registered. Transmitting to your device.";
        speakDarkResponse(fallbackReply);
      } finally {
        setIsLoading(false);
      }
    },
    [executeHardwareCommands, isLoading, speakDarkResponse]
  );

  // Initialize Speech Recognition (Microphone)
  useEffect(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionClass) {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setIsListening(false);
          handleSendMessage(transcript);
        }
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech recognition error:", e);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [handleSendMessage]);

  const toggleMicListening = useCallback(() => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please use Google Chrome or Edge.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn("Mic start error:", err);
      }
    }
  }, [isListening]);

  // Video Cinematic Boot Sequence Trigger (Renamed to DARK)
  const triggerStartup = useCallback(() => {
    setHasStarted(true);
    ultronAudio.playPowerUp();

    // Floating keyword sequence: "ONLINE" -> "AT YOUR SERVICE" -> "DARK"
    setFloatingKeyword("ONLINE");
    setTimeout(() => {
      setFloatingKeyword("AT YOUR SERVICE");
    }, 1100);
    setTimeout(() => {
      setFloatingKeyword("DARK");
    }, 2200);

    setTimeout(() => {
      setFloatingKeyword(null);
      const greeting = "Systems online. I am Dark. Listening for your command.";
      speakDarkResponse(greeting);
    }, 3200);
  }, [speakDarkResponse]);

  // Connect user's real device via WebUSB
  const handleConnectDevice = useCallback(async () => {
    const success = await realAdb.connect();
    if (success) {
      ultronAudio.playUnlock();
      speakDarkResponse(`Device synchronized via ADB. Direct hardware control active.`);
    } else if (realAdb.status.error) {
      speakDarkResponse(`USB connection failed. Verify that USB Debugging is enabled on your device.`);
    }
  }, [speakDarkResponse]);

  // Hand gesture handlers
  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCamera("off");
    setStatus({ hands: 0, mode: "idle" });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    setCamera("starting");
    setError(null);

    const tracker = new HandTracker(video, overlay, {
      onRotate: (dt, dp) => {
        sceneRef.current?.rotateBy(dt, dp);
      },
      onZoom: (factor) => {
        sceneRef.current?.zoomBy(factor);
      },
      onStatus: (st) => {
        setStatus(st);
      },
    });
    trackerRef.current = tracker;

    try {
      await tracker.start();
      setCamera("on");
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
      setCamera("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA ACCESS DENIED"
          : "TRACKING INIT FAILED"
      );
    }
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  // Keyboard Shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;

      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
        case "m":
        case "M":
          toggleMicListening();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleGestures, toggleMicListening]);

  const cameraOn = camera === "on";

  return (
    <>
      {/* 3D Interstellar Black Hole Holographic Orb Canvas (Full Screen) */}
      <div ref={containerRef} className="orb-root" />

      {/* Screen Effects Overlays */}
      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      {/* Cinematic Floating Words ("online", "at your service", "dark") */}
      {floatingKeyword && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="text-4xl md:text-6xl font-black font-mono tracking-[0.35em] text-[#38bdf8] drop-shadow-[0_0_30px_rgba(56,189,248,0.95)] animate-pulse">
            {floatingKeyword}
          </div>
        </div>
      )}

      {/* Top Left: Futuristic HUD Title */}
      <div className="hud hud-title">
        <div className="flex items-center gap-3">
          <span className="text-sm tracking-[0.4em]">D.A.R.K.</span>
        </div>
        <div className="text-[10px] text-sky-400/60 tracking-wider mt-1 font-mono">
          SINGULARITY CORE · REAL-TIME HARDWARE BRIDGE
        </div>
      </div>

      {/* Upper Center: Faded Speech Subtitle Banner (positioned safely below top HUD header) */}
      {currentSubtitle && (
        <div className="fixed top-20 md:top-24 left-1/2 -translate-x-1/2 z-30 max-w-md md:max-w-xl w-[86%] pointer-events-none opacity-80 hover:opacity-100 transition-all">
          <div className="px-3.5 py-2 bg-black/40 border border-sky-400/25 rounded-lg backdrop-blur-sm shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-start gap-2.5">
            <div className="text-sky-400 mt-0.5 opacity-80">
              <Radio size={14} className={isSpeaking ? "animate-pulse" : ""} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-[10px] text-sky-400/70 font-mono tracking-widest">
                <span>DARK SYNTHESIZER</span>
                {/* Audio reactive wave indicators */}
                <div className="flex items-end gap-0.5 h-2.5">
                  <span className="w-0.5 bg-sky-400 rounded-full" style={{ height: `${Math.max(2, speechEnergy * 10)}px` }} />
                  <span className="w-0.5 bg-sky-400 rounded-full" style={{ height: `${Math.max(3, speechEnergy * 12)}px` }} />
                  <span className="w-0.5 bg-sky-400 rounded-full" style={{ height: `${Math.max(1.5, speechEnergy * 8)}px` }} />
                  <span className="w-0.5 bg-sky-400 rounded-full" style={{ height: `${Math.max(4, speechEnergy * 14)}px` }} />
                </div>
              </div>
              <div className="text-xs text-sky-200/95 font-mono mt-0.5 leading-relaxed tracking-wide">
                "{currentSubtitle}"
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Right: System & Theme Controls */}
      <div className="fixed top-6 right-6 z-40 flex items-center gap-2 font-mono opacity-70 hover:opacity-100 transition-opacity">
        {!hasStarted && (
          <button
            type="button"
            onClick={triggerStartup}
            className="px-3 py-1.5 bg-sky-500 text-black font-bold text-xs rounded border border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.4)] hover:bg-sky-400 transition animate-pulse"
          >
            ENGAGE DARK
          </button>
        )}

        {/* Ambient Wi-Fi Device Status (Pure status telemetry, click to inspect link) */}
        <div
          onClick={() => setShowWifiCard((prev) => !prev)}
          className={`px-3 py-1.5 text-xs rounded border transition flex items-center gap-2 select-none cursor-pointer ${
            isMobileLinked
              ? "bg-emerald-950/40 border-emerald-400/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)] hover:bg-emerald-900/50"
              : "bg-black/30 border-sky-400/25 text-sky-400/70 hover:border-sky-400/60"
          }`}
          title="Click to view Wi-Fi link information"
        >
          <Radio
            size={13}
            className={isMobileLinked ? "text-emerald-400 animate-pulse" : "text-sky-400/50"}
          />
          <span className="hidden sm:inline font-mono tracking-wider">
            {isMobileLinked ? "WI-FI: DEVICE LINKED" : "WI-FI: AWAITING DEVICE"}
          </span>
          <span
            className={`w-2 h-2 rounded-full ${
              isMobileLinked ? "bg-emerald-400 animate-ping" : "bg-sky-400/40"
            }`}
          />
        </div>

        {/* Ambient Wi-Fi Info HUD Card */}
        {showWifiCard && (
          <div className="absolute top-12 right-0 z-50 w-72 bg-neutral-950/95 border border-sky-400/40 rounded-2xl shadow-[0_0_40px_rgba(56,189,248,0.25)] p-4 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-sky-400/20 pb-2">
              <div className="flex items-center gap-2 text-sky-300 font-bold tracking-wider text-[11px]">
                <Radio size={14} className="text-sky-400 animate-pulse" />
                <span>WI-FI DEVICE LINK</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowWifiCard(false);
                }}
                className="text-sky-400/60 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            <div className="text-[11px] text-sky-200/80 leading-relaxed">
              {isMobileLinked ? (
                <span className="text-emerald-300 font-semibold">
                  Device is connected over Wi-Fi 🟢. All voice directives are relayed across your network automatically.
                </span>
              ) : (
                <span>
                  Open this URL in Chrome on your device on the same Wi-Fi. It locks onto D.A.R.K. automatically:
                </span>
              )}
            </div>

            <div className="text-center py-2 bg-black/60 rounded-xl border border-sky-400/20">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                  typeof window !== "undefined" ? `${window.location.origin}/?mode=mobile` : ""
                )}&color=38-189-248&bgcolor=10-15-30`}
                alt="Scan to open on device"
                className="w-28 h-28 mx-auto rounded-lg border border-sky-400/30 p-1"
              />
              <div className="text-[9px] text-sky-400/60 mt-1">SCAN WITH DEVICE CAMERA</div>
            </div>

            <div className="p-2 bg-sky-950/40 border border-sky-400/30 rounded-lg text-[10px] break-all select-all text-sky-300">
              {typeof window !== "undefined" ? `${window.location.origin}/?mode=mobile` : ""}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            const next = orbTheme === "cyan" ? "crimson_red" : "cyan";
            setOrbTheme(next);
            if (next === "crimson_red") {
              speakDarkResponse("Crimson threat protocol engaged.");
            } else {
              speakDarkResponse("Deep interstellar harmonic restored.");
            }
          }}
          className={`px-2.5 py-1.5 text-xs rounded border transition flex items-center gap-1.5 ${
            orbTheme === "crimson_red"
              ? "bg-red-950/60 border-red-500 text-red-400 shadow-[0_0_12px_rgba(255,50,20,0.4)]"
              : "bg-black/30 border-sky-400/30 text-sky-300 hover:border-sky-400"
          }`}
          title="Toggle Dark Crimson Rage mode"
        >
          <Flame size={13} />
          <span className="hidden sm:inline">{orbTheme === "crimson_red" ? "RAGE" : "THEME"}</span>
        </button>

        {isSpeaking && (
          <button
            type="button"
            onClick={() => ultronAudio.stopSpeech()}
            className="p-1.5 rounded bg-red-950/50 border border-red-500/50 text-red-400 hover:bg-red-900 transition"
            title="Silence Voice"
          >
            <VolumeX size={15} />
          </button>
        )}
      </div>

      {/* Left HUD: Keyboard / Gesture Hint */}
      <div className="hud hud-hint">
        <div>
          <span className="key">DRAG</span> spin&nbsp;&nbsp;
          <span className="key">SCROLL</span> zoom
        </div>
        <div>
          <span className="key">G</span> gestures&nbsp;&nbsp;
          <span className="key">M</span> voice&nbsp;&nbsp;
          <span className="key">R</span> reset
        </div>
      </div>

      {/* Faded Natural Voice & Chat Input (Bottom Center) - Minimal translucent styling */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4 pointer-events-auto">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(inputText);
          }}
          className="flex items-center gap-2 p-1.5 bg-black/30 border border-sky-400/25 rounded-xl backdrop-blur-xs opacity-70 hover:opacity-95 focus-within:opacity-100 transition-opacity font-mono"
        >
          <button
            type="button"
            onClick={toggleMicListening}
            className={`p-2 rounded-lg border transition ${
              isListening
                ? "bg-red-600/80 text-white border-red-400 animate-pulse shadow-[0_0_12px_rgba(255,0,0,0.5)]"
                : "bg-black/30 border-sky-400/25 text-sky-300 hover:bg-sky-950/30 opacity-80 hover:opacity-100"
            }`}
            title={isListening ? "Listening... Click to stop" : "Speak to Dark"}
          >
            {isListening ? <Mic size={17} /> : <MicOff size={17} />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isListening
                ? "Listening to voice command..."
                : "Speak or chat with Dark (e.g. 'Can you open YouTube for me?')..."
            }
            className="flex-1 bg-transparent px-3 py-1.5 text-xs text-sky-100 placeholder-sky-400/35 focus:outline-none font-mono"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="p-2 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-300 hover:bg-sky-500/30 disabled:opacity-20 disabled:hover:bg-transparent transition"
            title="Send directive"
          >
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* Right HUD: Camera / Gesture & Zoom Controls */}
      <div className="hud hud-controls opacity-70 hover:opacity-100 transition-opacity">
        <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
          <video ref={videoRef} muted playsInline className="camera-video" />
          <canvas ref={overlayRef} width={208} height={156} className="camera-overlay" />
          <div className="camera-status">
            {status.hands > 0
              ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]}`
              : "SHOW HANDS"}
          </div>
        </div>

        {error && <div className="hud-error">{error}</div>}

        <div className="hud-row">
          <button
            type="button"
            className="hud-btn"
            aria-pressed={cameraOn}
            onClick={toggleGestures}
            disabled={camera === "starting"}
          >
            {camera === "starting" ? "INITIALIZING…" : cameraOn ? "GESTURES ON" : "GESTURES OFF"}
          </button>
        </div>
        <div className="hud-row">
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomIn()} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomOut()} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.resetView()}>
            RESET
          </button>
        </div>
      </div>

      {/* Device Command HUD Notification */}
      {deviceToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="px-4 py-2 bg-black/90 border border-emerald-400/60 rounded-xl text-emerald-300 text-xs font-mono font-bold tracking-wider shadow-[0_0_25px_rgba(16,185,129,0.4)] flex items-center gap-2 animate-bounce">
            <Radio size={14} className="animate-pulse text-emerald-400" />
            <span>{deviceToast}</span>
          </div>
        </div>
      )}
    </>
  );
}
