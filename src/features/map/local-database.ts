import { TripDraft } from "./trip-draft";

export type FeedTrip = {
  author: string;
  comments: number;
  id: string;
  likes: number;
  places: number;
  rankScore: number;
  saved: number;
  tags: string[];
  title: string;
  totalMinutes: number;
};

export type UserRecord = {
  displayName: string;
  followers: number;
  following: number;
  handle: string;
  id: string;
  publishedTrips: number;
};

export type AdminMetrics = {
  activeUsers: number;
  comments: number;
  publishedTrips: number;
  reports: number;
  savedTrips: number;
};

export const seedTrips: FeedTrip[] = [
  {
    author: "mina.route",
    comments: 18,
    id: "seed-seongsu",
    likes: 384,
    places: 5,
    rankScore: 96,
    saved: 142,
    tags: ["성수", "전시", "팝업"],
    title: "성수 전시와 팝업을 잇는 오후",
    totalMinutes: 190,
  },
  {
    author: "walk.seoul",
    comments: 9,
    id: "seed-forest",
    likes: 211,
    places: 4,
    rankScore: 88,
    saved: 93,
    tags: ["서울숲", "카페", "산책"],
    title: "서울숲에서 뚝섬까지 느린 산책",
    totalMinutes: 155,
  },
  {
    author: "popup.finder",
    comments: 27,
    id: "seed-popup",
    likes: 512,
    places: 6,
    rankScore: 99,
    saved: 238,
    tags: ["한정", "굿즈", "포토존"],
    title: "이번 주 성수 팝업 몰아보기",
    totalMinutes: 220,
  },
];

export const seedUsers: UserRecord[] = [
  {
    displayName: "Mina",
    followers: 1280,
    following: 84,
    handle: "mina.route",
    id: "user-mina",
    publishedTrips: 18,
  },
  {
    displayName: "Walk Seoul",
    followers: 942,
    following: 112,
    handle: "walk.seoul",
    id: "user-walk",
    publishedTrips: 11,
  },
  {
    displayName: "Popup Finder",
    followers: 2210,
    following: 51,
    handle: "popup.finder",
    id: "user-popup",
    publishedTrips: 24,
  },
];

export function draftToFeedTrip(draft: TripDraft): FeedTrip {
  return {
    author: "you",
    comments: 0,
    id: draft.id,
    likes: 0,
    places: draft.places.length,
    rankScore: 72,
    saved: 0,
    tags: draft.places.slice(0, 3).map((place) => place.category),
    title: draft.title,
    totalMinutes: draft.totalMinutes,
  };
}

export function getAdminMetrics(trips: FeedTrip[]): AdminMetrics {
  return {
    activeUsers: seedUsers.length + 1,
    comments: trips.reduce((total, trip) => total + trip.comments, 0),
    publishedTrips: trips.length,
    reports: 2,
    savedTrips: trips.reduce((total, trip) => total + trip.saved, 0),
  };
}

export function rankTrips(trips: FeedTrip[]) {
  return [...trips].sort((a, b) => b.rankScore - a.rankScore);
}
