import { MapPlace } from "./place-detail-card";

export type TripVisibility = "public" | "link" | "private";

export type TripDraft = {
  description: string;
  id: string;
  places: MapPlace[];
  publishedAt: string;
  title: string;
  totalMinutes: number;
  visibility: TripVisibility;
};

export function getTotalMinutes(places: MapPlace[]) {
  return places.reduce((total, place) => {
    const minutes = Number.parseInt(place.duration, 10);

    return Number.isNaN(minutes) ? total : total + minutes;
  }, 0);
}
