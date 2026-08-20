"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MobilePlace, TripVisibility } from "@/features/mobile/mobile-data";
import { useT } from "@/features/mobile/i18n/i18n-context";
import type { TranslationKey } from "@/features/mobile/i18n/translations";

const CLOSE_ANIMATION_MS = 200;

type PublishSheetProps = {
  places: MobilePlace[];
  onCancel: () => void;
  onPublish: (input: { title: string; description: string; visibility: TripVisibility }) => void;
};

const visibilityOptionKeys: { id: TripVisibility; labelKey: TranslationKey; hintKey: TranslationKey }[] = [
  { id: "public", labelKey: "visibilityPublic", hintKey: "visibilityPublicHint" },
  { id: "link", labelKey: "visibilityLink", hintKey: "visibilityLinkHint" },
  { id: "private", labelKey: "visibilityPrivate", hintKey: "visibilityPrivateHint" },
];

export function PublishSheet({ onCancel, onPublish, places }: PublishSheetProps) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<TripVisibility>("public");
  const [error, setError] = useState("");
  const [isClosing, setIsClosing] = useState(false);

  function handleCancel() {
    setIsClosing(true);
    window.setTimeout(onCancel, CLOSE_ANIMATION_MS);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (places.length < 2) {
      setError(t("publishNeedsTwoPlaces"));
      return;
    }

    if (title.trim().length < 2) {
      setError(t("publishNeedsTitle"));
      return;
    }

    setError("");
    onPublish({ title: title.trim(), description: description.trim(), visibility });
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-30 flex items-end justify-center bg-black/35",
        isClosing ? "sheet-backdrop-out" : "sheet-backdrop",
      )}
      onClick={handleCancel}
    >
      <form
        className={cn(
          "app-scroll-area glass-panel flex max-h-[86%] w-full flex-col overflow-y-auto rounded-t-xl p-5 pb-6",
          isClosing ? "sheet-panel-out" : "sheet-panel",
        )}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />

        <h2 className="text-lg font-extrabold">{t("publishHeading")}</h2>
        <p className="mt-1 text-xs text-muted text-balance">{t("publishSubtitle", { count: places.length })}</p>

        <label className="mt-4 block text-xs font-bold text-muted-strong">
          {t("publishTitleLabel")}
          <input
            className="mt-1.5 h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-primary"
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("publishTitlePlaceholder")}
            value={title}
          />
        </label>

        <label className="mt-3 block text-xs font-bold text-muted-strong">
          {t("publishDescriptionLabel")}
          <textarea
            className="mt-1.5 min-h-20 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("publishDescriptionPlaceholder")}
            value={description}
          />
        </label>

        <div className="mt-3 grid gap-2">
          {visibilityOptionKeys.map((option) => (
            <button
              className={cn(
                "flex items-center justify-between rounded-sm border px-3 py-2.5 text-left",
                visibility === option.id
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-surface",
              )}
              key={option.id}
              onClick={() => setVisibility(option.id)}
              type="button"
            >
              <span>
                <span className="block text-sm font-bold">{t(option.labelKey)}</span>
                <span className="block text-xs text-muted">{t(option.hintKey)}</span>
              </span>
              <span
                className={cn(
                  "h-4 w-4 shrink-0 rounded-full border",
                  visibility === option.id ? "border-primary bg-primary" : "border-border-strong",
                )}
              />
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-xs font-semibold text-danger">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={handleCancel} type="button" variant="secondary">
            {t("cancel")}
          </Button>
          <Button type="submit">{t("saveCourse")}</Button>
        </div>
      </form>
    </div>
  );
}
