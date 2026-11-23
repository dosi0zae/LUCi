"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { BrandTile, type BrandTileName } from "@/features/mobile/brand-icons";
import { cn } from "@/lib/utils";

const LEAVE_MS = 170;
// Room around the pill inside the clipped row, for its shadow (the row hides what leaves it).
const SHADOW_ROOM = 20; // (the sides; below the pill 16)

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
// opens it); `inline` puts it in the flow as a row of its own, right-aligned, which opens and closes its room (nothing is
// covered, what is below moves down and back).
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
  const slotRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const slot = slotRef.current;
    const anchor = alignTo?.current;
    if (!open || !row || !slot || !anchor) {
      return;
    }
    // How far the opener's right edge is from the row's: the pill gets that much room on its right.
    const gap = Math.max(0, row.getBoundingClientRect().right - anchor.getBoundingClientRect().right);
    slot.style.paddingRight = `${SHADOW_ROOM + gap}px`;
  }, [open, alignTo, present]);
  if (!present) {
    return null;
  }

  const pill = (
    <div
      className={cn("map-pop flex items-center gap-2 rounded-full p-1.5", !inline && "absolute right-0 top-full z-20 mt-2")}
      data-closing={!open}
      ref={inline ? undefined : menuRef}
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
    <div className="map-pop-row" data-closing={!open} ref={(element) => {
      rowRef.current = element;
      if (menuRef) {
        menuRef.current = element;
      }
    }}>
      <div className="-mx-5 min-h-0 overflow-hidden">
        <div className="flex justify-end pb-4 pl-5 pr-5 pt-3" ref={slotRef}>{pill}</div>
      </div>
    </div>
  );
}
