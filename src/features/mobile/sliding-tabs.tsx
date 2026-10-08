"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SlidingTabsProps<T extends string> = {
  // `label` can be an icon; `ariaLabel` then names the option for assistive tech and tooltips.
  options: { value: T; label: ReactNode; ariaLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  // Stretch to the full row with equal-width options (icon tab bars) instead of hugging the labels.
  fullWidth?: boolean;
};

// A pill-shaped segmented control whose highlight glides from the old choice to the new one
// instead of jumping. The highlight is positioned by measuring the selected button and is
// moved straight through its style (no React state), so it stays in step with layout.
export function SlidingTabs<T extends string>({ fullWidth = false, onChange, options, value }: SlidingTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const buttonRefs = useRef<Map<T, HTMLButtonElement>>(new Map());

  function place() {
    const indicator = indicatorRef.current;
    const selected = buttonRefs.current.get(value);
    if (!indicator || !selected) {
      return;
    }
    indicator.style.width = `${selected.offsetWidth}px`;
    indicator.style.transform = `translateX(${selected.offsetLeft}px)`;
  }

  const labelsKey = options.map((option) => option.ariaLabel ?? String(option.value)).join("|");

  useLayoutEffect(() => {
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, labelsKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(place);
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      className={cn(
        "relative flex gap-1 rounded-full border border-border bg-surface p-1 text-sm font-extrabold",
        fullWidth ? "w-full" : "shrink-0",
      )}
      ref={containerRef}
      role="tablist"
    >
      <span
        aria-hidden="true"
        className="absolute bottom-1 left-0 top-1 rounded-full bg-primary transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        ref={indicatorRef}
      />
      {options.map((option) => (
        <button
          aria-selected={option.value === value}
          className={cn(
            "relative z-10 flex items-center justify-center rounded-full py-2 transition-colors duration-200",
            fullWidth ? "flex-1" : "px-4",
            option.value === value ? "text-white" : "text-muted-strong hover:text-primary",
          )}
          aria-label={option.ariaLabel}
          key={option.value}
          onClick={() => onChange(option.value)}
          ref={(element) => {
            if (element) {
              buttonRefs.current.set(option.value, element);
            } else {
              buttonRefs.current.delete(option.value);
            }
          }}
          role="tab"
          title={option.ariaLabel}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
