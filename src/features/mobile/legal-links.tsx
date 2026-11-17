"use client";

import { useT } from "@/features/mobile/i18n/i18n-context";

// Terms and privacy policy links (the pages are src/app/terms and src/app/privacy). Google asks for the
// privacy policy to be reachable from the app's home page and from the sign-in screen.
export function LegalLinks({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <p className={`flex items-center justify-center gap-2 text-[0.6875rem] text-muted ${className}`}>
      <a className="underline-offset-2 hover:underline" href="/terms" rel="noopener" target="_blank">
        {t("termsLink")}
      </a>
      <span aria-hidden="true">·</span>
      <a className="underline-offset-2 hover:underline" href="/privacy" rel="noopener" target="_blank">
        {t("privacyLink")}
      </a>
    </p>
  );
}
