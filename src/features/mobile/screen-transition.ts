"use client";

import { flushSync } from "react-dom";

// Runs a change that repaints the whole screen (the screen mode, the language) as one smooth cross-fade of the screen instead of
// everything snapping at once. Where the browser has the View Transitions API the old screen dissolves into the new one (see the
// ::view-transition rules in globals.css); elsewhere the colours ease over about half a second (the .screen-fade class). Nothing
// moves for someone who has asked for reduced motion.
export function transitionScreen(update: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown };

  if (reduced) {
    update();
    return;
  }
  if (typeof doc.startViewTransition === "function") {
    // flushSync: the new screen has to be in the page by the time the browser takes its "after" picture.
    doc.startViewTransition(() => flushSync(update));
    return;
  }
  const root = document.documentElement;
  root.classList.add("screen-fade");
  update();
  window.setTimeout(() => root.classList.remove("screen-fade"), 600);
}
