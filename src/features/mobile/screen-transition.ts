"use client";

import { flushSync } from "react-dom";

type TransitionOptions = {
  // Where the colour spreads from (the tapped button's centre, in window coordinates). With it, the new screen "washes" over the old
  // one as a soft-edged circle of colour spreading from that point (used for the screen mode); without it the old screen simply dissolves into the new one.
  wash?: { x: number; y: number };
};

const WASH_MS = 1300;
// How wide the soft edge of the spreading colour is.
const WASH_FEATHER_PX = 260;

// Runs a change that repaints the whole screen (the screen mode, the language) as one smooth transition instead of everything
// snapping at once. Where the browser has the View Transitions API the old screen is replaced by the new one (see the
// ::view-transition rules in globals.css); elsewhere the colours ease over about half a second (the .screen-fade class). Nothing
// moves for someone who has asked for reduced motion.
export function transitionScreen(update: () => void, options: TransitionOptions = {}) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => { ready: Promise<void>; finished: Promise<void> };
  };
  const root = document.documentElement;

  if (reduced) {
    update();
    return;
  }
  if (typeof doc.startViewTransition === "function") {
    const { wash } = options;
    if (wash) {
      root.classList.add("vt-wash");
    }
    // flushSync: the new screen has to be in the page by the time the browser takes its "after" picture.
    const transition = doc.startViewTransition(() => flushSync(update));
    if (wash) {
      void transition.ready
        .then(() => {
          // The colour spreads until even the farthest corner is fully covered (its soft edge included).
          const radius = Math.hypot(Math.max(wash.x, window.innerWidth - wash.x), Math.max(wash.y, window.innerHeight - wash.y)) + WASH_FEATHER_PX;
          root.style.setProperty("--wash-x", `${wash.x}px`);
          root.style.setProperty("--wash-y", `${wash.y}px`);
          root.style.setProperty("--wash-feather", `${WASH_FEATHER_PX}px`);
          root.animate(
            { "--wash-r": ["0px", `${Math.ceil(radius)}px`] },
            { duration: WASH_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
          );
        })
        .catch(() => undefined);
      void transition.finished.finally(() => {
        root.classList.remove("vt-wash");
        root.style.removeProperty("--wash-x");
        root.style.removeProperty("--wash-y");
        root.style.removeProperty("--wash-feather");
      });
    }
    return;
  }
  root.classList.add("screen-fade");
  update();
  window.setTimeout(() => root.classList.remove("screen-fade"), 600);
}
