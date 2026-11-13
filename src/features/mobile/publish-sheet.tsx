"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlacePhoto } from "@/features/mobile/place-photo";
import type { MobilePlace, TripVisibility } from "@/features/mobile/mobile-data";
import { useT } from "@/features/mobile/i18n/i18n-context";
import type { TranslationKey } from "@/features/mobile/i18n/translations";

const CLOSE_ANIMATION_MS = 200;

type PublishSheetProps = {
  places: MobilePlace[];
  onCancel: () => void;
  onPublish: (input: {
    title: string;
    description: string;
    visibility: TripVisibility;
    coverPlaceId: string;
  }) => void;
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
  // Default cover: the first spot that has a real photo.
  const [coverPlaceId, setCoverPlaceId] = useState(
    () => (places.find((place) => place.image) ?? places[0])?.id ?? "",
  );
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
    onPublish({ title: title.trim(), description: description.trim(), visibility, coverPlaceId });
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
          "app-scroll-area glass-panel flex max-h-[86%] w-full flex-col overflow-y-auto rounded-t-[2rem] p-5 pb-6",
          isClosing ? "sheet-panel-out" : "sheet-panel",
        )}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-border-strong" />

        <h2 className="text-2xl font-extrabold tracking-tight">{t("publishHeading")}</h2>
        <p className="mt-1.5 break-keep text-sm text-muted text-balance">{t("publishSubtitle", { count: places.length })}</p>

        <div className="mt-4">
          <p className="text-sm font-bold text-muted-strong">{t("publishCoverLabel")}</p>
          <div className="place-list-scroll mt-2 flex gap-2.5 overflow-x-auto pb-1">
            {places.map((place) => (
              <button
                aria-label={place.name}
                aria-pressed={coverPlaceId === place.id}
                className={cn(
                  "relative shrink-0 rounded-[1.25rem] p-0.5 transition",
                  coverPlaceId === place.id ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
                )}
                key={place.id}
                onClick={() => setCoverPlaceId(place.id)}
                type="button"
              >
                <PlacePhoto className="h-[4.5rem] w-[4.5rem] rounded-2xl" place={place} />
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{t("publishCoverHint")}</p>
        </div>

        <label className="mt-5 block text-sm font-bold text-muted-strong">
          {t("publishTitleLabel")}
          <input
            className="ios-pill mt-2 h-12 w-full rounded-2xl px-4 text-base font-semibold text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-primary/40"
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("publishTitlePlaceholder")}
            value={title}
          />
        </label>

        <label className="mt-4 block text-sm font-bold text-muted-strong">
          {t("publishDescriptionLabel")}
          <textarea
            className="ios-pill mt-2 min-h-24 w-full rounded-2xl px-4 py-3 text-base text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-primary/40"
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("publishDescriptionPlaceholder")}
            value={description}
          />
        </label>

        <div className="mt-4 grid gap-2.5">
          {visibilityOptionKeys.map((option) => (
            <button
              className={cn(
                "flex items-center justify-between rounded-2xl px-4 py-3.5 text-left",
                visibility === option.id ? "border border-primary bg-primary-soft" : "ios-row",
              )}
              key={option.id}
              onClick={() => setVisibility(option.id)}
              type="button"
            >
              <span>
                <span className="block text-base font-bold">{t(option.labelKey)}</span>
                <span className="block text-sm text-muted">{t(option.hintKey)}</span>
              </span>
              <span
                className={cn(
                  "h-5 w-5 shrink-0 rounded-full border-2",
                  visibility === option.id ? "border-primary bg-primary" : "border-border-strong",
                )}
              />
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button className="h-14 text-[1.0625rem]" onClick={handleCancel} shape="pill" type="button" variant="secondary">
            {t("cancel")}
          </Button>
          <Button className="h-14 text-[1.0625rem] shadow-[0_10px_28px_rgba(47,111,228,0.32)]" shape="pill" type="submit">
            {t("saveCourse")}
          </Button>
        </div>
      </form>
    </div>
  );
}
