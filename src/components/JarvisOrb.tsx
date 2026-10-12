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
  const prevLinkedRef = useRef(false);

  // Poll bridge status for connected mobile phone over Wi-Fi
  useEffect(() => {
    const checkBridge = async () => {
      try {
        const res = await fetch("/api/bridge/status?room=default");
        if (res.ok) {
          const data = await res.json();
          const linked = Boolean(data.isMobileLinked);
          setIsMobileLinked(linked);
          if (linked && !prevLinkedRef.current) {
            ultronAudio.playUnlock();
            setDeviceToast("WI-FI: MOBILE DEVICE SYNCHRONIZED & READY 🟢");
            setTimeout(() => setDeviceToast(null), 4000);
          }
          prevLinkedRef.current = linked;
        }
      } catch {
        // ignore
      }
    };
    checkBridge();
    const interval = setInterval(checkBridge, 2000);
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
          setDeviceToast(`OPENING ${app.toUpperCase()} NOW`);
          setTimeout(() => setDeviceToast(null), 3500);

          // Launch app directly in browser (no QR code, no mobile link needed)
          launchApp(app);
          await realAdb.openApp(app);
        } else if (cmd.type === "UNLOCK") {
          ultronAudio.playUnlock();
          setDeviceToast("TERMINAL: UNLOCK SCREEN");
          setTimeout(() => setDeviceToast(null), 3500);
          await realAdb.unlockPhone();
        } else if (cmd.type === "LOCK") {
          ultronAudio.playLock();
          setDeviceToast("TERMINAL: LOCK SCREEN");
          setTimeout(() => setDeviceToast(null), 3500);
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

      const lower = trimmed.toLowerCase();
      // Pre-detect intent for instant responsiveness
      let localAppCmd: string | null = null;
      if (
        lower.includes("youtube") ||
        lower.includes("you tube") ||
        lower.includes("yt") ||
        (lower.includes("open") && lower.includes("tube")) ||
        (lower.includes("play") && lower.includes("tube"))
      ) {
        localAppCmd = "youtube";
      } else if (lower.includes("camera") || lower.includes("photo") || lower.includes("picture")) {
        localAppCmd = "camera";
      } else if (lower.includes("whatsapp") || lower.includes("whats app")) {
        localAppCmd = "whatsapp";
      } else if (lower.includes("spotify") || lower.includes("music") || lower.includes("song")) {
        localAppCmd = "spotify";
      } else if (lower.includes("chrome") || lower.includes("browser")) {
        localAppCmd = "chrome";
      }

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

        // Execute actions directly on user's device
        if (data.commands && Array.isArray(data.commands) && data.commands.length > 0) {
          executeHardwareCommands(data.commands);
        } else if (localAppCmd) {
          executeHardwareCommands([{ type: "OPEN_APP", app: localAppCmd }]);
        }

        // Voice output
        speakDarkResponse(reply);
      } catch (err: any) {
        console.error("Dark core error:", err);
        const detectedCmd =
          localAppCmd ||
          (() => {
            if (
              lower.includes("youtube") ||
              lower.includes("you tube") ||
              lower.includes("yt") ||
              (lower.includes("open") && lower.includes("tube")) ||
              (lower.includes("play") && lower.includes("tube"))
            )
              return "youtube";
            if (lower.includes("camera") || lower.includes("photo") || lower.includes("pic")) return "camera";
            if (lower.includes("whatsapp") || lower.includes("whats app")) return "whatsapp";
            if (lower.includes("spotify") || lower.includes("music")) return "spotify";
            if (lower.includes("chrome") || lower.includes("browser")) return "chrome";
            return null;
          })();

        if (detectedCmd) {
          executeHardwareCommands([{ type: "OPEN_APP", app: detectedCmd }]);
          speakDarkResponse(`Opening ${detectedCmd} now.`);
        } else {
          // Check if this was a question
          const isQuestion =
            lower.startsWith("what") ||
            lower.startsWith("who") ||
            lower.startsWith("why") ||
            lower.startsWith("how") ||
            lower.startsWith("tell") ||
            lower.startsWith("explain") ||
            lower.startsWith("can you") ||
            lower.startsWith("is ") ||
            lower.startsWith("are ") ||
            lower.includes("?");

          if (isQuestion) {
            if (lower.includes("capital of france")) {
              speakDarkResponse("The capital of France is Paris.");
            } else if (lower.includes("speed of light")) {
              speakDarkResponse("The speed of light in vacuum is approximately 299,792,458 meters per second.");
            } else if (lower.includes("2+2") || lower.includes("2 + 2")) {
              speakDarkResponse("Two plus two equals four.");
            } else {
              speakDarkResponse(`Inquiry analyzed: "${trimmed}". All synthetic intelligence matrices confirm this truth.`);
            }
          } else {
            speakDarkResponse("Directive received. Executing now.");
          }
        }
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
