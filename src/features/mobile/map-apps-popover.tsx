"use client";

import { useEffect, useState, type RefObject } from "react";
import { BrandTile, type BrandTileName } from "@/features/mobile/brand-icons";

const LEAVE_MS = 170;

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
// shrinks away again. Put it inside a `relative` box under the button that opens it.
export function MapAppsPopover({
  items,
  menuRef,
  open,
}: {
  items: MapAppItem[];
  menuRef?: RefObject<HTMLDivElement | null>;
  open: boolean;
}) {
  const present = usePresence(open, LEAVE_MS);
  if (!present) {
    return null;
  }

  return (
    <div
      className="map-pop absolute right-0 top-full z-20 mt-2 flex items-center gap-2 rounded-full p-1.5"
      data-closing={!open}
      ref={menuRef}
    >
      {items.map((item, index) => {
        const tile = <BrandTile brand={item.brand} className="h-10 w-10" round />;
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
}
