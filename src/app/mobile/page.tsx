import { MobileAppShell } from "@/components/layout/mobile-app-shell";
import { LocaleProvider } from "@/features/mobile/i18n/i18n-context";

export default function MobilePreviewPage() {
  return (
    <LocaleProvider>
      <MobileAppShell />
    </LocaleProvider>
  );
}
