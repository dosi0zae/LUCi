"use client";

import { useState } from "react";
import { GlobeIcon } from "@/components/layout/app-icons";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { SUPPORTED_LOCALES, localeLabel } from "@/features/mobile/i18n/translations";
import { cn } from "@/lib/utils";

const CLOSE_ANIMATION_MS = 200;

// A round floating icon button (same white circle as the other floating controls) that
// opens a full-screen glass overlay over the current screen; the picker itself reads as
// plain, centered text per language rather than a bordered dropdown/list.
export function LanguageMenuButton({ className }: { className?: string }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  function close() {
    setIsClosing(true);
    window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  }

  return (
    <>
      <div className={className}>
        <button
          aria-expanded={isOpen}
          aria-label={t("languageMenuAria")}
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface/90 text-primary shadow-soft backdrop-blur transition hover:border-primary"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <GlobeIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Sibling of the button wrapper above (not nested inside it) so inset-0 sizes
          against the shared full-screen ancestor instead of the small button box. */}
      {isOpen && (
        <div
          className={cn(
            "frosted-overlay absolute inset-0 z-30 flex flex-col items-center justify-center gap-7",
            isClosing ? "sheet-backdrop-out" : "sheet-backdrop",
          )}
          onClick={close}
          role="dialog"
          aria-label={t("languageMenuAria")}
        >
          {SUPPORTED_LOCALES.map((option) => (
            <button
              className={cn(
                "text-2xl font-extrabold transition",
                locale === option ? "text-primary" : "text-foreground/55 hover:text-foreground",
              )}
              key={option}
              onClick={(event) => {
                event.stopPropagation();
                setLocale(option);
                close();
              }}
              type="button"
            >
              {localeLabel[option]}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
