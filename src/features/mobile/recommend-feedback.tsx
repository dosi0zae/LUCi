"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FrownIcon, SmileIcon } from "@/components/layout/app-icons";
import { useT } from "@/features/mobile/i18n/i18n-context";
import { cn } from "@/lib/utils";

type FeedbackProps = {
  prompt: string;
  locale: string;
  placeIds: string[];
  usedAI: boolean;
  model: string | null;
  unmet: string[];
};

type Rating = "good" | "bad";
// What is sent to the log: an answer, or the taking back of one.
type Sent = Rating | "withdrawn";
type Reason = "places" | "conditions" | "other";
// What is open under the two buttons: nothing, the reasons for a frown, or the write-your-own field.
type Panel = "none" | "why" | "write";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// Folds open and shut by animating the grid row from 0fr to 1fr (no fixed height needed). Closed content is inert, so it cannot be
// tabbed to or read out.
function Fold({ children, open }: { children: ReactNode; open: boolean }) {
  return (
    <div
      className="grid motion-reduce:!transition-none"
      inert={!open}
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition: `grid-template-rows 360ms ${EASE}, opacity 240ms ease`,
      }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

// A small row under an AI recommendation: smile or frown. A smile is one tap. A frown opens a few reasons (one tap each, or write
// your own). The two buttons stay after an answer, with the thank-you line under them, so the person can change their mind: every
// answer goes to the log sheet through /api/log together with the sentence and the stops (the weekly review takes the latest one
// for a sentence). Render it with a `key` that changes for each new recommendation, so the answer starts fresh.
//
// The row unfolds from under the confirm button when it comes into view (the course is long and the row usually starts below the
// screen, so an unfold at load time would never be seen). The motion is small on purpose: the buttons rise in one after another,
// the reasons fold open and rise in one after another, the chosen side pops once, and the thank-you line rises in.
export function RecommendFeedback({ locale, model, placeIds, prompt, unmet, usedAI }: FeedbackProps) {
  const t = useT();
  const [panel, setPanel] = useState<Panel>("none");
  const [comment, setComment] = useState("");
  // The chosen side (shown on its button) and which thank-you line is under the row.
  const [rating, setRating] = useState<Rating | null>(null);
  const [thanks, setThanks] = useState(false);
  const [open, setOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    let frame = 0;
    const reveal = () => {
      frame = requestAnimationFrame(() => setOpen(true));
    };
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      reveal();
      return () => cancelAnimationFrame(frame);
    }
    // Opens once the spot is a little way inside the screen, not at its very edge.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          reveal();
        }
      },
      { rootMargin: "0px 0px -72px 0px" },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // Focus goes to the write-your-own field once it has started to open.
  useEffect(() => {
    if (panel !== "write") {
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 150);
    return () => window.clearTimeout(timer);
  }, [panel]);

  function send(next: Sent, reason?: Reason, text?: string) {
    setThanks(next !== "withdrawn");
    setPanel("none");
    setComment("");
    // The answer is never worth an error on screen: a failed send is simply dropped.
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: next, reason, comment: text, prompt, locale, placeIds, usedAI, model, unmet }),
    }).catch(() => undefined);
  }

  // Tapping the chosen side again takes the answer back: the choice and the thank-you line go away, and, when an answer had already
  // been sent, the log gets a "withdrawn" row so the review does not count it.
  function withdraw() {
    setRating(null);
    if (thanks) {
      send("withdrawn");
    } else {
      setPanel("none");
    }
  }

  function chooseGood() {
    if (rating === "good") {
      withdraw();
      return;
    }
    setRating("good");
    send("good");
  }

  // A frown is chosen at once and is sent when a reason is picked.
  function chooseBad() {
    if (rating === "bad") {
      withdraw();
      return;
    }
    setRating("bad");
    // A thank-you for an earlier smile would no longer match the choice.
    setThanks(false);
    setPanel("why");
  }

  const reasons: { key: Reason; label: string }[] = [
    { key: "places", label: t("feedbackWhyPlaces") },
    { key: "conditions", label: t("feedbackWhyConditions") },
    { key: "other", label: t("feedbackWhyOther") },
  ];

  // The chosen side: white with blue text; the other one stays plain.
  const sideClass = (side: Rating) =>
    rating === side
      ? "fb-pop bg-white text-primary-strong shadow-[0_1px_5px_rgba(15,23,42,0.14)]"
      : "text-muted-strong";

  // Each item rises in after the one before it (a transition delay that only applies while opening).
  const rise = (visible: boolean, index: number): CSSProperties => ({
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(8px)",
    transition: `opacity 320ms ease ${visible ? 70 + index * 55 : 0}ms, transform 420ms ${EASE} ${visible ? 70 + index * 55 : 0}ms`,
  });

  // The root sits in a grid with a 1rem gap above it; that gap is cancelled while the row is folded, so a folded row takes no room.
  return (
    <div
      className="motion-reduce:!transition-none"
      style={{ marginTop: open ? 0 : "-1rem", transition: `margin-top 360ms ${EASE}` }}
    >
      {/* Marker the observer watches (it takes no room): the row opens when this comes into view. */}
      <div aria-hidden="true" className="-mb-px h-px" ref={sentinelRef} />
      <Fold open={open}>
        <div aria-label={t("feedbackAria")} className="grid justify-items-center gap-2.5 px-1 pb-1" role="group">
          <div className="flex items-center justify-center gap-3">
            <span className="text-sm font-semibold text-muted" style={rise(open, 0)}>
              {t("feedbackLabel")}
            </span>
            <div className="flex items-center gap-1">
              <span style={rise(open, 1)}>
                <button
                  aria-pressed={rating === "good"}
                  className={cn(
                    "flex h-10 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-bold transition-[background-color,color,box-shadow,scale] active:scale-95",
                    sideClass("good"),
                  )}
                  onClick={chooseGood}
                  type="button"
                >
                  <SmileIcon className="h-[1.125rem] w-[1.125rem]" />
                  {t("feedbackGood")}
                </button>
              </span>
              <span style={rise(open, 2)}>
                <button
                  aria-expanded={panel !== "none"}
                  aria-pressed={rating === "bad"}
                  className={cn(
                    "flex h-10 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-bold transition-[background-color,color,box-shadow,scale] active:scale-95",
                    sideClass("bad"),
                  )}
                  onClick={chooseBad}
                  type="button"
                >
                  <FrownIcon className="h-[1.125rem] w-[1.125rem]" />
                  {t("feedbackBad")}
                </button>
              </span>
            </div>
          </div>

          <div className="w-full">
            <Fold open={panel === "why"}>
              <div className="flex flex-wrap justify-center gap-2 pt-0.5">
                {reasons.map((reason, index) => (
                  <button
                    className="ios-btn rounded-full px-3.5 py-2 text-sm font-semibold active:scale-95"
                    key={reason.key}
                    onClick={() => (reason.key === "other" ? setPanel("write") : send("bad", reason.key))}
                    style={rise(panel === "why", index)}
                    type="button"
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            </Fold>
            <Fold open={panel === "write"}>
              <form
                className="ios-pill mt-0.5 flex w-full items-center gap-2 rounded-full py-1 pl-4 pr-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  send("bad", "other", comment.trim());
                }}
                style={rise(panel === "write", 0)}
              >
                <input
                  className="min-w-0 flex-1 bg-transparent text-[1rem] font-semibold outline-none placeholder:font-medium placeholder:text-muted"
                  maxLength={200}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t("feedbackCommentPlaceholder")}
                  ref={inputRef}
                  type="text"
                  value={comment}
                />
                <button
                  className="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-strong active:scale-95"
                  type="submit"
                >
                  {t("feedbackSend")}
                </button>
              </form>
            </Fold>
          </div>

          {thanks && (
            <p className="fb-rise text-center text-sm font-semibold text-muted-strong" role="status">
              {t("feedbackThanks")}
            </p>
          )}
        </div>
      </Fold>
    </div>
  );
}
