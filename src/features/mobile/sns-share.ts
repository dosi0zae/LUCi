// Direct share-intent web links for platforms that actually publish one. Instagram and
// TikTok deliberately don't offer a public "share this URL/image from a website" intent —
// the only way content reaches them is the OS-level share sheet (see shareTrip() in
// trip-detail-sheet.tsx, which is why that stays the first, most-used option in the
// share menu). These three cover the platforms that DO support a one-tap deep link.

// Every link here carries the address alone: the app builds the preview card (picture, title, stops) from the page's own tags
// (src/app/mobile/page.tsx), so a text next to it would only repeat the card as a second line.
export function buildTwitterShareUrl(url: string): string {
  const params = new URLSearchParams({ url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildFacebookShareUrl(url: string): string {
  const params = new URLSearchParams({ u: url });
  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
}

// LINE (the main chat app in Japan) has a public share link too.
export function buildLineShareUrl(url: string): string {
  const params = new URLSearchParams({ url });
  return `https://social-plugins.line.me/lineit/share?${params.toString()}`;
}

export function buildWhatsAppShareUrl(url: string): string {
  const params = new URLSearchParams({ text: url });
  return `https://wa.me/?${params.toString()}`;
}
