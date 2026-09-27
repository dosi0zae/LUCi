// Direct share-intent web links for platforms that actually publish one. Instagram and
// TikTok deliberately don't offer a public "share this URL/image from a website" intent —
// the only way content reaches them is the OS-level share sheet (see shareTrip() in
// trip-detail-sheet.tsx, which is why that stays the first, most-used option in the
// share menu). These three cover the platforms that DO support a one-tap deep link.

export function buildTwitterShareUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildFacebookShareUrl(url: string): string {
  const params = new URLSearchParams({ u: url });
  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
}

export function buildWhatsAppShareUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text: `${text} ${url}` });
  return `https://wa.me/?${params.toString()}`;
}
