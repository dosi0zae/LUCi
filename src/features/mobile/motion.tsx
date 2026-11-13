"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A short tick under the finger on devices that support it (Android Chrome; iPhone Safari ignores it).
export function haptic(pattern: number | number[] = 8) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported or blocked: the visual feedback is enough.
  }
}

// Wraps an icon so it pops (grows, dips, settles) the moment `active` turns on. Nothing plays on
// first render, so a list of already-liked items does not all pop when it appears.
export function PopOnActive({ active, children }: { active: boolean; children: ReactNode }) {
  const previous = useRef(active);
  const [pops, setPops] = useState(0);

  useEffect(() => {
    if (active && !previous.current) {
      // A reaction to a change the person just made, not a derived value.
      setPops((count) => count + 1);
    }
    previous.current = active;
  }, [active]);

  return (
    <span className={cn("inline-grid place-items-center", pops > 0 && "like-pop")} key={pops}>
      {children}
    </span>
  );
}

// A number that rolls up into place when it changes (and stays still when it is first shown).
export function RollingNumber({ value }: { value: string }) {
  const previous = useRef(value);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      // Same as above: reacting to a value that just changed.
      setRolling(true);
    }
  }, [value]);

  return (
    <span className={cn("inline-block", rolling && "count-roll")} key={rolling ? value : "still"}>
      {value}
    </span>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A blue dot that arcs from the button that was tapped to the card that just joined the course. It
// follows the card live (the page may scroll while it flies), and if the card is off screen it ends
// at the screen edge on that side.
export function flyDot(from: DOMRect, getTarget: () => DOMRect | null) {
  if (prefersReducedMotion()) {
    return;
  }
  const dot = document.createElement("div");
  Object.assign(dot.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "18px",
    height: "18px",
    borderRadius: "999px",
    background: "#4f8df7",
    border: "2px solid #fff",
    boxShadow: "0 4px 14px rgba(47, 111, 228, 0.6), 0 0 0 6px rgba(79, 141, 247, 0.25)",
    zIndex: "90",
    pointerEvents: "none",
    willChange: "transform, opacity",
  });
  document.body.appendChild(dot);

  const startX = from.left + from.width / 2;
  const startY = from.top + from.height / 2;
  const startedAt = performance.now();
  const duration = 680;
  let endX = startX;
  let endY = startY;

  function frame(now: number) {
    const t = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const target = getTarget();
    if (target) {
      endX = Math.min(window.innerWidth - 24, Math.max(24, target.left + Math.min(target.width / 2, 120)));
      endY = Math.min(window.innerHeight - 48, Math.max(48, target.top + Math.min(target.height / 2, 40)));
    }
    const x = startX + (endX - startX) * eased;
    const y = startY + (endY - startY) * eased - Math.sin(Math.PI * eased) * 80;
    dot.style.transform = `translate3d(${x - 9}px, ${y - 9}px, 0) scale(${1 - 0.45 * eased})`;
    dot.style.opacity = t > 0.82 ? String(Math.max(0, (1 - t) / 0.18)) : "1";
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      dot.remove();
    }
  }
  requestAnimationFrame(frame);
}

const sheenState = new WeakMap<HTMLElement, { top: number; time: number; speed: number; timer: number }>();

// Called from a scroll handler: sets --sy (scroll position) and --sheen (how fast it is scrolling, 0 to 1)
// on the scroller, which the glass cards read to flash a highlight that slides as you scroll.
export function updateScrollSheen(container: HTMLElement) {
  const now = performance.now();
  const state = sheenState.get(container) ?? { top: container.scrollTop, time: now, speed: 0, timer: 0 };
  const instant = (container.scrollTop - state.top) / Math.max(1, now - state.time);
  state.speed = state.speed * 0.7 + instant * 0.3;
  state.top = container.scrollTop;
  state.time = now;
  container.style.setProperty("--sy", String(Math.round(container.scrollTop)));
  container.style.setProperty("--sheen", Math.min(1, Math.abs(state.speed) / 1.4).toFixed(2));
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => container.style.setProperty("--sheen", "0"), 140);
  sheenState.set(container, state);
}
