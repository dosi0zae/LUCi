"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A horizontally scrolling row of cards. Only when the cards actually overflow the row does
// it fade the right edge out (a hint that there's more) — and the fade goes away once
// scrolled to the end, so nothing is ever left looking cut off.
export function PlaceScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    function measure() {
      const target = ref.current;
      const last = target?.lastElementChild as HTMLElement | null;
      if (!target || !last) {
        return;
      }
      // Compare the cards' own extent with the row.
      setOverflows(last.offsetLeft + last.offsetWidth > target.clientWidth);
      setAtEnd(target.scrollLeft + target.clientWidth >= target.scrollWidth - 2);
    }

    // ResizeObserver reports once as soon as it starts observing, which does the first measurement.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Cards joining or leaving the row (e.g. one just added to the course) change the
    // content width without resizing the row itself.
    const mutations = new MutationObserver(measure);
    mutations.observe(element, { childList: true });
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);

  return (
    <div
      className={cn(
        "place-list-scroll relative flex min-w-0 gap-2.5 overflow-x-auto",
        overflows && !atEnd && "place-list-fade",
      )}
      ref={ref}
    >
      {children}
    </div>
  );
}
