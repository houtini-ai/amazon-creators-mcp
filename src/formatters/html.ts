/**
 * HTML formatters for v0.2 — `html-card` (single item) and `html-grid` (multiple items).
 *
 * Design note (v0.2, per project memory `project_v02_mcp_ui_goal.md`):
 * The target user is a non-developer creator who will ask Claude in chat to tweak
 * the rendered card ("make the price bigger", "dark card", "add a border"). For that
 * loop to work Claude needs to be able to hit one spot to change one thing. So:
 *   - The template is a single readable string, NOT a decomposed helper chain.
 *   - Every visible element has a stable `amzn-card__*` class anchor so Claude can
 *     target "the title" or "the CTA" via `customStyles` without touching the template.
 *   - `customStyles` is appended verbatim to the <style> block so the user iterates
 *     without the repo changing between renders.
 *
 * Output is intended to be pasted into Ghost / Substack / WordPress / any HTML field.
 * All values are HTML-escaped — the marketplace returns user-influenced strings
 * (titles, brands) and we never want those to inject markup.
 */
import type { FormatterInput, FormatterOutput } from './types.js';
import type {
  SearchItemsResponse,
  GetItemsResponse,
  GetVariationsResponse,
  Item,
} from '../types/creators.js';
import {
  AMAZON_DISCLOSURE,
  brand,
  detailUrl,
  displayPrice,
  primaryImage,
  savingsSummary,
  starRating,
  title,
  truncate,
} from './helpers.js';

/** Escape for use in an HTML text node or double-quoted attribute value. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Default stylesheet. Kept small and readable. Every class here has a matching
 * anchor used by `renderCard()` below. The `customStyles` block is appended to
 * this so user overrides win by CSS specificity ordering (later-declared rule).
 */
const DEFAULT_STYLES = `
.amzn-card {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  max-width: 320px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  background: #ffffff;
  color: #111827;
  box-sizing: border-box;
}
.amzn-card__image-wrap {
  display: block;
  margin-bottom: 12px;
}
.amzn-card__image {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
.amzn-card__title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  margin: 0 0 8px 0;
}
.amzn-card__title a { color: inherit; text-decoration: none; }
.amzn-card__title a:hover { text-decoration: underline; }
.amzn-card__meta {
  font-size: 13px;
  color: #4b5563;
  margin: 0 0 8px 0;
}
.amzn-card__brand { margin-right: 8px; }
.amzn-card__rating { }
.amzn-card__price {
  font-size: 20px;
  font-weight: 700;
  margin: 8px 0 4px 0;
}
.amzn-card__price--unavailable {
  font-size: 14px;
  font-weight: 500;
  color: #4b5563;
}
.amzn-card__price--unavailable a {
  color: inherit;
  text-decoration: underline;
}
.amzn-card__price-timestamp {
  font-size: 11px;
  font-weight: 400;
  color: #9ca3af;
  margin-left: 8px;
  vertical-align: middle;
  white-space: nowrap;
}
.amzn-card__savings {
  font-size: 13px;
  color: #b91c1c;
  margin: 0 0 12px 0;
}
.amzn-card__cta {
  display: inline-block;
  padding: 10px 16px;
  background: #ffd814;
  color: #0f1111;
  border: 1px solid #fcd200;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  font-size: 14px;
}
.amzn-card__cta:hover { background: #f7ca00; }
.amzn-card__disclosure {
  margin-top: 12px;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.4;
}
.amzn-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.amzn-grid .amzn-card { max-width: none; }
.amzn-grid__disclosure {
  grid-column: 1 / -1;
  font-size: 11px;
  color: #6b7280;
  margin-top: 4px;
}
`;

interface RenderCardOptions {
  /** See FormatterInput.titleMaxChars — `undefined` / `0` disables truncation. */
  titleMaxChars?: number;
}

function renderCard(
  item: Item,
  marketplace: string,
  partnerTag: string,
  retrievedAt: string,
  options: RenderCardOptions = {},
): string {
  const url = detailUrl(item, marketplace, partnerTag);
  const rawTitle = title(item);
  const t =
    options.titleMaxChars && options.titleMaxChars > 0
      ? truncate(rawTitle, options.titleMaxChars)
      : rawTitle;
  const img = primaryImage(item);
  const price = displayPrice(item);
  const savings = savingsSummary(item);
  const stars = starRating(item);
  const brandName = brand(item);

  // `referrerpolicy="no-referrer"` — Amazon's image CDN (`m.media-amazon.com`)
  // occasionally hotlink-blocks requests that carry a Referer from unexpected
  // origins. MCP Apps hosts like Claude Desktop render our viewer in a
  // sandboxed webview whose origin is opaque from Amazon's perspective. Sending
  // no referrer is the safest bet and has zero downside for regular blog paste
  // (the CDN serves anonymous requests fine).
  const imageBlock = img
    ? `<a class="amzn-card__image-wrap" href="${escapeHtml(url)}" rel="nofollow sponsored noopener" target="_blank"><img class="amzn-card__image" src="${escapeHtml(img)}" alt="${escapeHtml(t)}" loading="lazy" referrerpolicy="no-referrer" /></a>`
    : '';

  const metaParts: string[] = [];
  if (brandName) metaParts.push(`<span class="amzn-card__brand">${escapeHtml(brandName)}</span>`);
  if (stars) metaParts.push(`<span class="amzn-card__rating">${escapeHtml(stars)}</span>`);
  const metaBlock = metaParts.length ? `<p class="amzn-card__meta">${metaParts.join(' · ')}</p>` : '';

  // Associates compliance: a displayed price must be accompanied by the retrieval
  // timestamp + a "subject to change" notice (latter lives in the disclosure block).
  // Rendered inline next to the price so it survives CMS paste operations that
  // strip siblings; styled muted so it doesn't distract from the CTA.
  //
  // Fallback when price data is missing: we can't legally show a price we don't
  // have, and a card with no price block at all looks broken. Render a muted
  // "Check price on Amazon" link that shares the `.amzn-card__price` anchor (so
  // customStyles still hit it) plus a `--unavailable` modifier for styling off.
  // No timestamp — we didn't retrieve a price, so there's nothing to stamp.
  const priceBlock = price
    ? `<p class="amzn-card__price">${escapeHtml(price)}<span class="amzn-card__price-timestamp"> · as of <time datetime="${escapeHtml(retrievedAt)}">${escapeHtml(humaniseTimestamp(retrievedAt))}</time></span></p>`
    : `<p class="amzn-card__price amzn-card__price--unavailable"><a href="${escapeHtml(url)}" rel="nofollow sponsored noopener" target="_blank">Check price on Amazon</a></p>`;
  const savingsBlock = savings ? `<p class="amzn-card__savings">${escapeHtml(savings)}</p>` : '';

  return [
    `<article class="amzn-card" data-asin="${escapeHtml(item.asin)}">`,
    imageBlock,
    `  <h3 class="amzn-card__title"><a href="${escapeHtml(url)}" rel="nofollow sponsored noopener" target="_blank">${escapeHtml(t)}</a></h3>`,
    metaBlock,
    priceBlock,
    savingsBlock,
    `  <a class="amzn-card__cta" href="${escapeHtml(url)}" rel="nofollow sponsored noopener" target="_blank">View on Amazon</a>`,
    `</article>`,
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}

function wrapDocument(body: string, customStyles: string | undefined): string {
  const userStyles = customStyles && customStyles.trim().length > 0 ? `\n/* customStyles */\n${customStyles}` : '';
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<style>${DEFAULT_STYLES}${userStyles}</style>`,
    `</head>`,
    `<body>`,
    body,
    `</body>`,
    `</html>`,
  ].join('\n');
}

function disclosureBlock(className: string): string {
  return `<p class="${className}">${escapeHtml(AMAZON_DISCLOSURE)}</p>`;
}

/** Normalise any response shape to a flat `Item[]` for rendering. */
export function extractItems(
  response: SearchItemsResponse | GetItemsResponse | GetVariationsResponse,
): Item[] {
  if ('searchResult' in response && response.searchResult?.items) return response.searchResult.items;
  if ('itemsResult' in response && response.itemsResult?.items) return response.itemsResult.items;
  if ('variationsResult' in response && response.variationsResult?.items) return response.variationsResult.items;
  return [];
}

/**
 * `html-card`: render the first item only. If multiple items are present, the
 * rest are silently dropped — callers who want all items should request
 * `html-grid` instead. Intended for a single-product embed.
 */
/**
 * Resolve the timestamp to render next to a price. Falls back to "now" so the
 * formatter is safe to call standalone, but tool runners always pass an explicit
 * value so re-renders via `format_items` preserve the original fetch time.
 * Milliseconds are stripped — price precision doesn't warrant them.
 */
function resolveTimestamp(retrievedAt: string | undefined): string {
  const raw = retrievedAt ?? new Date().toISOString();
  return raw.replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Convert ISO-8601 UTC to a reader-friendly form: "16 Apr 2026, 13:37 UTC".
 * The machine-readable ISO stays in the `<time datetime="...">` attribute for
 * parsers / SEO; this is only for the visible text. Falls back to raw ISO if
 * the input doesn't match the expected shape.
 */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function humaniseTimestamp(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, h, min] = m;
  const monthName = MONTH_ABBR[parseInt(mo!, 10) - 1] ?? mo;
  return `${parseInt(d!, 10)} ${monthName} ${y}, ${h}:${min} UTC`;
}

export function formatHtmlCard<
  R extends SearchItemsResponse | GetItemsResponse | GetVariationsResponse,
>(input: FormatterInput<R>): FormatterOutput<R> {
  const { response, marketplace, partnerTag, customStyles, retrievedAt, titleMaxChars } = input;
  const ts = resolveTimestamp(retrievedAt);
  const items = extractItems(response);
  const first = items[0];
  // Note: `hideItemsWithoutPrice` is intentionally NOT applied for html-card —
  // the caller has asked for THIS one product; swapping it for a different one
  // (or erasing it) would violate least-surprise. The missing-price fallback
  // link in renderCard() handles that case gracefully.
  const cardBody = first
    ? renderCard(first, marketplace, partnerTag, ts, { titleMaxChars })
    : `<p class="amzn-card amzn-card--empty">No product found.</p>`;
  const body = [cardBody, disclosureBlock('amzn-card__disclosure')].join('\n');
  return {
    text: wrapDocument(body, customStyles),
    structured: response,
  };
}

/**
 * `html-grid`: render all items in a responsive CSS grid.
 */
export function formatHtmlGrid<
  R extends SearchItemsResponse | GetItemsResponse | GetVariationsResponse,
>(input: FormatterInput<R>): FormatterOutput<R> {
  const {
    response,
    marketplace,
    partnerTag,
    customStyles,
    retrievedAt,
    titleMaxChars,
    hideItemsWithoutPrice = true,
  } = input;
  const ts = resolveTimestamp(retrievedAt);
  const allItems = extractItems(response);
  // Default: filter out cards with no price — they're weak embeds for blog
  // content (no hook, no savings number, the reader has to click through just
  // to find out whether the product is interesting). Opt-in override via
  // `hideItemsWithoutPrice: false` for e.g. comparison tables where
  // availability can lapse but the reader still wants to see the product.
  const items = hideItemsWithoutPrice
    ? allItems.filter((it) => displayPrice(it) !== undefined)
    : allItems;
  const cards = items.length
    ? items.map((it) => renderCard(it, marketplace, partnerTag, ts, { titleMaxChars })).join('\n')
    : `<p>No products found.</p>`;
  const body = [`<section class="amzn-grid">`, cards, disclosureBlock('amzn-grid__disclosure'), `</section>`].join('\n');
  return {
    text: wrapDocument(body, customStyles),
    structured: response,
  };
}
