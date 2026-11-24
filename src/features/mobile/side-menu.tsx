"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDownIcon, CloseIcon, CompassIcon, HelpIcon, LanguageIcon, MessageIcon, ThemeIcon } from "@/components/layout/app-icons";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { SUPPORTED_LOCALES, localeLabel } from "@/features/mobile/i18n/translations";
import { ProfileAvatar } from "@/features/mobile/my-badge";
import { transitionScreen } from "@/features/mobile/screen-transition";
import { useTheme, type ThemeMode } from "@/features/mobile/theme";
import { cn } from "@/lib/utils";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// "의견 보내기" opens this form (in a new tab).
const FEEDBACK_FORM_URL = "https://forms.gle/w5HA1r9NAAGmXWTL6";

// The language row is named in a language other than the one that is set, so someone who ended up in a language they cannot
// read can still find it ("Language" for everyone but English, and "언어" when English is set).
const LANGUAGE_ROW_LABEL: Record<string, string> = { ko: "Language", en: "언어", ja: "Language", zh: "Language" };

const THEME_MODES: { id: ThemeMode; labelKey: "themeAuto" | "themeLight" | "themeDark" }[] = [
  { id: "auto", labelKey: "themeAuto" },
  { id: "light", labelKey: "themeLight" },
  { id: "dark", labelKey: "themeDark" },
];

type SideMenuProps = {
  // The signed-in person (name and picture), or null: the profile row at the bottom shows them.
  account: { name: string; picture: string } | null;
  open: boolean;
  onClose: () => void;
  onExplore: () => void;
  onProfile: () => void;
  // Starts the first-run tutorial again.
  onTutorial: () => void;
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

// Folds open under a row (grid rows 0fr -> 1fr: no fixed height needed). Closed content is inert.
function Fold({ children, open }: { children: ReactNode; open: boolean }) {
  return (
    <div
      className="grid motion-reduce:!transition-none"
      inert={!open}
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transition: `grid-template-rows 320ms ${EASE}, opacity 220ms ease` }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return <ChevronDownIcon className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-180")} />;
}

// The first screen's menu: it slides in from the left over a lightly dimmed screen. The panel itself is see-through and blurred, so
// the first screen glows faintly through it. It holds what the first screen keeps out of sight: the explore feed ("바로 탐색하기"),
// the screen mode, the language, the tutorial, the feedback form, and (at the bottom) the profile and the terms. It is always mounted and
// slides by transform, so closing plays too; while shut it is inert (not focusable, not read out).
export function SideMenu({ account, onClose, onExplore, onProfile, onTutorial, open }: SideMenuProps) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { mode, setMode } = useTheme();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  // A question asked before "사용법 다시 보기" or "의견 보내기" does anything.
  const [confirming, setConfirming] = useState<"tutorial" | "feedback" | null>(null);

  // A question left open does not outlive the menu (closed by Back, say).
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirming(null);
    }
  }, [open]);

  // Each piece comes in after the one before it, sliding in from the left and fading up. The delay applies only while opening, so
  // closing is quick and everything leaves together.
  const enter = (index: number, from = "translateX(-22px)"): CSSProperties => {
    const delay = open ? 140 + index * 70 : 0;
    return {
      opacity: open ? 1 : 0,
      transform: open ? "none" : from,
      transition: `opacity 380ms ease ${delay}ms, transform 560ms ${EASE} ${delay}ms`,
    };
  };

  const chip = (selected: boolean) => cn("rounded-full px-4 py-2 text-sm font-extrabold transition active:scale-95", selected ? "bg-primary text-white" : "ios-btn");

  return (
    <div aria-hidden={!open} className={cn("absolute inset-0 z-40", !open && "pointer-events-none")} inert={!open}>
      {/* The dimmed screen behind the panel closes the menu when tapped. It is a plain layer, not a button, so a tap on it shows no
          pressed or highlighted state; the close (X) button and the browser's Back do the same for keyboards. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/20 motion-reduce:!transition-none [-webkit-tap-highlight-color:transparent]"
        onClick={onClose}
        style={{ opacity: open ? 1 : 0, transition: "opacity 360ms ease" }}
      />
      <nav
        aria-label={t("menuOpenAria")}
        className="absolute inset-y-0 left-0 flex w-[78%] max-w-[19rem] flex-col rounded-r-[2rem] bg-[var(--panel-frost)] px-4 shadow-[8px_0_32px_rgba(15,23,42,0.14)] motion-reduce:!transition-none [padding-bottom:calc(1rem+env(safe-area-inset-bottom))] [padding-top:calc(0.75rem+env(safe-area-inset-top))]"
        style={{
          WebkitBackdropFilter: "blur(28px) saturate(1.6)",
          backdropFilter: "blur(28px) saturate(1.6)",
          transform: open ? "translateX(0)" : "translateX(-104%)",
          transition: `transform 340ms ${EASE}`,
        }}
      >
        <div className="flex h-11 items-center justify-between pl-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Trip Chain" className="block h-[1.375rem] w-auto" src="/tripchain-logo-horizontal.svg" style={enter(0)} />
          {/* The X turns as it comes in (a half turn, with a little overshoot) and turns back as it goes. */}
          <button
            aria-label={t("menuCloseAria")}
            className="grid h-11 w-11 place-items-center rounded-full text-muted-strong [-webkit-tap-highlight-color:transparent] motion-reduce:!transition-none"
            onClick={onClose}
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "rotate(0deg) scale(1)" : "rotate(-180deg) scale(0.4)",
              transition: `opacity 300ms ease ${open ? 200 : 0}ms, transform 640ms cubic-bezier(0.34, 1.56, 0.64, 1) ${open ? 200 : 0}ms`,
            }}
            type="button"
          >
            <CloseIcon className="h-[1.375rem] w-[1.375rem]" />
          </button>
        </div>

        {/* The list scrolls only if the screen is too short for it; its scrollbar stays hidden (like the app's other scroll areas), and
            nothing may push it sideways: a scrollbar flashing in and out while rows fold open and slide in looked like a glitch. */}
        <div className="app-scroll-area mt-6 grid gap-1 overflow-x-hidden overflow-y-auto">
          <div className="motion-reduce:!transition-none" style={enter(1)}>
            <Row
              icon={<CompassIcon className="h-[1.5rem] w-[1.5rem]" />}
              onClick={() => {
                onClose();
                onExplore();
              }}
            >
              {t("menuExplore")}
            </Row>
          </div>

          <div className="motion-reduce:!transition-none" style={enter(2)}>
            <Row
              expanded={themeOpen}
              icon={<ThemeIcon className="h-[1.5rem] w-[1.5rem]" />}
              onClick={() => setThemeOpen((value) => !value)}
              trailing={
                <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-muted">
                  {t(THEME_MODES.find((entry) => entry.id === mode)?.labelKey ?? "themeAuto")}
                  <Chevron open={themeOpen} />
                </span>
              }
            >
              {t("menuTheme")}
            </Row>
            <Fold open={themeOpen}>
              <div className="flex flex-wrap gap-2 px-2.5 pb-2 pt-0.5">
                {THEME_MODES.map((entry) => (
                  <button aria-pressed={mode === entry.id} className={chip(mode === entry.id)} key={entry.id} onClick={(event) => {
                      // The screen mode washes over the screen from the button that was tapped.
                      const box = event.currentTarget.getBoundingClientRect();
                      transitionScreen(() => setMode(entry.id), { wash: { x: box.left + box.width / 2, y: box.top + box.height / 2 } });
                    }}
                    type="button"
                  >
                    {t(entry.labelKey)}
                  </button>
                ))}
              </div>
            </Fold>
          </div>

          <div className="motion-reduce:!transition-none" style={enter(3)}>
            <Row
              expanded={languageOpen}
              icon={<LanguageIcon className="h-[1.5rem] w-[1.5rem]" />}
              onClick={() => setLanguageOpen((value) => !value)}
              trailing={
                <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-muted">
                  {localeLabel[locale]}
                  <Chevron open={languageOpen} />
                </span>
              }
            >
              {LANGUAGE_ROW_LABEL[locale] ?? "Language"}
            </Row>
            <Fold open={languageOpen}>
              <div className="flex flex-wrap gap-2 px-2.5 pb-2 pt-0.5">
                {SUPPORTED_LOCALES.map((option) => (
                  <button aria-pressed={locale === option} className={chip(locale === option)} key={option} onClick={() => transitionScreen(() => setLocale(option))} type="button">
                    {localeLabel[option]}
                  </button>
                ))}
              </div>
            </Fold>
          </div>

          <div className="motion-reduce:!transition-none" style={enter(4)}>
            <Row
              icon={<HelpIcon className="h-[1.5rem] w-[1.5rem]" />}
              onClick={() => setConfirming("tutorial")}
            >
              {t("menuTutorial")}
            </Row>
          </div>

          <div className="motion-reduce:!transition-none" style={enter(5)}>
            <Row
              icon={<MessageIcon className="h-[1.5rem] w-[1.5rem]" />}
              onClick={() => setConfirming("feedback")}
            >
              {t("menuFeedback")}
            </Row>
          </div>
        </div>

        {/* The bottom of the panel: the profile, set off from the rows above only by a hairline (no box behind it):
            the person's picture and name when signed in, otherwise the person mark and "프로필"; the mark is the
            same one the "my course" badge uses. */}
        <div className="mt-auto motion-reduce:!transition-none" style={enter(6, "translateY(18px)")}>
          <div className="border-t border-[var(--hairline)] pt-3">
            <button
              className="flex h-14 w-full items-center gap-3.5 rounded-2xl px-2.5 text-left transition active:bg-black/5"
              onClick={() => {
                onClose();
                onProfile();
              }}
              type="button"
            >
              <ProfileAvatar className="h-10 w-10" iconClassName="h-[1.375rem] w-[1.375rem]" picture={account?.picture ?? null} />
              <span className="block min-w-0 flex-1 truncate text-[1.0625rem] font-bold">{account?.name || t("menuProfile")}</span>
            </button>
          </div>
        </div>
      </nav>

      {confirming && (
        <div
          className="sheet-backdrop absolute inset-0 z-10 grid place-items-center bg-black/35 px-7"
          onClick={() => setConfirming(null)}
          role="presentation"
        >
          {/* The app's own dialog look (as the "optimize the route?" question): a frosted, very round card, a tinted icon, and round pill
              buttons: the blue one does it, the grey one is the way out. */}
          <div
            aria-labelledby="menu-confirm-title"
            aria-modal="true"
            className="sheet-panel read-surface w-full max-w-[20rem] rounded-[2rem] p-6 text-center"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary-strong">
              {confirming === "tutorial" ? <HelpIcon className="h-7 w-7" /> : <MessageIcon className="h-7 w-7" />}
            </span>
            <h3 className="mt-4 text-xl font-extrabold tracking-tight" id="menu-confirm-title">
              {t(confirming === "tutorial" ? "confirmTutorialTitle" : "confirmFeedbackTitle")}
            </h3>
            <p className="mt-1.5 break-keep text-sm leading-6 text-muted-strong text-balance">
              {t(confirming === "tutorial" ? "confirmTutorialBody" : "confirmFeedbackBody")}
            </p>
            <div className="mt-6 grid gap-2.5">
              <button
                className="h-12 rounded-full bg-primary text-base font-extrabold text-white shadow-[0_8px_20px_-6px_rgba(47,111,228,0.55)] transition active:scale-[0.98]"
                onClick={() => {
                  const which = confirming;
                  setConfirming(null);
                  if (which === "tutorial") {
                    onClose();
                    onTutorial();
                  } else {
                    window.open(FEEDBACK_FORM_URL, "_blank", "noopener,noreferrer");
                  }
                }}
                type="button"
              >
                {t(confirming === "tutorial" ? "confirmTutorialOk" : "confirmFeedbackOk")}
              </button>
              <button className="ios-btn h-12 rounded-full text-base font-bold transition active:scale-[0.98]" onClick={() => setConfirming(null)} type="button">
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
