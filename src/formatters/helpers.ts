/**
 * Shared helpers for pulling human-friendly fields out of Creators API items.
 * All helpers are pure and accept partial / missing data.
 */
import type { Item, Listing } from '../types/creators.js';

export const AMAZON_DISCLOSURE =
  'As an Amazon Associate we earn from qualifying purchases. Prices and availability are accurate as of the time shown and are subject to change.';

export function title(item: Item): string {
  const raw = item.itemInfo?.title?.displayValue;
  return typeof raw === 'string' && raw.length > 0 ? raw : item.asin;
}

/**
 * Truncate a string to `max` characters, preferring a word boundary and
 * appending a single-character ellipsis ("…"). Amazon titles are frequently
 * 120-200 characters of keyword-stuffed SEO noise — useful to the marketplace,
 * hostile to a blog reader. 80 chars keeps one line on most card widths.
 *
 * Invariants:
 *   - `max <= 0` or `!s` → returns `s` unchanged (defensive).
 *   - When truncation happens, the result INCLUDING the ellipsis is ≤ `max`.
 *   - Word-boundary preference kicks in only when the last word break sits in
 *     the back half of the budget — otherwise we'd chop off most of a short
 *     string just to land on a space.
 *   - Trailing whitespace and trailing punctuation that looks ugly next to an
 *     ellipsis (commas, dashes, colons, semicolons) are stripped before the
 *     ellipsis is appended.
 */
export function truncate(s: string, max: number): string {
  if (!s || max <= 0 || s.length <= max) return s;
  // Reserve 1 char for the ellipsis.
  const budget = max - 1;
  const slice = s.slice(0, budget);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > budget * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,\-:;]+$/u, '')}\u2026`;
}

export function brand(item: Item): string | undefined {
  const raw = item.itemInfo?.byLineInfo?.brand?.displayValue;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export function primaryImage(item: Item): string | undefined {
  const img = item.images?.primary;
  return img?.large?.url ?? img?.medium?.url ?? img?.small?.url ?? img?.highRes?.url;
}

/** Buy-box listing if present, else first listing, else undefined. */
export function primaryListing(item: Item): Listing | undefined {
  const listings = item.offersV2?.listings ?? [];
  return listings.find((l) => l.isBuyBoxWinner) ?? listings[0];
}

export function displayPrice(item: Item): string | undefined {
  return primaryListing(item)?.price?.money?.displayAmount;
}

export function savingsSummary(item: Item): string | undefined {
  const savings = primaryListing(item)?.price?.savings;
  if (!savings) return undefined;
  const amt = savings.money?.displayAmount;
  const pct = savings.percentage;
  if (amt && typeof pct === 'number') return `save ${amt} (${pct}% off)`;
  if (amt) return `save ${amt}`;
  if (typeof pct === 'number') return `${pct}% off`;
  return undefined;
}

/** Prefer detailPageURL (already has tag + linkCode appended by Amazon). Fallback to constructed dp URL. */
export function detailUrl(item: Item, marketplace: string, partnerTag: string): string {
  if (item.detailPageURL && item.detailPageURL.length > 0) return item.detailPageURL;
  return `https://${marketplace}/dp/${item.asin}?tag=${encodeURIComponent(partnerTag)}`;
}

export function starRating(item: Item): string | undefined {
  const value = item.customerReviews?.starRating?.value;
  const count = item.customerReviews?.count;
  if (typeof value !== 'number') return undefined;
  const rounded = Math.round(value * 10) / 10;
  return typeof count === 'number' && count > 0
    ? `${rounded}★ (${count.toLocaleString()} reviews)`
    : `${rounded}★`;
}
