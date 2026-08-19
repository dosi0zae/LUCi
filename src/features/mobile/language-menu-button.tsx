"use client";

import { useState } from "react";
import { GlobeIcon } from "@/components/layout/app-icons";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { SUPPORTED_LOCALES, localeLabel } from "@/features/mobile/i18n/translations";
import { cn } from "@/lib/utils";

const CLOSE_ANIMATION_MS = 200;

// A bare, borderless icon button (no background box) that opens a full-screen glass
// overlay over the current screen — the user asked for the trigger to disappear into
// a thin blue line-icon and for the picker itself to read as plain, centered text per
// language rather than a bordered dropdown/list.
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
          className="grid h-10 w-10 place-items-center text-primary transition hover:opacity-70"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <GlobeIcon className="h-6 w-6" />
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
