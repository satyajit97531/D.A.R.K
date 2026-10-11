export interface AppLaunchResult {
  success: boolean;
  appName: string;
  method: "android_intent" | "custom_scheme" | "dispatched_to_mobile" | "camera_stream";
  details: string;
}

/**
 * Checks if the current browser environment is a mobile phone (Android / iOS)
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTouchScreen =
    ("ontouchstart" in window || navigator.maxTouchPoints > 0) && window.innerWidth <= 850;
  return isMobileUA || isTouchScreen;
}

/**
 * Universal app launcher.
 * - On Mobile: launches native app via deep link / Android intent directly on the phone.
 * - On Laptop: dispatches command over the wireless bridge to the paired mobile phone.
 *   NEVER opens a tab or window on the laptop.
 */
export function launchApp(appName: string, forceMobile = false): AppLaunchResult {
  const name = (appName || "").toLowerCase().trim();
  const onMobile = forceMobile || isMobileDevice();
  const isAndroid =
    typeof navigator !== "undefined" &&
    (/Android/i.test(navigator.userAgent) || !/iPhone|iPad|Macintosh/i.test(navigator.userAgent));

  // If this code is running on the LAPTOP (and not forcing mobile execution):
  // Forward exclusively to the mobile phone over the bridge. DO NOT open on laptop!
  if (!onMobile) {
    try {
      fetch("/api/bridge/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: "default",
          command: {
            type: "OPEN_APP",
            app: name,
            timestamp: Date.now(),
          },
        }),
      }).catch((e) => console.warn("[Bridge] Dispatch error:", e));
    } catch (e) {
      console.warn("[Bridge] Fetch dispatch error:", e);
    }

    return {
      success: true,
      appName,
      method: "dispatched_to_mobile",
      details: "Transmitted wirelessly to your device.",
    };
  }

  return executeMobileLaunch(name, isAndroid);
}

/**
 * Direct launch for mobile receiver without any bridge routing
 */
export function executeMobileLaunch(name: string, isAndroid = true): AppLaunchResult {
  const triggerLink = (url: string) => {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener noreferrer";
      a.style.position = "fixed";
      a.style.top = "-9999px";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
      }, 500);
    } catch {
      window.location.href = url;
    }
  };

  if (name.includes("youtube")) {
    // 1. Direct URI scheme (fastest native trigger on Android & iOS)
    try {
      window.location.href = "vnd.youtube:";
    } catch {
      triggerLink("vnd.youtube:");
    }

    // 2. Android Intent URI format
    if (isAndroid) {
      setTimeout(() => {
        const intentUrl =
          "intent://www.youtube.com/#Intent;package=com.google.android.youtube;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end";
        triggerLink(intentUrl);
      }, 120);

      // 3. Web URL fallback (Android App Links captures youtube.com and launches YouTube app)
      setTimeout(() => {
        try {
          window.location.assign("https://www.youtube.com");
        } catch {
          window.open("https://www.youtube.com", "_blank");
        }
      }, 500);

      return {
        success: true,
        appName: "YouTube",
        method: "android_intent",
        details: "Launched YouTube native app on device",
      };
    } else {
      setTimeout(() => {
        window.location.href = "https://www.youtube.com";
      }, 300);
    }

    return {
      success: true,
      appName: "YouTube",
      method: "custom_scheme",
      details: "Opened YouTube via vnd.youtube scheme",
    };
  }

  if (name.includes("camera") || name.includes("photo")) {
    if (isAndroid) {
      try {
        triggerLink("intent:#Intent;action=android.media.action.STILL_IMAGE_CAMERA;end");
      } catch {
        // Fallback
      }
    }

    // Trigger mobile camera capture
    try {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.setAttribute("capture", "environment");
      fileInput.style.position = "fixed";
      fileInput.style.top = "-9999px";
      document.body.appendChild(fileInput);
      fileInput.click();
      setTimeout(() => {
        if (document.body.contains(fileInput)) document.body.removeChild(fileInput);
      }, 1000);
    } catch {
      // Fallback
    }

    return {
      success: true,
      appName: "Camera",
      method: "camera_stream",
      details: "Triggered camera capture on mobile",
    };
  }

  if (name.includes("whatsapp")) {
    triggerLink("whatsapp://send");
    setTimeout(() => {
      window.location.href = "https://wa.me/";
    }, 400);
    return {
      success: true,
      appName: "WhatsApp",
      method: "custom_scheme",
      details: "Launched WhatsApp on mobile",
    };
  }

  if (name.includes("spotify") || name.includes("music") || name.includes("song")) {
    triggerLink("spotify://");
    setTimeout(() => {
      window.location.href = "https://open.spotify.com";
    }, 400);
    return {
      success: true,
      appName: "Spotify",
      method: "custom_scheme",
      details: "Launched Spotify on mobile",
    };
  }

  if (name.includes("chrome") || name.includes("browser")) {
    if (isAndroid) {
      triggerLink("googlechrome://navigate?url=google.com");
    } else {
      window.location.href = "https://www.google.com";
    }
    return {
      success: true,
      appName: "Chrome",
      method: "custom_scheme",
      details: "Launched Chrome on mobile",
    };
  }

  // Fallback for other apps on mobile
  window.location.href = `https://www.google.com/search?q=${encodeURIComponent(name)}`;
  return {
    success: true,
    appName: name,
    method: "custom_scheme",
    details: `Navigated to ${name} on mobile`,
  };
}
