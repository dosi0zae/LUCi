"use client";

// Runs a change that repaints the whole screen (the screen mode, the language) with a short, soft transition instead of everything
// snapping at once. The whole app dips to a faint veil and comes back (so a change that cannot ease, like the words of the language
// or a gradient, is covered), and for the screen mode every colour also eases over about half a second (the .screen-fade class in
// globals.css). It does NOT use the browser's View Transitions snapshots: on iPhone Safari they showed the old and the new screen
// on top of each other (double text, a panel with no blur). Nothing moves for someone who has asked for reduced motion.
export function transitionScreen(update: () => void, kind: "theme" | "language") {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const app = document.querySelector<HTMLElement>("main");
  if (reduced || !app) {
    update();
    return;
  }

  const root = document.documentElement;
  if (kind === "theme") {
    root.classList.add("screen-fade");
    window.setTimeout(() => root.classList.remove("screen-fade"), 800);
  }

  // Down to the veil, change while it is down, then back up.
  app.style.transition = "opacity 170ms ease";
  app.style.opacity = kind === "theme" ? "0.55" : "0.12";
  window.setTimeout(() => {
    update();
    // One frame later, so the new screen is painted under the veil before it lifts.
    window.requestAnimationFrame(() => {
      app.style.transition = `opacity ${kind === "theme" ? 520 : 420}ms ease`;
      app.style.opacity = "1";
      window.setTimeout(() => {
        app.style.transition = "";
        app.style.opacity = "";
      }, 560);
    });
  }, 180);
}
