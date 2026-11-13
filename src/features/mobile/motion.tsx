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
