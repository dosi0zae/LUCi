"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon, CloseIcon, CompassIcon, LanguageIcon } from "@/components/layout/app-icons";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { SUPPORTED_LOCALES, localeLabel } from "@/features/mobile/i18n/translations";
import { ProfileAvatar } from "@/features/mobile/my-badge";
import { cn } from "@/lib/utils";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// The language row is named in a language other than the one that is set, so someone who ended up in a language they cannot
// read can still find it ("Language" for everyone but English, and "언어" when English is set).
const LANGUAGE_ROW_LABEL: Record<string, string> = { ko: "Language", en: "언어", ja: "Language", zh: "Language" };

type SideMenuProps = {
  // The signed-in person (name and picture), or null: the profile box at the bottom shows them.
  account: { name: string; picture: string } | null;
  open: boolean;
  onClose: () => void;
  onExplore: () => void;
  onProfile: () => void;
};

// A menu row sits straight on the frosted panel (no pill behind it, no shadow): just a blue icon and the label.
function Row({ children, icon, onClick, trailing, expanded }: { children: ReactNode; icon: ReactNode; onClick: () => void; trailing?: ReactNode; expanded?: boolean }) {
  return (
    <button
      aria-expanded={expanded}
      className="flex h-14 w-full items-center gap-3.5 rounded-2xl px-2.5 text-left text-[1.0625rem] font-bold transition active:bg-black/5"
      onClick={onClick}
      type="button"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center text-primary">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </button>
  );
}

// The first screen's menu: it slides in from the left over a lightly dimmed screen. The panel itself is see-through and blurred, so
// the first screen glows faintly through it. It holds what the first screen keeps out of sight: the explore feed ("바로 탐색하기"),
// the language, and (at the bottom) the profile. It is always mounted and slides by transform, so closing plays too; while shut it
// is inert (not focusable, not read out).
export function SideMenu({ account, onClose, onExplore, onProfile, open }: SideMenuProps) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [languageOpen, setLanguageOpen] = useState(false);

  return (
    <div aria-hidden={!open} className={cn("absolute inset-0 z-40", !open && "pointer-events-none")} inert={!open}>
      <button
        aria-label={t("menuCloseAria")}
        className="absolute inset-0 bg-black/20 motion-reduce:!transition-none"
        onClick={onClose}
        style={{ opacity: open ? 1 : 0, transition: "opacity 300ms ease" }}
        tabIndex={-1}
        type="button"
      />
      <nav
        aria-label={t("menuOpenAria")}
        className="absolute inset-y-0 left-0 flex w-[78%] max-w-[19rem] flex-col rounded-r-[2rem] bg-white/55 px-4 shadow-[8px_0_32px_rgba(15,23,42,0.14)] motion-reduce:!transition-none dark:bg-slate-900/55 [padding-bottom:calc(1.5rem+env(safe-area-inset-bottom))] [padding-top:calc(0.75rem+env(safe-area-inset-top))]"
        style={{
          WebkitBackdropFilter: "blur(28px) saturate(1.6)",
          backdropFilter: "blur(28px) saturate(1.6)",
          transform: open ? "translateX(0)" : "translateX(-104%)",
          transition: `transform 340ms ${EASE}`,
        }}
      >
        <div className="flex h-11 items-center justify-between pl-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Trip Chain" className="block h-[1.375rem] w-auto" src="/tripchain-logo-horizontal.svg" />
          <button
            aria-label={t("menuCloseAria")}
            className="grid h-11 w-11 place-items-center rounded-full text-muted-strong"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="h-[1.375rem] w-[1.375rem]" />
          </button>
        </div>

        <div className="mt-6 grid gap-1">
          <Row
            icon={<CompassIcon className="h-[1.5rem] w-[1.5rem]" />}
            onClick={() => {
              onClose();
              onExplore();
            }}
          >
            {t("menuExplore")}
          </Row>

          <div>
            <Row
              expanded={languageOpen}
              icon={<LanguageIcon className="h-[1.5rem] w-[1.5rem]" />}
              onClick={() => setLanguageOpen((value) => !value)}
              trailing={
                <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-muted">
                  {localeLabel[locale]}
                  <ChevronDownIcon className={cn("h-4 w-4 transition-transform duration-300", languageOpen && "rotate-180")} />
                </span>
              }
            >
              {LANGUAGE_ROW_LABEL[locale] ?? "Language"}
            </Row>
            {/* The four languages fold open under the row (grid rows 0fr -> 1fr: no fixed height needed). */}
            <div
              className="grid motion-reduce:!transition-none"
              inert={!languageOpen}
              style={{ gridTemplateRows: languageOpen ? "1fr" : "0fr", opacity: languageOpen ? 1 : 0, transition: `grid-template-rows 320ms ${EASE}, opacity 220ms ease` }}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="flex flex-wrap gap-2 px-2.5 pb-2 pt-0.5">
                  {SUPPORTED_LOCALES.map((option) => (
                    <button
                      aria-pressed={locale === option}
                      className={cn("rounded-full px-4 py-2 text-sm font-extrabold transition active:scale-95", locale === option ? "bg-primary text-white" : "ios-btn")}
                      key={option}
                      onClick={() => setLocale(option)}
                      type="button"
                    >
                      {localeLabel[option]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* The profile sits at the bottom of the panel, in a box of its own (the rows above have none): the person's picture and name when
            signed in, otherwise the person mark and "프로필". The mark is the same one the "my course" badge uses. */}
        <button
          className="mt-auto flex h-[4.25rem] w-full items-center gap-3.5 rounded-2xl bg-surface px-3.5 text-left ring-1 ring-black/10 transition active:scale-[0.98]"
          onClick={() => {
            onClose();
            onProfile();
          }}
          type="button"
        >
          <ProfileAvatar className="h-11 w-11" iconClassName="h-6 w-6" picture={account?.picture ?? null} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[1.0625rem] font-bold">{account?.name || t("menuProfile")}</span>
            {account && <span className="block truncate text-sm font-semibold text-muted">{t("menuProfile")}</span>}
          </span>
        </button>
      </nav>
    </div>
  );
}
