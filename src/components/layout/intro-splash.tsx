"use client";

import { useEffect, useState } from "react";

// `contained` fits the splash to its positioned parent (the phone-sized frame of the
// mobile app) instead of covering the whole browser window.
export function IntroSplash({ contained = false }: { contained?: boolean }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsVisible(false), 2400);

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      aria-label="TripChain 시작 애니메이션"
      className={contained ? "intro-splash intro-splash--contained" : "intro-splash"}
      role="status"
    >
      <div className="intro-splash__logo" />
    </div>
  );
}
