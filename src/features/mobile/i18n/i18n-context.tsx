"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  dictionaries,
  promptExamplesByLocale,
  SUPPORTED_LOCALES,
  type Locale,
  type TranslationKey,
} from "@/features/mobile/i18n/translations";
import type { PlaceCategory } from "@/features/mobile/mobile-data";

const LOCALE_STORAGE_KEY = "tripchain:locale";

function detectDeviceLocale(): Locale {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const languages = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language];

  for (const lang of languages) {
    const short = lang.toLowerCase().slice(0, 2);
    if ((SUPPORTED_LOCALES as string[]).includes(short)) {
      return short as Locale;
    }
  }

  // Unrecognized device language: default to English rather than Korean, since most
  // visitors this app is now aimed at won't read Korean.
  return "en";
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && (SUPPORTED_LOCALES as string[]).includes(stored)) {
        // One-time hydration on mount, not a reactive sync loop.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocaleState(stored as Locale);
        return;
      }
    } catch {
      // Storage unavailable — fall through to device detection.
    }
    setLocaleState(detectDeviceLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode, quota) — the choice just won't persist.
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export function useT() {
  const { locale } = useLocale();

  return useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      interpolate(dictionaries[locale][key], params),
    [locale],
  );
}

const categoryKeyByCategory: Record<PlaceCategory, TranslationKey> = {
  문화재: "categoryHeritage",
  관광지: "categoryAttraction",
  문화시설: "categoryCulture",
  축제행사: "categoryFestival",
};

export function useCategoryLabel() {
  const t = useT();
  return useCallback((category: PlaceCategory) => t(categoryKeyByCategory[category]), [t]);
}

export function usePromptExamples(): string[] {
  const { locale } = useLocale();
  return promptExamplesByLocale[locale];
}
