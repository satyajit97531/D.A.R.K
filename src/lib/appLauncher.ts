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
 * - Opens YouTube and apps directly on the user's active device right away.
 * - No QR codes, no mobile linking required to start YouTube.
 */
export function launchApp(appName: string, forceMobile = false): AppLaunchResult {
  const name = (appName || "").toLowerCase().trim();
  const onMobile = forceMobile || isMobileDevice();
  const isAndroid =
    typeof navigator !== "undefined" &&
    (/Android/i.test(navigator.userAgent) || !/iPhone|iPad|Macintosh/i.test(navigator.userAgent));

  // If on mobile device, trigger native mobile intent / scheme
  if (onMobile) {
    return executeMobileLaunch(name, isAndroid);
  }

  // On desktop / laptop: Open the requested app directly in the browser!
  const triggerOpen = (url: string) => {
    try {
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        window.location.href = url;
      }
    } catch {
      window.location.href = url;
    }
  };

  if (name.includes("youtube") || name.includes("tube") || name.includes("yt")) {
    triggerOpen("https://www.youtube.com");
    return {
      success: true,
      appName: "YouTube",
      method: "custom_scheme",
      details: "Opened YouTube directly.",
    };
  }

  if (name.includes("spotify") || name.includes("music") || name.includes("song")) {
    triggerOpen("https://open.spotify.com");
    return {
      success: true,
      appName: "Spotify",
      method: "custom_scheme",
      details: "Opened Spotify directly.",
    };
  }

  if (name.includes("whatsapp")) {
    triggerOpen("https://web.whatsapp.com");
    return {
      success: true,
      appName: "WhatsApp",
      method: "custom_scheme",
      details: "Opened WhatsApp directly.",
    };
  }

  if (name.includes("chrome") || name.includes("browser") || name.includes("google")) {
    triggerOpen("https://www.google.com");
    return {
      success: true,
      appName: "Chrome",
      method: "custom_scheme",
      details: "Opened browser directly.",
    };
  }

  if (name.includes("camera") || name.includes("photo")) {
    return executeMobileLaunch(name, isAndroid);
  }

  // Fallback direct web open
  triggerOpen(`https://www.google.com/search?q=${encodeURIComponent(name)}`);
  return {
    success: true,
    appName,
    method: "custom_scheme",
    details: `Opened ${appName} directly.`,
  };
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
    if (isAndroid) {
      // 1. Android Intent format (most reliable on Android Chrome)
      const intentUrl =
        "intent://www.youtube.com/#Intent;package=com.google.android.youtube;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end";
      try {
        window.location.href = intentUrl;
      } catch {
        triggerLink(intentUrl);
      }

      // 2. Direct URI scheme as secondary trigger
      setTimeout(() => {
        try {
          window.location.href = "vnd.youtube://";
        } catch {
          // ignore
        }
      }, 300);

      return {
        success: true,
        appName: "YouTube",
        method: "android_intent",
        details: "Launched YouTube native app on device",
      };
    } else {
      try {
        window.location.href = "youtube://";
      } catch {
        window.location.href = "https://www.youtube.com";
      }

      return {
        success: true,
        appName: "YouTube",
        method: "custom_scheme",
        details: "Opened YouTube via custom scheme",
      };
    }
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
