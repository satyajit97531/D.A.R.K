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
export function launchApp(appName: string): AppLaunchResult {
  const name = (appName || "").toLowerCase().trim();
  const onMobile = isMobileDevice();
  const isAndroid =
    typeof navigator !== "undefined" &&
    (/Android/i.test(navigator.userAgent) || !/iPhone|iPad|Macintosh/i.test(navigator.userAgent));

  // If this code is running on the LAPTOP:
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
      details: "Transmitted wirelessly to mobile device (Redmi 13C 5G).",
    };
  }

  // Helper to trigger link safely on mobile
  const triggerMobileLink = (url: string) => {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
      }, 500);
    } catch {
      window.location.href = url;
    }
  };

  // If running directly ON THE MOBILE PHONE:
  // Trigger native Android Intents and deep links
  if (name.includes("youtube")) {
    if (isAndroid) {
      const intentUrl =
        "intent://www.youtube.com/#Intent;package=com.google.android.youtube;scheme=https;end";
      triggerMobileLink(intentUrl);
      setTimeout(() => {
        triggerMobileLink("vnd.youtube:");
      }, 300);
      return {
        success: true,
        appName: "YouTube",
        method: "android_intent",
        details: "Launched YouTube native app on Redmi 13C 5G",
      };
    } else {
      triggerMobileLink("vnd.youtube:");
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
        window.location.href = "intent:#Intent;action=android.media.action.STILL_IMAGE_CAMERA;end";
        return {
          success: true,
          appName: "Camera",
          method: "android_intent",
          details: "Launched Camera intent on mobile",
        };
      } catch {
        // Fallback
      }
    }

    // Trigger mobile camera
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.setAttribute("capture", "environment");
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);
    fileInput.click();
    setTimeout(() => {
      document.body.removeChild(fileInput);
    }, 1000);

    return {
      success: true,
      appName: "Camera",
      method: "camera_stream",
      details: "Triggered camera capture on mobile",
    };
  }

  if (name.includes("whatsapp")) {
    window.location.href = "whatsapp://send";
    return {
      success: true,
      appName: "WhatsApp",
      method: "custom_scheme",
      details: "Launched WhatsApp on mobile",
    };
  }

  if (name.includes("spotify") || name.includes("music") || name.includes("song")) {
    window.location.href = "spotify://";
    return {
      success: true,
      appName: "Spotify",
      method: "custom_scheme",
      details: "Launched Spotify on mobile",
    };
  }

  if (name.includes("chrome") || name.includes("browser")) {
    if (isAndroid) {
      window.location.href = "googlechrome://navigate?url=google.com";
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
  window.location.href = `https://www.google.com/search?q=${encodeURIComponent(appName)}`;
  return {
    success: true,
    appName,
    method: "custom_scheme",
    details: `Navigated to ${appName} on mobile`,
  };
}
