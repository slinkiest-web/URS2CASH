/**
 * Infers `listing_viewed`'s `referrer_surface` property (PRD §3.5/§10 Epic
 * C1 AC6) from the inbound `Referer` header, rather than threading a
 * `?ref=` query param through every `ListingCard` call site (category page,
 * search, recently-listed, and — Epic C4 — seller profile). Keeps this
 * prompt's footprint to listing detail only.
 */
export function inferReferrerSurface(refererHeader: string | null): string {
  if (!refererHeader) return "direct";

  let pathname: string;
  try {
    pathname = new URL(refererHeader).pathname;
  } catch {
    return "direct";
  }

  if (pathname === "/") return "home";
  if (pathname.startsWith("/c/")) return "category_page";
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/s/")) return "seller_profile";
  if (pathname.startsWith("/l/")) return "listing_detail";
  return "other";
}
