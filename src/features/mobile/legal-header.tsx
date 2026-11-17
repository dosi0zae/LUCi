"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftIcon } from "@/components/layout/app-icons";

// Top bar of the terms and privacy pages: the same round glass back button as inside the app (it goes to the
// app's first screen). It stays at the top while the long text scrolls; the document's name appears in it only
// once the big heading (the element marked data-legal-title) has scrolled up under the bar.
export function LegalHeader({ title }: { title: string }) {
  const [showTitle, setShowTitle] = useState(false);

  useEffect(() => {
    const heading = document.querySelector("[data-legal-title]");
    if (!heading) {
      return;
    }
    // The solid part of the bar is about 64 px: the small title takes over once the heading has slid up under it.
    const update = () => setShowTitle(heading.getBoundingClientRect().bottom < 64);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    // Solid behind the button, then a short fade into the text below (a blurred half-transparent bar smeared the
    // lines under it). The bar itself ignores taps so a link in the faded strip stays tappable.
    <header
      className="pointer-events-none sticky top-0 z-20 -mx-5 flex items-center gap-3 px-5 pb-6 pt-[calc(0.75rem+env(safe-area-inset-top))]"
      style={{ background: "linear-gradient(to bottom, var(--background) 0%, var(--background) 62%, transparent 100%)" }}
    >
      <Link
        aria-label="Trip Chain"
        className="ios-glass pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-strong"
        href="/mobile"
      >
        <ArrowLeftIcon className="h-[1.375rem] w-[1.375rem]" />
      </Link>
      <span
        aria-hidden={!showTitle}
        className={`min-w-0 flex-1 truncate text-[0.9375rem] font-extrabold transition-all duration-300 ${showTitle ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0"}`}
      >
        {title}
      </span>
    </header>
  );
}
