"use client";

import { useEffect, useRef, useState } from "react";

// The mobile app is one page whose screens are React state, so the browser's Back button
// (and Android's back key, and iOS's edge swipe) would leave the site. This hook mirrors the
// screens that are open onto the browser history: every layer that opens pushes one history
// entry, and Back closes the topmost open layer instead of leaving.
//
// `layers` is ordered topmost first. A layer that closes by itself (its own ✕ button) pops
// its history entry again, so the stack and the screen never drift apart.

export type HistoryLayer = { open: boolean; close: () => void };

const STATE_KEY = "tcDepth";

export function useHistoryLayers(layers: HistoryLayer[]) {
  const depth = layers.filter((layer) => layer.open).length;
  const layersRef = useRef(layers);
  // History entries this hook has pushed above the page's first entry.
  const stackRef = useRef(0);
  // A history.go() we issued has not produced its popstate yet; sync only once it has.
  const waitingRef = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    layersRef.current = layers;
  });

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      if (waitingRef.current) {
        waitingRef.current = false;
        setTick((value) => value + 1);
        return;
      }
      const raw = (event.state as Record<string, unknown> | null)?.[STATE_KEY];
      const target = typeof raw === "number" ? raw : 0;
      const stack = stackRef.current;
      if (target < stack) {
        // The user went back: close that many layers, topmost first.
        stackRef.current = target;
        let remaining = stack - target;
        for (const layer of layersRef.current) {
          if (remaining === 0) break;
          if (layer.open) {
            layer.close();
            remaining -= 1;
          }
        }
        // A layer that would not close (none open) leaves depth above the stack: re-sync.
        setTick((value) => value + 1);
      } else if (target > stack) {
        // Forward into an entry whose screen no longer exists: step back to match the screen.
        waitingRef.current = true;
        window.history.go(stack - target);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (waitingRef.current) return;
    const stack = stackRef.current;
    if (depth > stack) {
      for (let level = stack + 1; level <= depth; level += 1) {
        window.history.pushState({ [STATE_KEY]: level }, "", window.location.href);
      }
      stackRef.current = depth;
    } else if (depth < stack) {
      waitingRef.current = true;
      stackRef.current = depth;
      window.history.go(depth - stack);
    }
  }, [depth, tick]);
}
