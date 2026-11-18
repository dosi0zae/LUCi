"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const CLOSE_ANIMATION_MS = 200;
// How far (px) a sheet has to be pulled down to let go of it, or how fast a shorter flick has to be.
const DRAG_CLOSE_DISTANCE = 110;
const DRAG_CLOSE_VELOCITY = 0.6;

type Drag = { startY: number; lastY: number; lastT: number; velocity: number };

// Swipe down to dismiss, for a bottom sheet, like the place sheet has it: the grab handle follows a mouse or a finger,
// and a finger on the body drags the sheet too whenever its content is scrolled to the top. Put `panelRef` on the
// sheet's panel, `scrollRef` on whatever scrolls inside it (the panel itself when that is what scrolls; leave it
// unset then), spread `grabProps` on the handle, and give the panel `className` and `style`.
export function useSheetDismiss<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const panelRef = useRef<T>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const closeRef = useRef(onClose);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [closedByDrag, setClosedByDrag] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  function scrolledTop() {
    return (scrollRef.current ?? panelRef.current)?.scrollTop ?? 0;
  }

  // Closing by a tap (the X, the backdrop): the sheet slides away, then the owner is told.
  function close() {
    if (isClosing) {
      return;
    }
    setIsClosing(true);
    window.setTimeout(() => closeRef.current(), CLOSE_ANIMATION_MS);
  }

  function beginDrag(clientY: number) {
    dragRef.current = { startY: clientY, lastY: clientY, lastT: performance.now(), velocity: 0 };
    setIsDragging(true);
  }

  function moveDrag(clientY: number) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const now = performance.now();
    drag.velocity = (clientY - drag.lastY) / Math.max(1, now - drag.lastT);
    drag.lastY = clientY;
    drag.lastT = now;
    setDragY(Math.max(0, clientY - drag.startY));
  }

  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (!drag) {
      return;
    }
    const distance = Math.max(0, drag.lastY - drag.startY);
    if (distance > DRAG_CLOSE_DISTANCE || (distance > 30 && drag.velocity > DRAG_CLOSE_VELOCITY)) {
      setClosedByDrag(true);
      setIsClosing(true);
      window.setTimeout(() => closeRef.current(), CLOSE_ANIMATION_MS);
    } else {
      setDragY(0);
    }
  }

  // The body: needs non-passive touch listeners so the browser's own overscroll can be cancelled.
  const moveRef = useRef(moveDrag);
  const endRef = useRef(endDrag);
  useEffect(() => {
    moveRef.current = moveDrag;
    endRef.current = endDrag;
  });
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    let tracking = false;

    function onTouchStart(event: TouchEvent) {
      if (scrolledTop() > 0 || event.touches.length !== 1) {
        return;
      }
      tracking = false;
      const startY = event.touches[0].clientY;
      // Start tracking, but only commit to a drag once the finger moves downward.
      dragRef.current = { startY, lastY: startY, lastT: performance.now(), velocity: 0 };
    }

    function onTouchMove(event: TouchEvent) {
      const drag = dragRef.current;
      if (!drag || event.touches.length !== 1) {
        return;
      }
      const y = event.touches[0].clientY;
      if (!tracking) {
        if (y - drag.startY > 6 && scrolledTop() <= 0) {
          tracking = true;
          setIsDragging(true);
        } else {
          return;
        }
      }
      event.preventDefault();
      moveRef.current(y);
    }

    function onTouchEnd() {
      if (tracking) {
        tracking = false;
        endRef.current();
      } else {
        dragRef.current = null;
      }
    }

    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchmove", onTouchMove, { passive: false });
    panel.addEventListener("touchend", onTouchEnd);
    panel.addEventListener("touchcancel", onTouchEnd);
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchmove", onTouchMove);
      panel.removeEventListener("touchend", onTouchEnd);
      panel.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // Mid-drag the panel follows the finger directly; otherwise the open/close animations run. A drag-dismiss slides on
  // from where it was released.
  const panelClass = !isDragging && dragY === 0 && !closedByDrag ? (isClosing ? "sheet-panel-out" : "sheet-panel") : "";
  const panelStyle: CSSProperties | undefined = closedByDrag
    ? { transform: "translateY(100%)", transition: `transform ${CLOSE_ANIMATION_MS}ms ease-in` }
    : dragY > 0 || isDragging
      ? { transform: `translateY(${dragY}px)`, transition: isDragging ? "none" : "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)" }
      : undefined;

  const grabProps = {
    onPointerCancel: endDrag,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is only a nicety (keeps the drag going outside the handle).
      }
      beginDrag(event.clientY);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => moveDrag(event.clientY),
    onPointerUp: endDrag,
  };

  return { close, grabProps, isClosing, panelClass, panelRef, panelStyle, scrollRef };
}
