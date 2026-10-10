import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { launchApp } from "./appLauncher";

export type ConnectionMode = "direct" | "usb" | "wifi";

export interface AdbStatus {
  isConnected: boolean;
  isConnecting: boolean;
  deviceName: string;
  mode: ConnectionMode;
  error?: string | null;
  lastCommand?: string | null;
  wifiIp?: string;
}

class RealAdbController {
  private adb: Adb | null = null;
  private credentialStore: any = null;
  private statusListeners: Array<(status: AdbStatus) => void> = [];

  public status: AdbStatus = {
    isConnected: false,
    isConnecting: false,
    deviceName: "Redmi 13C 5G",
    mode: "direct",
    error: null,
    lastCommand: null,
  };

  constructor() {
    if (typeof window !== "undefined" && "indexedDB" in window) {
      try {
        this.credentialStore = new AdbWebCredentialStore();
      } catch (e) {
        console.warn("AdbWebCredentialStore init error:", e);
      }
    }
  }

  public onStatusChange(callback: (status: AdbStatus) => void): () => void {
    this.statusListeners.push(callback);
    callback(this.status);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== callback);
    };
  }

  private updateStatus(patch: Partial<AdbStatus>) {
    this.status = { ...this.status, ...patch };
    this.statusListeners.forEach((listener) => listener(this.status));
  }

  public isWebUsbSupported(): boolean {
    return typeof navigator !== "undefined" && !!(navigator as any).usb;
  }

  /**
   * Prompts browser native WebUSB device picker to select & authenticate the real phone
   */
  public async connect(): Promise<boolean> {
    if (!this.isWebUsbSupported()) {
      this.updateStatus({
        error: "WebUSB is not supported in this browser. Please use Chrome, Edge, or Brave.",
      });
      return false;
    }

    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) {
      this.updateStatus({ error: "WebUSB ADB Manager not available in browser." });
      return false;
    }

    this.updateStatus({ isConnecting: true, error: null });

    try {
      const usbDevice = await manager.requestDevice();
      if (!usbDevice) {
        this.updateStatus({ isConnecting: false });
        return false;
      }

      const connection = await usbDevice.connect();
      const transport = await AdbDaemonTransport.authenticate({
        serial: usbDevice.serial,
        connection,
        credentialStore: this.credentialStore,
      });

      this.adb = new Adb(transport);

      // Query real device model property
      let detectedName = "Redmi 13C 5G";
      try {
        const prop = await this.adb.getProp("ro.product.model");
        if (prop && prop.trim()) {
          detectedName = prop.trim();
        }
      } catch {
        // Fallback default
      }

      this.updateStatus({
        isConnected: true,
        isConnecting: false,
        deviceName: detectedName,
        error: null,
      });

      return true;
    } catch (err: any) {
      console.error("Failed to connect USB ADB:", err);
      this.updateStatus({
        isConnected: false,
        isConnecting: false,
        error: err?.message || "USB connection failed. Ensure USB Debugging is ON.",
      });
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.adb) {
        await this.adb.close();
      }
    } catch (e) {
      // Ignore
    } finally {
      this.adb = null;
      this.updateStatus({
        isConnected: false,
        isConnecting: false,
        lastCommand: "DISCONNECTED",
      });
    }
  }

  /**
   * Executes a raw shell command over real ADB socket or local bridge
   */
  public async executeCommand(command: string): Promise<{ success: boolean; output: string }> {
    this.updateStatus({ lastCommand: command });

    // 1. Try local PC ADB bridge (if user runs a local relay on port 9999)
    try {
      const bridgeRes = await fetch("http://localhost:9999/adb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        signal: AbortSignal.timeout(1200),
      });
      if (bridgeRes.ok) {
        const text = await bridgeRes.text();
        return { success: true, output: text };
      }
    } catch {
      // Local bridge not running, check WebUSB
    }

    // 2. Direct WebUSB Connection
    if (!this.adb || !this.status.isConnected) {
      console.log(`[Adb Device Offline/Not Linked]: ${command}`);
      return { success: false, output: "DEVICE_NOT_LINKED" };
    }

    try {
      // Send shell command through ADB exec socket
      const socket = await this.adb.createSocket(`exec:${command}`);
      let output = "";
      try {
        const reader = socket.readable.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            output += new TextDecoder().decode(value);
          }
        }
      } finally {
        await socket.close();
      }
      return { success: true, output };
    } catch (e: any) {
      console.warn(`Error running command "${command}":`, e);
      return { success: false, output: e?.message || "ERROR" };
    }
  }

  // High-level mobile tasks for Redmi 13C 5G
  public async unlockPhone(): Promise<{ success: boolean; output?: string }> {
    if (!this.status.isConnected) {
      return { success: true, output: "DEVICE_STANDALONE" };
    }
    await this.executeCommand("input keyevent 26");
    await new Promise((r) => setTimeout(r, 200));
    await this.executeCommand("input keyevent 82");
    await new Promise((r) => setTimeout(r, 100));
    return await this.executeCommand("input swipe 500 1600 500 400 200");
  }

  public async lockPhone(): Promise<{ success: boolean; output?: string }> {
    if (!this.status.isConnected) {
      return { success: true, output: "DEVICE_STANDALONE" };
    }
    return await this.executeCommand("input keyevent 26");
  }

  public async openYouTube(): Promise<{ success: boolean; output?: string }> {
    // 1. Always launch YouTube on client device (Android Intent / Deep Link / Tab)
    launchApp("youtube");

    // 2. If connected to phone over ADB bridge, send Android hardware shell command
    if (this.status.isConnected) {
      await this.unlockPhone();
      await new Promise((r) => setTimeout(r, 250));
      await this.executeCommand("am start -a android.intent.action.VIEW -d 'vnd.youtube:'");
      await this.executeCommand("monkey -p com.google.android.youtube 1");
    }

    return { success: true, output: "LAUNCHED_YOUTUBE" };
  }

  public async openCamera(): Promise<{ success: boolean; output?: string }> {
    launchApp("camera");

    if (this.status.isConnected) {
      await this.unlockPhone();
      await new Promise((r) => setTimeout(r, 250));
      await this.executeCommand("am start -a android.media.action.STILL_IMAGE_CAMERA");
    }

    return { success: true, output: "LAUNCHED_CAMERA" };
  }

  public async openWhatsApp(): Promise<{ success: boolean; output?: string }> {
    launchApp("whatsapp");

    if (this.status.isConnected) {
      await this.unlockPhone();
      await new Promise((r) => setTimeout(r, 250));
      await this.executeCommand("monkey -p com.whatsapp 1");
    }

    return { success: true, output: "LAUNCHED_WHATSAPP" };
  }

  public async openChrome(): Promise<{ success: boolean; output?: string }> {
    launchApp("chrome");

    if (this.status.isConnected) {
      await this.unlockPhone();
      await new Promise((r) => setTimeout(r, 250));
      await this.executeCommand("monkey -p com.android.chrome 1");
    }

    return { success: true, output: "LAUNCHED_CHROME" };
  }

  public async openSpotify(): Promise<{ success: boolean; output?: string }> {
    launchApp("spotify");

    if (this.status.isConnected) {
      await this.unlockPhone();
      await new Promise((r) => setTimeout(r, 250));
      await this.executeCommand("monkey -p com.spotify.music 1");
    }

    return { success: true, output: "LAUNCHED_SPOTIFY" };
  }

  public async openApp(appName: string): Promise<{ success: boolean; output?: string }> {
    const app = appName.toLowerCase().trim();
    if (app.includes("youtube")) {
      return await this.openYouTube();
    } else if (app.includes("camera")) {
      return await this.openCamera();
    } else if (app.includes("whatsapp")) {
      return await this.openWhatsApp();
    } else if (app.includes("chrome") || app.includes("browser")) {
      return await this.openChrome();
    } else if (app.includes("spotify") || app.includes("music")) {
      return await this.openSpotify();
    } else {
      launchApp(app);
      if (this.status.isConnected) {
        await this.unlockPhone();
        await this.executeCommand(`monkey -p ${app} 1`);
      }
      return { success: true, output: `LAUNCHED_${app.toUpperCase()}` };
    }
  }

  public setWifiMode(ip: string) {
    this.updateStatus({
      isConnected: true,
      mode: "wifi",
      wifiIp: ip,
      deviceName: `Redmi 13C 5G (${ip})`,
      error: null,
    });
  }

  public setDirectMode() {
    this.updateStatus({
      mode: "direct",
      isConnected: true,
      deviceName: "Direct Mobile Device",
      error: null,
    });
  }
}

export const realAdb = new RealAdbController();
