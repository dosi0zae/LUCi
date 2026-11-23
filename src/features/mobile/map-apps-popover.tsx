"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { BrandTile, type BrandTileName } from "@/features/mobile/brand-icons";
import { cn } from "@/lib/utils";

const LEAVE_MS = 180;
// Inline: the pill hangs this far under the row of buttons above it, and keeps this much clear of the text below it.
const TOP_GAP = 8;
const BOTTOM_GAP = 10;

export type MapAppItem = {
  key: string;
  label: string;
  brand: BrandTileName;
  // A link (opens in a new tab), or a function for a choice that has to do something first.
  href?: string;
  onSelect?: () => void;
};

// Keeps something on screen for a moment after `open` turns false, so it can play its leaving animation.
function usePresence(open: boolean, ms: number) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(timer);
  }, [open, ms]);
  return open || mounted;
}

// The little popover that offers the map apps (a place's page, or the walking route of a course): one pill of glass
// with round app icons. It springs open from the top right corner, its icons pop in one after the other, and it
// shrinks away again. By default it floats over what is under it (put it inside a `relative` box under the button that
// opens it); `inline` puts it under the row of its opener, right-aligned, and opens room for it only as far as the text
// below would otherwise be covered: the gap that is already there between the two (the next element's top margin) is
// used first, so what is below moves down by the missing part only, and back.
export function MapAppsPopover({
  alignTo,
  inline = false,
  items,
  menuRef,
  open,
}: {
  // The element that opens it (inline only): the pill's right edge is put under that element's right edge.
  alignTo?: RefObject<HTMLElement | null>;
  inline?: boolean;
  items: MapAppItem[];
  menuRef?: RefObject<HTMLDivElement | null>;
  open: boolean;
}) {
  const present = usePresence(open, LEAVE_MS);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const pill = pillRef.current;
    if (!inline || !row || !pill) {
      return;
    }
    if (!open) {
      row.style.height = "0px";
      return;
    }
    // The pill's right edge goes under the opener's right edge.
    const anchor = alignTo?.current;
    const gap = anchor ? Math.max(0, row.getBoundingClientRect().right - anchor.getBoundingClientRect().right) : 0;
    pill.style.right = `${gap}px`;
    // The room it needs is what it takes (its gaps and its height) less the margin the next element already leaves.
    const next = row.nextElementSibling;
    const free = next ? Number.parseFloat(getComputedStyle(next).marginTop) || 0 : 0;
    const room = Math.max(0, TOP_GAP + pill.offsetHeight + BOTTOM_GAP - free);
    // Settle at the closed height first, so the change to the open one is animated.
    void row.offsetHeight;
    row.style.height = `${room}px`;
  }, [open, alignTo, inline, present]);
  if (!present) {
    return null;
  }

  const pill = (
    <div
      className={cn("map-pop absolute flex items-center gap-2 rounded-full p-1.5", inline ? "top-2" : "right-0 top-full z-20 mt-2")}
      data-closing={!open}
      ref={(element) => {
        pillRef.current = element;
        if (!inline && menuRef) {
          menuRef.current = element;
        }
      }}
    >
      {items.map((item, index) => {
        const tile = <BrandTile brand={item.brand} className="h-10 w-10" />;
        const common = {
          "aria-label": item.label,
          className: "map-pop-item shrink-0 rounded-full transition active:scale-90",
          // The popover opens from its right edge, so the icons come out from the right first.
          style: { "--i": items.length - 1 - index } as React.CSSProperties,
          title: item.label,
        };
        return item.href ? (
          <a {...common} href={item.href} key={item.key} onClick={item.onSelect} rel="noopener noreferrer" target="_blank">
            {tile}
          </a>
        ) : (
          <button {...common} key={item.key} onClick={item.onSelect} type="button">
            {tile}
          </button>
        );
      })}
    </div>
  );

  if (!inline) {
    return pill;
  }
  return (
    <div
      className="map-pop-row"
      data-closing={!open}
      ref={(element) => {
        rowRef.current = element;
        if (menuRef) {
          menuRef.current = element;
        }
      }}
    >
      {pill}
    </div>
  );
}
