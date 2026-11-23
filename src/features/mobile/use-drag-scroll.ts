"use client";

import { useEffect } from "react";

const STRIP_SELECTOR = ".place-list-scroll";
// How far (px) a mouse has to move before it counts as a drag and not a click.
const DRAG_THRESHOLD = 5;

// A finger scrolls a sideways row by itself; a mouse does not (it has the wheel's shift key and nothing else), so a row of chips or
// cards looked stuck on a computer. Pressing a mouse button on any `.place-list-scroll` row and moving sideways now scrolls it,
// and the click that ends such a drag is swallowed so no card is opened by it. Touch and pen are left alone. Call once.
export function useDragScroll() {
  useEffect(() => {
    let strip: HTMLElement | null = null;
    let startX = 0;
    let startLeft = 0;
    let moved = false;

    function onDown(event: PointerEvent) {
      if (event.pointerType !== "mouse" || event.button !== 0) {
        return;
      }
      const row = (event.target as Element | null)?.closest<HTMLElement>(STRIP_SELECTOR);
      if (!row || row.scrollWidth <= row.clientWidth) {
        return;
      }
      strip = row;
      startX = event.clientX;
      startLeft = row.scrollLeft;
      moved = false;
    }

    function onMove(event: PointerEvent) {
      if (!strip) {
        return;
      }
      const dx = event.clientX - startX;
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD) {
        return;
      }
      moved = true;
      strip.scrollLeft = startLeft - dx;
      // Text and images must not be picked up and dragged along with it.
      event.preventDefault();
    }

    function onUp() {
      strip = null;
    }

    function onClickCapture(event: MouseEvent) {
      if (moved) {
        moved = false;
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onDragStart(event: Event) {
      if (strip) {
        event.preventDefault();
      }
    }

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("selectstart", onDragStart);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("selectstart", onDragStart);
    };
  }, []);
}
