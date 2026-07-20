"use client";

import { useEffect, useState } from "react";

export function IntroSplash() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsVisible(false), 2400);

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div aria-label="TripChain 시작 애니메이션" className="intro-splash" role="status">
      <div className="intro-splash__logo" />
    </div>
  );
}
