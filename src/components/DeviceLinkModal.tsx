"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Smartphone,
  Wifi,
  Usb,
  CheckCircle2,
  Copy,
  Check,
  Play,
  Radio,
  Camera,
  MessageSquare,
  Music,
  ShieldCheck,
  BatteryCharging,
  Layers,
  Lock,
} from "lucide-react";
import { realAdb, type AdbStatus } from "@/lib/realAdb";
import { launchApp } from "@/lib/appLauncher";
import { ultronAudio } from "@/lib/ultronAudio";

interface DeviceLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSpokenFeedback?: (text: string) => void;
}

export default function DeviceLinkModal({
  isOpen,
  onClose,
  onSpokenFeedback,
}: DeviceLinkModalProps) {
  const [activeTab, setActiveTab] = useState<"wireless" | "permanent" | "usb" | "wifi_ip">("wireless");
  const [status, setStatus] = useState<AdbStatus>(realAdb.status);
  const [isMobileLinked, setIsMobileLinked] = useState(false);
  const [mobileCount, setMobileCount] = useState(0);
  const [wifiIp, setWifiIp] = useState("192.168.1.");
  const [wifiPort, setWifiPort] = useState("5555");
  const [isCopied, setIsCopied] = useState(false);
  const [mobilePairUrl, setMobilePairUrl] = useState("");
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      setMobilePairUrl(`${origin}/?mode=mobile`);
    }

    const unsub = realAdb.onStatusChange((s) => setStatus(s));

    // Poll bridge status
    const checkBridge = async () => {
      try {
        const res = await fetch("/api/bridge/status?room=default");
        if (res.ok) {
          const data = await res.json();
          setIsMobileLinked(data.isMobileLinked);
          setMobileCount(data.mobileCount);
        }
      } catch {
        // ignore
      }
    };

    checkBridge();
    const interval = setInterval(checkBridge, 3000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  if (!isOpen) return null;

  const handleTestApp = (app: string) => {
    ultronAudio.playAppLaunch();
    const result = launchApp(app);
    setLastActionMessage(`Dispatched to phone: Launch ${result.appName}`);
    if (onSpokenFeedback) {
      onSpokenFeedback(`Transmitted directive. Opening ${result.appName} on your mobile phone.`);
    }
  };

  const handleCopyUrl = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(mobilePairUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleConnectUsb = async () => {
    const success = await realAdb.connect();
    if (success) {
      ultronAudio.playUnlock();
      setLastActionMessage("Connected via WebUSB ADB!");
      if (onSpokenFeedback) {
        onSpokenFeedback("Device successfully synchronized via USB ADB.");
      }
    } else {
      setLastActionMessage(realAdb.status.error || "Connection canceled or failed");
    }
  };

  const handleSaveWifi = () => {
    const fullTarget = `${wifiIp.trim()}:${wifiPort.trim()}`;
    realAdb.setWifiMode(fullTarget);
    ultronAudio.playUnlock();
    setLastActionMessage(`Wireless ADB target set to ${fullTarget}`);
    if (onSpokenFeedback) {
      onSpokenFeedback(`Wireless bridge configured for IP ${wifiIp}. Dark is synchronized over Wi-Fi.`);
    }
  };

  const qrImageUrl = mobilePairUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
        mobilePairUrl
      )}&color=38-189-248&bgcolor=10-15-30`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md font-mono">
      <div className="relative w-full max-w-2xl bg-neutral-950/95 border border-sky-400/40 rounded-2xl shadow-[0_0_50px_rgba(56,189,248,0.25)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sky-400/20 bg-sky-950/20">
          <div className="flex items-center gap-3">
            <Radio size={18} className="text-sky-400 animate-pulse" />
            <div>
              <div className="text-sm font-bold tracking-[0.25em] text-sky-300">
                D.A.R.K. // MOBILE DEVICE LINK
              </div>
              <div className="text-[10px] text-sky-400/60 tracking-wider">
                CONTROL DEVICE FROM THIS LAPTOP
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-sky-400/20 text-sky-400/70 hover:text-white hover:border-sky-400/60 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-sky-400/20 bg-black/40 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("wireless")}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === "wireless"
                ? "border-sky-400 text-sky-300 bg-sky-500/10 font-bold"
                : "border-transparent text-sky-400/50 hover:text-sky-300"
            }`}
          >
            <Wifi size={15} />
            <span>WIRELESS SYNC (QR)</span>
            {isMobileLinked && (
              <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/40 animate-pulse">
                LINKED 🟢
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("permanent")}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === "permanent"
                ? "border-sky-400 text-sky-300 bg-sky-500/10 font-bold"
                : "border-transparent text-sky-400/50 hover:text-sky-300"
            }`}
          >
            <ShieldCheck size={15} />
            <span>PERMANENT SETUP</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("usb")}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === "usb"
                ? "border-sky-400 text-sky-300 bg-sky-500/10 font-bold"
                : "border-transparent text-sky-400/50 hover:text-sky-300"
            }`}
          >
            <Usb size={15} />
            <span>USB CABLE (ADB)</span>
            {status.isConnected && status.mode === "usb" && (
              <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/40">
                ACTIVE
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("wifi_ip")}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === "wifi_ip"
                ? "border-sky-400 text-sky-300 bg-sky-500/10 font-bold"
                : "border-transparent text-sky-400/50 hover:text-sky-300"
            }`}
          >
            <Smartphone size={15} />
            <span>IP / TCP DEBUG</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-sky-100/90 leading-relaxed">
          {/* TAB 1: WIRELESS MOBILE PAIRING (QR CODE) */}
          {activeTab === "wireless" && (
            <div className="space-y-5">
              {/* Linked Status Banner */}
              {isMobileLinked ? (
                <div className="p-4 bg-emerald-950/40 border border-emerald-400/60 rounded-xl space-y-2 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                    <CheckCircle2 size={18} className="text-emerald-400 animate-pulse" />
                    <span>Device Is Actively Linked ({mobileCount} node active)</span>
                  </div>
                  <p className="text-emerald-200/80 text-[11px]">
                    Your phone is connected to the real-time command bus. When you speak to Dark on this laptop (<span className="text-white font-bold">"Open YouTube"</span>, <span className="text-white font-bold">"Open Camera"</span>, <span className="text-white font-bold">"Open WhatsApp"</span>), the directive is sent immediately and executes on your mobile phone!
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-sky-950/20 border border-sky-400/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-sky-300 font-bold text-sm">
                    <Smartphone size={16} className="text-sky-400" />
                    <span>Link Your Device in 3 Seconds (Zero Cables)</span>
                  </div>
                  <p className="text-sky-200/70 text-[11px]">
                    Scan this QR code with your phone's camera (or open the link in Chrome on your phone). Your phone will pair as Dark's receiver node. Every voice command you give Dark on this laptop will physically open apps on your phone!
                  </p>
                </div>
              )}

              {/* QR Code and Pairing Section */}
              <div className="p-4 bg-black/60 border border-sky-400/30 rounded-xl flex flex-col sm:flex-row items-center gap-5">
                {qrImageUrl && (
                  <div className="shrink-0 text-center space-y-1">
                    <img
                      src={qrImageUrl}
                      alt="Scan to pair device"
                      className="w-36 h-36 rounded-lg border border-sky-400/40 p-1 bg-black/80 shadow-[0_0_15px_rgba(56,189,248,0.3)] mx-auto"
                    />
                    <div className="text-[9px] text-sky-400/60">SCAN WITH PHONE CAMERA</div>
                  </div>
                )}

                <div className="space-y-3 text-left flex-1">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-sky-200">
                      Step 1: Scan QR or Open Link on Phone
                    </div>
                    <div className="text-[11px] text-sky-300/70">
                      Open this URL directly in Chrome or browser on your device:
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={mobilePairUrl}
                      className="flex-1 bg-black/90 border border-sky-400/30 rounded px-2.5 py-1.5 text-[11px] text-sky-200 font-mono select-all"
                    />
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="px-3 py-1.5 bg-sky-500/20 border border-sky-400/40 rounded text-sky-300 hover:bg-sky-500/40 transition flex items-center gap-1.5 text-[11px]"
                    >
                      {isCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      <span>{isCopied ? "COPIED" : "COPY"}</span>
                    </button>
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="text-xs font-bold text-sky-200">
                      Step 2: Keep the Phone Screen Awake
                    </div>
                    <div className="text-[11px] text-sky-300/70">
                      Leave the mobile receiver tab open on your phone desk. Now talk to Dark on this laptop!
                    </div>
                  </div>
                </div>
              </div>

              {/* Instant Test Buttons to Phone */}
              <div className="space-y-2">
                <div className="text-[11px] text-sky-400/70 font-semibold tracking-wider uppercase">
                  Test Transmission to Mobile Phone:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTestApp("youtube")}
                    className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 hover:bg-red-900/40 active:scale-95 transition flex items-center justify-center gap-2"
                  >
                    <Play size={13} />
                    <span>Open YouTube</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestApp("camera")}
                    className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300 hover:bg-amber-900/40 active:scale-95 transition flex items-center justify-center gap-2"
                  >
                    <Camera size={13} />
                    <span>Open Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestApp("whatsapp")}
                    className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/40 active:scale-95 transition flex items-center justify-center gap-2"
                  >
                    <MessageSquare size={13} />
                    <span>Open WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestApp("spotify")}
                    className="p-2.5 rounded-lg bg-teal-950/40 border border-teal-500/40 text-teal-300 hover:bg-teal-900/40 active:scale-95 transition flex items-center justify-center gap-2"
                  >
                    <Music size={13} />
                    <span>Open Spotify</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PERMANENT CONNECTION GUIDE */}
          {activeTab === "permanent" && (
            <div className="space-y-5">
              <div className="p-4 bg-sky-950/20 border border-sky-400/30 rounded-xl space-y-2">
                <div className="text-sky-300 font-bold text-sm flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  <span>How to Make Device Permanently Connected</span>
                </div>
                <p className="text-sky-200/70 text-[11px]">
                  Android phones have aggressive power-saving by default. To make your connection 100% permanent so Dark can control your device anytime (even when the screen is locked or asleep):
                </p>
              </div>

              {/* Method 1: Background Web Node (Recommended) */}
              <div className="p-4 bg-black/60 border border-emerald-400/30 rounded-xl space-y-3">
                <div className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                  <Smartphone size={15} />
                  <span>METHOD 1: Permanent Background Web Node (Zero Cables)</span>
                </div>

                <div className="space-y-2.5 text-[11px] text-sky-200/80 leading-relaxed">
                  <div className="flex items-start gap-2.5">
                    <BatteryCharging size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">1. Battery Saver &rarr; "No Restrictions":</strong>
                      <div className="text-sky-300/70 text-[10px]">
                        On your device, long-press Chrome &rarr; tap <strong>App Info (i)</strong> &rarr; scroll to <strong>Battery Saver</strong> &rarr; select <strong>"No restrictions"</strong> so Android never kills the connection.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Layers size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">2. Allow Background Pop-ups:</strong>
                      <div className="text-sky-300/70 text-[10px]">
                        In Chrome <strong>App Info</strong> &rarr; <strong>Other Permissions</strong> &rarr; enable <strong>"Display pop-up windows while running in the background"</strong>. This allows Dark to launch YouTube/Camera even when you aren't looking at the phone.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Lock size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">3. Add to Home Screen:</strong>
                      <div className="text-sky-300/70 text-[10px]">
                        In Chrome on your device &rarr; tap 3 dots &rarr; tap <strong>"Add to Home screen"</strong>. It installs as a persistent app with its own dedicated session.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Method 2: Permanent Wireless ADB (Port 5555) */}
              <div className="p-4 bg-black/60 border border-sky-400/30 rounded-xl space-y-3">
                <div className="text-xs font-bold text-sky-200 flex items-center gap-2">
                  <Wifi size={15} />
                  <span>METHOD 2: Permanent Android Wireless ADB (Port 5555)</span>
                </div>

                <p className="text-[11px] text-sky-300/80 leading-relaxed">
                  To give Dark permanent root-level shell access over your Wi-Fi without needing a browser open on the phone:
                </p>

                <div className="space-y-1.5 text-[11px] text-sky-200/80">
                  <div>1. Connect your device via USB cable once.</div>
                  <div>
                    2. In terminal run: <code className="px-1.5 py-0.5 bg-sky-950 border border-sky-400/40 rounded text-sky-300 font-mono text-[10px]">adb tcpip 5555</code>
                  </div>
                  <div>3. Disconnect the USB cable.</div>
                  <div>4. Android now keeps port 5555 permanently open over your Wi-Fi until the phone reboots!</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: USB CABLE ADB */}
          {activeTab === "usb" && (
            <div className="space-y-5">
              <div className="p-4 bg-sky-950/20 border border-sky-400/30 rounded-xl space-y-2">
                <div className="text-sky-300 font-bold text-sm flex items-center gap-2">
                  <Usb size={16} className="text-sky-400" />
                  <span>Direct WebUSB Physical Cable Link</span>
                </div>
                <p className="text-sky-200/70 text-[11px]">
                  Plug your device into this laptop with a USB cable. Dark communicates directly with your phone's Android hardware using WebUSB ADB.
                </p>
              </div>

              <div className="p-4 bg-black/40 border border-sky-400/20 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sky-400/70">USB Connection:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      status.isConnected && status.mode === "usb"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    }`}
                  >
                    {status.isConnected && status.mode === "usb"
                      ? "CONNECTED"
                      : "NOT LINKED"}
                  </span>
                </div>

                {status.deviceName && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-sky-400/70">Device Model:</span>
                    <span className="text-sky-200">{status.deviceName}</span>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleConnectUsb}
                    disabled={status.isConnecting}
                    className="w-full py-2.5 bg-sky-500 text-black font-bold rounded-lg hover:bg-sky-400 transition flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(56,189,248,0.4)] disabled:opacity-50"
                  >
                    <Usb size={15} />
                    <span>
                      {status.isConnecting
                        ? "PAIRING DEVICE…"
                        : "CONNECT DEVICE VIA USB"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-[11px] text-sky-300/80">
                <div className="font-semibold text-sky-300">Quick Pairing Checklist:</div>
                <ul className="list-disc list-inside space-y-1 text-sky-200/70">
                  <li>In phone Settings &rarr; Developer Options, turn ON <strong>USB Debugging</strong>.</li>
                  <li>Plug in USB cable to laptop.</li>
                  <li>Tap <em>"Always allow from this computer"</em> when prompted on phone.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: IP / TCP DEBUGGING */}
          {activeTab === "wifi_ip" && (
            <div className="space-y-5">
              <div className="p-4 bg-sky-950/20 border border-sky-400/30 rounded-xl space-y-2">
                <div className="text-sky-300 font-bold text-sm flex items-center gap-2">
                  <Wifi size={16} className="text-sky-400" />
                  <span>Android Wireless Debugging (IP & Port)</span>
                </div>
                <p className="text-sky-200/70 text-[11px]">
                  If you prefer ADB over TCP/IP: enable Wireless Debugging in your phone's Developer Options, and enter your phone's Wi-Fi IP address below:
                </p>
              </div>

              <div className="p-4 bg-sky-950/30 border border-sky-400/30 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-sky-400/70 block mb-1">
                      Phone Wi-Fi IP Address
                    </label>
                    <input
                      type="text"
                      value={wifiIp}
                      onChange={(e) => setWifiIp(e.target.value)}
                      placeholder="192.168.1.35"
                      className="w-full bg-black/80 border border-sky-400/40 rounded px-3 py-1.5 text-xs text-sky-200 font-mono focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-[10px] text-sky-400/70 block mb-1">Port</label>
                    <input
                      type="text"
                      value={wifiPort}
                      onChange={(e) => setWifiPort(e.target.value)}
                      placeholder="5555"
                      className="w-full bg-black/80 border border-sky-400/40 rounded px-3 py-1.5 text-xs text-sky-200 font-mono focus:outline-none focus:border-sky-400"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveWifi}
                  className="w-full py-2 bg-sky-500/20 border border-sky-400/50 rounded-lg text-sky-300 hover:bg-sky-500/40 font-bold transition flex items-center justify-center gap-2"
                >
                  <Wifi size={14} />
                  <span>SYNC IP TARGET</span>
                </button>
              </div>
            </div>
          )}

          {/* Feedback banner */}
          {lastActionMessage && (
            <div className="p-2.5 bg-sky-950/50 border border-sky-400/40 rounded-lg text-[11px] text-sky-200 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-sky-400 shrink-0" />
              <span>{lastActionMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-sky-400/20 bg-black/60 flex items-center justify-between text-[11px] text-sky-400/60">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isMobileLinked ? "bg-emerald-400 animate-ping" : "bg-amber-400"
              }`}
            />
            <span>
              {isMobileLinked
                ? "DEVICE WIRELESS NODE ACTIVE"
                : "READY TO PAIR DEVICE"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-sky-500/20 border border-sky-400/40 rounded text-sky-300 hover:bg-sky-500/40 transition"
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  );
}
