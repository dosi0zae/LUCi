"use client";

import { FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/layout/app-icons";
import { fileToCoverDataUrl } from "@/features/mobile/cover-image";
import { useSheetDismiss } from "@/features/mobile/use-sheet-dismiss";
import { cn } from "@/lib/utils";
import { PlacePhoto } from "@/features/mobile/place-photo";
import type { MobilePlace, TripVisibility } from "@/features/mobile/mobile-data";
import { useT } from "@/features/mobile/i18n/i18n-context";
import type { TranslationKey } from "@/features/mobile/i18n/translations";

type PublishSheetProps = {
  places: MobilePlace[];
  // The AI's own title and introduction for this course, filled in to begin with (each can be cleared with one tap and
  // written over).
  defaultTitle?: string;
  defaultDescription?: string;
  onCancel: () => void;
  onPublish: (input: {
    title: string;
    description: string;
    visibility: TripVisibility;
    coverPlaceId: string;
    // The author's own photo (gallery or camera), when that is the cover.
    coverImage?: string;
  }) => void;
};

const visibilityOptionKeys: { id: TripVisibility; labelKey: TranslationKey; hintKey: TranslationKey }[] = [
  { id: "public", labelKey: "visibilityPublic", hintKey: "visibilityPublicHint" },
  { id: "link", labelKey: "visibilityLink", hintKey: "visibilityLinkHint" },
  { id: "private", labelKey: "visibilityPrivate", hintKey: "visibilityPrivateHint" },
];

// "전체 삭제": empties the field it belongs to (the AI's text is only a starting point). It takes no room while the field is empty.
function ClearAllButton({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      className={cn(
        "rounded-full px-3 py-1 text-xs font-extrabold text-muted-strong transition active:scale-95 ios-btn",
        hidden && "pointer-events-none invisible",
      )}
      disabled={hidden}
      onClick={onClick}
      tabIndex={hidden ? -1 : 0}
      type="button"
    >
      {t("publishClearAll")}
    </button>
  );
}

export function PublishSheet({ defaultDescription = "", defaultTitle = "", onCancel, onPublish, places }: PublishSheetProps) {
  const t = useT();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [visibility, setVisibility] = useState<TripVisibility>("public");
  // Default cover: the first spot that has a real photo.
  const [coverPlaceId, setCoverPlaceId] = useState(
    () => (places.find((place) => place.image) ?? places[0])?.id ?? "",
  );
  // The author's own photo: picked from the gallery or taken with the camera (the phone offers both for a file input
  // that accepts images). Once there is one it is the chosen cover until a spot's photo is tapped.
  const [uploadedCover, setUploadedCover] = useState<string | null>(null);
  const [useUploadedCover, setUseUploadedCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const { close: handleCancel, grabProps, isClosing, panelClass, panelRef, panelStyle, scrollRef } = useSheetDismiss<HTMLFormElement>(onCancel);

  async function handlePickedFile(file: File | undefined) {
    if (!file) {
      return;
    }
    try {
      setUploadedCover(await fileToCoverDataUrl(file));
      setUseUploadedCover(true);
      setError("");
    } catch {
      setError(t("publishCoverFailed"));
    }
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
    onPublish({
      title: title.trim(),
      description: description.trim(),
      visibility,
      coverPlaceId,
      coverImage: useUploadedCover && uploadedCover ? uploadedCover : undefined,
    });
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
          "glass-panel flex max-h-[86%] w-full flex-col rounded-t-[2rem] p-5 pb-6",
          panelClass,
        )}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        ref={panelRef}
        style={panelStyle}
      >
        {/* Grab handle: drag it (or the sheet, from its top) down to dismiss. */}
        <div
          className="-mx-5 -mt-5 shrink-0 px-5 pb-3 pt-3 flex cursor-grab touch-none justify-center active:cursor-grabbing"
          {...grabProps}
        >
          <span className="h-1.5 w-11 rounded-full bg-border-strong" />
        </div>

        {/* Runs down to the sheet's bottom edge and fades out over its last 2 rem (as in the category sheet). */}
        <div
          className="app-scroll-area -mb-6 min-h-0 flex-1 overflow-y-auto pb-10 [-webkit-mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)] [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]"
          ref={scrollRef}
        >
        <h2 className="text-2xl font-extrabold tracking-tight">{t("publishHeading")}</h2>
        <p className="mt-1.5 break-keep text-sm text-muted text-balance">{t("publishSubtitle", { count: places.length })}</p>

        <div className="mt-4">
          <p className="text-sm font-bold text-muted-strong">{t("publishCoverLabel")}</p>
          <div className="place-list-scroll mt-2 flex gap-3 overflow-x-auto">
            {places.map((place) => (
              <button
                aria-label={place.name}
                aria-pressed={!useUploadedCover && coverPlaceId === place.id}
                className={cn("relative shrink-0 rounded-2xl transition", (useUploadedCover || coverPlaceId !== place.id) && "opacity-70 hover:opacity-100")}
                key={place.id}
                onClick={() => {
                  setCoverPlaceId(place.id);
                  setUseUploadedCover(false);
                }}
                type="button"
              >
                <PlacePhoto className="h-[4.5rem] w-[4.5rem] rounded-2xl" fallbackSize="fill" place={place} />
                {/* The chosen one is outlined exactly on its own square, drawn inside it: no gap, and nothing sticks out
                    for the scrolling row to cut off. */}
                {!useUploadedCover && coverPlaceId === place.id && (
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl ring-[3px] ring-inset ring-primary" />
                )}
              </button>
            ))}
            {/* The author's own photo, once there is one, and at the very end the + that gets (or replaces) it. */}
            {uploadedCover && (
              <button
                aria-label={t("publishCoverOwnAria")}
                aria-pressed={useUploadedCover}
                className={cn("relative shrink-0 rounded-2xl transition", !useUploadedCover && "opacity-70 hover:opacity-100")}
                onClick={() => setUseUploadedCover(true)}
                type="button"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" className="block h-[4.5rem] w-[4.5rem] rounded-2xl object-cover" src={uploadedCover} />
                {useUploadedCover && (
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl ring-[3px] ring-inset ring-primary" />
                )}
              </button>
            )}
            <button
              aria-label={t("publishCoverAddAria")}
              className="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-2xl border-2 border-dashed border-border-strong bg-surface-muted text-muted-strong transition active:scale-95"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <PlusIcon className="h-6 w-6" />
            </button>
            <input
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                void handlePickedFile(event.target.files?.[0]);
                // The same photo can be picked again.
                event.target.value = "";
              }}
              ref={fileInputRef}
              tabIndex={-1}
              type="file"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">{t("publishCoverHint")}</p>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-muted-strong" htmlFor="publish-title">
              {t("publishTitleLabel")}
            </label>
            <ClearAllButton
              hidden={title.length === 0}
              onClick={() => {
                setTitle("");
                titleRef.current?.focus();
              }}
            />
          </div>
          <input
            className="ios-pill mt-2 h-12 w-full rounded-2xl px-4 text-base font-semibold text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-primary/40"
            id="publish-title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("publishTitlePlaceholder")}
            ref={titleRef}
            value={title}
          />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-muted-strong" htmlFor="publish-description">
              {t("publishDescriptionLabel")}
            </label>
            <ClearAllButton
              hidden={description.length === 0}
              onClick={() => {
                setDescription("");
                descriptionRef.current?.focus();
              }}
            />
          </div>
          <textarea
            className="ios-pill mt-2 min-h-24 w-full rounded-2xl px-4 py-3 text-base text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-primary/40"
            id="publish-description"
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("publishDescriptionPlaceholder")}
            ref={descriptionRef}
            value={description}
          />
        </div>

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
        </div>
      </form>
    </div>
  );
}
