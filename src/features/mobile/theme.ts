"use client";

import { useCallback, useEffect, useState } from "react";

// The screen mode: follow the phone (auto), or always light, or always dark. The choice is kept in this browser and put on <html> as
// data-theme before the page first paints (the little script in app/layout.tsx does that), so there is no flash of the other mode.
// The stylesheet reads the attribute (see the dark blocks in globals.css); with no attribute it follows the phone.
export type ThemeMode = "auto" | "light" | "dark";

export const THEME_STORAGE_KEY = "tripchain:theme";
const THEME_COLOR: Record<"light" | "dark", string> = { light: "#f7fafc", dark: "#07111f" };

function readStored(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

// Puts the mode on <html> and tints the browser toolbar (the theme-color tags are per colour scheme; a chosen mode sets both).
function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "auto") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (!meta.dataset.autoColor) {
      meta.dataset.autoColor = meta.content;
    }
    meta.content = mode === "auto" ? meta.dataset.autoColor : THEME_COLOR[mode];
  });
}

export function useTheme(): { mode: ThemeMode; setMode: (mode: ThemeMode) => void } {
  const [mode, setModeState] = useState<ThemeMode>("auto");

  useEffect(() => {
    // The stored choice is only known in the browser, so it is read once after mount.
    const stored = readStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(stored);
    if (stored !== "auto") {
      applyTheme(stored);
    }
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    applyTheme(next);
    try {
      if (next === "auto") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Storage unavailable: the choice holds until the page is closed.
    }
  }, []);

  return { mode, setMode };
}
