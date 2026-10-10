"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Smartphone,
  Radio,
  Play,
  CheckCircle2,
  Camera,
  MessageSquare,
  Music,
  RefreshCw,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Volume2,
  Lock,
  BatteryCharging,
  Layers,
} from "lucide-react";
import { launchApp } from "@/lib/appLauncher";
import { ultronAudio } from "@/lib/ultronAudio";

interface MobileReceiverProps {
  onSwitchToOrb?: () => void;
}

export default function MobileReceiver({ onSwitchToOrb }: MobileReceiverProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(5);
  const [logs, setLogs] = useState<string[]>([]);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [backgroundAudioActive, setBackgroundAudioActive] = useState(false);
  const [showDeviceGuide, setShowDeviceGuide] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 20)]);
  };

  // Persistent Device Node ID
  const getNodeId = () => {
    if (typeof window === "undefined") return "device_node_default";
    let id = localStorage.getItem("DARK_NODE_ID");
    if (!id) {
      id = `device_${Math.random().toString(36).substring(2, 8)}`;
      localStorage.setItem("DARK_NODE_ID", id);
    }
    return id;
  };

  // 1. Silent Web Audio Heartbeat (prevents Android Chrome from putting tab to sleep)
  const startBackgroundAudio = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      // Very low silent oscillation loop that keeps media session alive
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(20, ctx.currentTime);
      gain.gain.setValueAtTime(0.00001, ctx.currentTime); // Inaudible
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      setBackgroundAudioActive(true);
      addLog("Permanent Wi-Fi background session engaged 🔊");
    } catch (e) {
      console.warn("Audio keep-alive failed:", e);
    }
  };

  // Auto-engage audio heartbeat on first screen tap
  useEffect(() => {
    const handleFirstTouch = () => {
      startBackgroundAudio();
      window.removeEventListener("click", handleFirstTouch);
      window.removeEventListener("touchstart", handleFirstTouch);
    };
    window.addEventListener("click", handleFirstTouch);
    window.addEventListener("touchstart", handleFirstTouch);
    return () => {
      window.removeEventListener("click", handleFirstTouch);
      window.removeEventListener("touchstart", handleFirstTouch);
    };
  }, []);

  // 2. Screen Wake Lock management
  const requestWakeLock = async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener("release", () => {
          setWakeLockActive(false);
        });
      } catch {
        setWakeLockActive(false);
      }
    }
  };

  useEffect(() => {
    requestWakeLock();

    // Re-acquire wake lock on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // 3. Persistent Real-time SSE Connection
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: any = null;
    let isCancelled = false;

    const nodeId = getNodeId();

    function connect() {
      if (isCancelled) return;
      addLog("Connecting to D.A.R.K. command grid...");

      eventSource = new EventSource(`/api/bridge/stream?room=default&type=mobile&node=${nodeId}`);

      eventSource.onopen = () => {
        setIsConnected(true);
        addLog(`Synchronized! Permanent node ID: ${nodeId} 🟢`);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "CONNECTED") {
            setClientId(data.clientId);
          } else if (data.type === "OPEN_APP") {
            const app = (data.app || "youtube").toLowerCase();
            setLastCommand(`OPEN_APP: ${app.toUpperCase()}`);
            setActiveCommand(app);
            setCountdown(6);
            addLog(`>>> COMMAND FROM LAPTOP: Launch ${app.toUpperCase()}`);
            ultronAudio.playAppLaunch();

            // Vibrate device if supported
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate([200, 100, 200, 100, 300]);
            }

            // Immediately attempt native app launch
            launchApp(app, true);

            // Set countdown to auto-dismiss overlay
            clearInterval(countdownIntervalRef.current);
            let remaining = 6;
            countdownIntervalRef.current = setInterval(() => {
              remaining -= 1;
              setCountdown(remaining);
              if (remaining <= 0) {
                clearInterval(countdownIntervalRef.current);
                setActiveCommand(null);
              }
            }, 1000);
          } else if (data.type === "UNLOCK") {
            setLastCommand("UNLOCK");
            addLog(">>> COMMAND FROM LAPTOP: Unlock screen");
            ultronAudio.playUnlock();
          } else if (data.type === "LOCK") {
            setLastCommand("LOCK");
            addLog(">>> COMMAND FROM LAPTOP: Lock screen");
            ultronAudio.playLock();
          }
        } catch (e) {
          console.warn("[Mobile Node] Message parse error:", e);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        addLog("Network blip. Auto-reconnecting in 2s...");
        eventSource?.close();
        if (!isCancelled) {
          retryTimeout = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      isCancelled = true;
      clearTimeout(retryTimeout);
      clearInterval(countdownIntervalRef.current);
      eventSource?.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-sky-400 font-mono flex flex-col p-4 select-none pb-12">
      {/* Active Command Fullscreen Trigger Card */}
      {activeCommand && (
        <div
          onClick={() => {
            ultronAudio.playAppLaunch();
            launchApp(activeCommand, true);
            setActiveCommand(null);
          }}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200 cursor-pointer"
        >
          <div className="w-full max-w-sm p-6 bg-sky-950/40 border-2 border-sky-400 rounded-3xl shadow-[0_0_50px_rgba(56,189,248,0.5)] space-y-4">
            <div className="inline-flex p-4 rounded-full bg-sky-500/20 border border-sky-400/50 text-sky-300 animate-pulse">
              <Play size={36} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-sky-400 font-bold">
                ⚡ WI-FI DIRECTIVE FROM LAPTOP
              </div>
              <div className="text-xl font-black text-white mt-1 tracking-wider">
                OPEN {activeCommand.toUpperCase()}
              </div>
            </div>
            <p className="text-xs text-sky-200/80">
              Attempting auto-launch... If Android Chrome restricted background pop-ups, tap this button now:
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ultronAudio.playAppLaunch();
                launchApp(activeCommand, true);
                setActiveCommand(null);
              }}
              className="w-full py-3.5 bg-sky-400 text-black font-extrabold rounded-xl shadow-[0_0_25px_rgba(56,189,248,0.6)] text-sm tracking-wide active:scale-95 transition"
            >
              ▶ OPEN {activeCommand.toUpperCase()} NOW ({countdown}s)
            </button>
            <div className="text-[10px] text-sky-400/60">
              Tap anywhere to launch or auto-dismiss in {countdown}s
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="flex items-center justify-between py-3 border-b border-sky-400/30">
        <div className="flex items-center gap-2">
          <Smartphone size={20} className="text-sky-400 animate-pulse" />
          <div>
            <div className="text-xs font-bold tracking-[0.2em] text-sky-200">
              D.A.R.K. // PERMANENT NODE
            </div>
            <div className="text-[10px] text-sky-400/60">MOBILE DEVICE RECEIVER</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected ? "bg-emerald-400 animate-ping" : "bg-amber-400"
            }`}
          />
          <span className="text-[10px] font-bold">
            {isConnected ? "PERMANENTLY LINKED 🟢" : "CONNECTING…"}
          </span>
        </div>
      </div>

      {/* Main Status Panel */}
      <div className="my-5 p-5 bg-sky-950/20 border border-sky-400/40 rounded-2xl shadow-[0_0_30px_rgba(56,189,248,0.2)] text-center space-y-3">
        <div className="inline-flex p-3 rounded-full bg-sky-500/10 border border-sky-400/30 text-sky-300">
          <Radio size={28} className={isConnected ? "animate-pulse" : ""} />
        </div>
        <div>
          <div className="text-sm font-bold text-sky-100 tracking-wider">
            {isConnected
              ? "PERMANENTLY LINKED TO LAPTOP"
              : "RE-SYNCHRONIZING WITH LAPTOP…"}
          </div>
          <div className="text-xs text-sky-300/70 mt-1">
            Whenever you speak to Dark on your laptop, YouTube and apps will open automatically on your device.
          </div>
        </div>

        {lastCommand && (
          <div className="p-3 bg-black/70 border border-emerald-400/60 rounded-xl text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 animate-bounce">
            <CheckCircle2 size={16} />
            <span>LAST EXECUTED: {lastCommand}</span>
          </div>
        )}

        {/* Persistence Controls */}
        <div className="pt-2 flex items-center justify-center gap-2">
          {!backgroundAudioActive ? (
            <button
              type="button"
              onClick={startBackgroundAudio}
              className="px-3 py-1.5 bg-sky-500/20 border border-sky-400/50 rounded-lg text-sky-200 text-xs hover:bg-sky-500/40 transition flex items-center gap-1.5"
            >
              <Volume2 size={13} />
              <span>ENABLE BACKGROUND KEEP-ALIVE</span>
            </button>
          ) : (
            <div className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-300 text-[11px] flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-emerald-400" />
              <span>BACKGROUND PERSISTENCE ACTIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Device Permanent Settings Checklist */}
      <div className="mb-5 bg-sky-950/30 border border-sky-400/30 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDeviceGuide(!showDeviceGuide)}
          className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold text-sky-200 hover:bg-sky-500/10 transition"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-emerald-400" />
            <span>DEVICE BACKGROUND KEEP-ALIVE SETTINGS</span>
          </div>
          {showDeviceGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showDeviceGuide && (
          <div className="p-4 pt-1 border-t border-sky-400/20 space-y-3 text-[11px] text-sky-200/80 leading-relaxed">
            <p className="text-sky-300">
              Android systems put background tabs to sleep by default. Follow these quick steps on your device so it stays permanently connected:
            </p>

            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <BatteryCharging size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-sky-100">1. Battery Saver &rarr; No Restrictions:</strong>
                  <div className="text-sky-300/70 text-[10px]">
                    Long-press your Chrome browser icon &rarr; tap <strong>App Info (i)</strong> &rarr; scroll to <strong>Battery Saver</strong> &rarr; choose <strong>"No restrictions"</strong>.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Layers size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-sky-100">2. Allow Background Pop-ups:</strong>
                  <div className="text-sky-300/70 text-[10px]">
                    In Chrome <strong>App Info</strong> &rarr; tap <strong>Other permissions</strong> &rarr; enable <strong>"Display pop-up windows while running in the background"</strong>. (This allows Dark to open YouTube even when you aren't looking at this tab).
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Lock size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-sky-100">3. Lock in Recents (Optional):</strong>
                  <div className="text-sky-300/70 text-[10px]">
                    Open your Android recent apps view &rarr; press & hold the Chrome card &rarr; tap the <strong>Lock icon</strong> so it never gets cleared.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Test Buttons */}
      <div className="space-y-2 mb-5">
        <div className="text-[11px] text-sky-400/70 uppercase tracking-wider font-semibold">
          Test Launchers on this Phone:
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              addLog("Manual test: Launching YouTube");
              ultronAudio.playAppLaunch();
              launchApp("youtube", true);
            }}
            className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 active:scale-95 transition flex items-center justify-center gap-2"
          >
            <Play size={14} />
            <span>Launch YouTube</span>
          </button>

          <button
            type="button"
            onClick={() => {
              addLog("Manual test: Launching Camera");
              ultronAudio.playAppLaunch();
              launchApp("camera", true);
            }}
            className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 active:scale-95 transition flex items-center justify-center gap-2"
          >
            <Camera size={14} />
            <span>Launch Camera</span>
          </button>

          <button
            type="button"
            onClick={() => {
              addLog("Manual test: Launching WhatsApp");
              ultronAudio.playAppLaunch();
              launchApp("whatsapp", true);
            }}
            className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 active:scale-95 transition flex items-center justify-center gap-2"
          >
            <MessageSquare size={14} />
            <span>Launch WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => {
              addLog("Manual test: Launching Spotify");
              ultronAudio.playAppLaunch();
              launchApp("spotify", true);
            }}
            className="p-3 rounded-xl bg-teal-950/40 border border-teal-500/40 text-teal-300 active:scale-95 transition flex items-center justify-center gap-2"
          >
            <Music size={14} />
            <span>Launch Spotify</span>
          </button>
        </div>
      </div>

      {/* Command Activity Log */}
      <div className="flex-1 bg-black/60 border border-sky-400/20 rounded-xl p-3 flex flex-col min-h-[160px]">
        <div className="text-[10px] text-sky-400/60 uppercase tracking-widest mb-2 flex items-center justify-between border-b border-sky-400/10 pb-1">
          <span>REAL-TIME DISPATCH LOG</span>
          <span>NODE: {getNodeId()}</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 text-[11px] font-mono text-sky-300/80">
          {logs.length === 0 ? (
            <div className="text-sky-500/40 italic">Awaiting commands from laptop...</div>
          ) : (
            logs.map((log, i) => <div key={i}>{log}</div>)
          )}
        </div>
      </div>

      {/* Footer Status */}
      <div className="pt-3 text-[10px] text-sky-400/50 flex items-center justify-between">
        <div>WAKE LOCK: {wakeLockActive ? "ACTIVE" : "STANDBY"}</div>
        {onSwitchToOrb ? (
          <button
            type="button"
            onClick={onSwitchToOrb}
            className="text-sky-300 hover:underline"
          >
            ORB HUD MODE
          </button>
        ) : (
          <a href="/?mode=orb" className="text-sky-300 hover:underline">
            ORB HUD MODE
          </a>
        )}
      </div>
    </div>
  );
}
