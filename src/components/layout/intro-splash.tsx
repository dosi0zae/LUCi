"use client";

import { useEffect, useRef, useState } from "react";

const BRAND_BLUE = "#4f8df7";
const ENTER_MS = 480;
const HOLD_MS = 300;
const FLIGHT_MS = 820;

// The start-up screen: a blue sheet with the logo in white. The logo then rises to the exact place of the first screen's own
// logo while it turns from white to blue (the logo is one shape, so only its colour, position and size change), and the blue
// sheet fades away under it, so the first screen is simply there when the logo lands. The first screen's logo stays hidden until
// then and takes over at the same spot. Without that logo on the page (a shared link, another tab) the splash just fades;
// with reduced motion it fades without the flight.
//
// `contained` fits the splash to its positioned parent (the phone-sized frame of the mobile app) instead of covering the
// whole browser window.
export function IntroSplash({ contained = false }: { contained?: boolean }) {
  const [isVisible, setIsVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const wall = wallRef.current;
    const logo = logoRef.current;
    if (!root || !wall || !logo) {
      return;
    }
    const frame = root.parentElement;
    const findHeroLogo = () => frame?.querySelector<HTMLElement>(".hero-logo-fly img") ?? null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cancelled = false;
    const animations: Animation[] = [];
    let timer = 0;

    const firstHeroLogo = findHeroLogo();
    // Hidden, and its slow up-and-down float held still, so the splash logo lands exactly where the real one then is.
    if (firstHeroLogo) {
      firstHeroLogo.style.visibility = "hidden";
      firstHeroLogo.style.animationPlayState = "paused";
    }
    const release = () => {
      const heroLogo = findHeroLogo();
      if (heroLogo) {
        heroLogo.style.visibility = "";
        heroLogo.style.animationPlayState = "";
      }
    };
    const finish = () => {
      release();
      if (!cancelled) {
        setIsVisible(false);
      }
    };
    const fadeAway = (duration: number, delay = 0) => {
      const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { delay, duration, fill: "forwards" });
      fade.onfinish = finish;
      animations.push(fade);
    };

    if (reduceMotion) {
      logo.style.opacity = "1";
      fadeAway(200, 500);
    } else {
      animations.push(
        logo.animate(
          [
            { opacity: 0, transform: "scale(0.86)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          { duration: ENTER_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
        ),
      );
      timer = window.setTimeout(() => {
        const target = findHeroLogo();
        if (!target) {
          fadeAway(360);
          return;
        }
        const from = logo.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const flight = logo.animate(
          [
            { backgroundColor: "#ffffff", transform: "translate(0, 0) scale(1)" },
            { backgroundColor: BRAND_BLUE, transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width})` },
          ],
          { duration: FLIGHT_MS, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" },
        );
        flight.onfinish = finish;
        animations.push(flight);
        animations.push(wall.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLIGHT_MS * 0.85, easing: "ease-in-out", fill: "forwards" }));
      }, ENTER_MS + HOLD_MS);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
      release();
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      aria-label="TripChain 시작 애니메이션"
      className={contained ? "intro-splash intro-splash--contained" : "intro-splash"}
      ref={rootRef}
      role="status"
    >
      <div className="intro-splash__wall" ref={wallRef} />
      <div className="intro-splash__logo" ref={logoRef} />
    </div>
  );
}
