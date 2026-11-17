import type { Locale } from "@/features/mobile/i18n/translations";

// The mood / setting tags of the places that carry no translations of their own (the sights found with the
// evidence pipeline): the ids are the Korean words of attribute-vocab.json, shown in the UI language.
const LABELS: Record<string, Partial<Record<Exclude<Locale, "ko">, string>>> = {
  실내: { en: "Indoor", ja: "屋内", zh: "室内" },
  실외: { en: "Outdoor", ja: "屋外", zh: "户外" },
  무료: { en: "Free", ja: "無料", zh: "免费" },
  도보코스: { en: "Walking route", ja: "徒歩コース", zh: "步行路线" },
  혼자: { en: "Solo", ja: "ひとり旅", zh: "独自出行" },
  친구모임: { en: "With friends", ja: "友人と", zh: "朋友聚会" },
  가족동반: { en: "Family", ja: "家族連れ", zh: "家庭同行" },
  커플: { en: "Couples", ja: "カップル", zh: "情侣" },
  역사탐방: { en: "History", ja: "歴史探訪", zh: "历史探访" },
  전통문화: { en: "Traditional culture", ja: "伝統文化", zh: "传统文化" },
  체험형: { en: "Hands-on", ja: "体験型", zh: "体验型" },
  예술: { en: "Art", ja: "アート", zh: "艺术" },
  자연: { en: "Nature", ja: "自然", zh: "自然" },
  이색: { en: "Unique", ja: "ユニーク", zh: "特色" },
  포토존: { en: "Photo spot", ja: "フォトスポット", zh: "拍照点" },
  야경: { en: "Night view", ja: "夜景", zh: "夜景" },
  조용함: { en: "Quiet", ja: "静か", zh: "安静" },
  활기참: { en: "Lively", ja: "にぎやか", zh: "热闹" },
  로맨틱: { en: "Romantic", ja: "ロマンチック", zh: "浪漫" },
  휴식: { en: "Relaxing", ja: "くつろぎ", zh: "休憩" },
};

export function attributeLabel(tag: string, locale: Locale): string {
  return locale === "ko" ? tag : (LABELS[tag]?.[locale] ?? tag);
}

const NO_INFO: Record<Exclude<Locale, "ko">, string> = { en: "No info", ja: "情報なし", zh: "暂无信息" };
const FREE: Record<Exclude<Locale, "ko">, string> = { en: "Free", ja: "無料", zh: "免费" };

// Fee and opening hours of a place without translations: the two stock phrases, anything else as it is.
export function localizeFee(fee: string, locale: Locale): string {
  if (locale === "ko") return fee;
  if (fee === "무료") return FREE[locale];
  if (fee === "정보 없음") return NO_INFO[locale];
  return fee;
}

export function localizeHours(hours: string, locale: Locale): string {
  return locale !== "ko" && hours === "정보 없음" ? NO_INFO[locale] : hours;
}
