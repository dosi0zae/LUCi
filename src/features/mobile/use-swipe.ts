"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from "react";

// How far (px) and how horizontal a drag must be to count as a swipe, so ordinary vertical
// scrolling and taps never switch sections.
const MIN_DISTANCE = 56;
const HORIZONTAL_RATIO = 1.6;
// Drags that start in these places belong to something else (a horizontally scrolling row, a
// text field) and are ignored.
const IGNORE_SELECTOR = ".place-list-scroll, input, textarea, [data-no-swipe]";

// Spread the returned handlers onto a container: a left swipe calls `onSwipe(1)` (next
// section), a right swipe `onSwipe(-1)` (previous). Works with a finger or a mouse drag.
export function useHorizontalSwipe(onSwipe: (direction: 1 | -1) => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function begin(x: number, y: number, target: EventTarget | null) {
    startRef.current = target instanceof Element && target.closest(IGNORE_SELECTOR) ? null : { x, y };
  }

  function end(x: number, y: number) {
    const start = startRef.current;
    startRef.current = null;
    if (!start) {
      return;
    }
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.abs(dx) >= MIN_DISTANCE && Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_RATIO) {
      onSwipe(dx < 0 ? 1 : -1);
    }
  }

  return {
    onTouchStart: (event: ReactTouchEvent) => begin(event.touches[0].clientX, event.touches[0].clientY, event.target),
    onTouchEnd: (event: ReactTouchEvent) => end(event.changedTouches[0].clientX, event.changedTouches[0].clientY),
    onTouchCancel: () => {
      startRef.current = null;
    },
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse") {
        begin(event.clientX, event.clientY, event.target);
      }
    },
    onPointerUp: (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse") {
        end(event.clientX, event.clientY);
      }
    },
  };
}
