/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import JarvisOrb from "@/components/JarvisOrb";
import MobileReceiver from "@/components/MobileReceiver";
import { isMobileDevice } from "@/lib/appLauncher";

export default function App() {
  const [isMobileMode, setIsMobileMode] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get("mode");
      if (modeParam === "mobile") {
        setIsMobileMode(true);
      } else if (modeParam === "orb") {
        setIsMobileMode(false);
      } else {
        // Automatically detect if running on mobile device
        setIsMobileMode(isMobileDevice());
      }
    }
  }, []);

  // Avoid flash before detection
  if (isMobileMode === null) {
    return <div className="min-h-screen bg-black" />;
  }

  if (isMobileMode) {
    return <MobileReceiver onSwitchToOrb={() => setIsMobileMode(false)} />;
  }

  return <JarvisOrb onSwitchToMobile={() => setIsMobileMode(true)} />;
}
