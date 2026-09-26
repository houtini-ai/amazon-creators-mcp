/**
 * `html-deals` — emit the canonical Amazon deals-row markup.
 *
 * The other HTML formats render a self-contained card with their own styling.
 * That is right for a one-off embed, but wrong when the destination already has
 * house CSS: you get a card that looks like a card, sitting inside an article
 * that looks like the article.
 *
 * This format emits the `.amazon-deals-section` / `.amazon-deal-row` structure
 * instead, so the output inherits whatever the publishing template already
 * defines and drops into a post without restyling. The CSS is therefore NOT
 * emitted by default — pass `includeCss` for standalone use (a site that has
 * not embedded the stylesheet yet). `customStyles` is always emitted when set,
 * so it can tweak the house CSS without dragging the full stylesheet along.
 *
 * Two things are deliberately absent:
 *
 * - **The Prime badge.** The reference template hardcodes "Prime eligible", but
 *   nothing in the Creators API response tells us whether an item actually is.
 *   Printing it anyway would be inventing a delivery promise on a page the
 *   reader may buy from, so it is omitted rather than assumed.
 * - **Empty star rows.** `customerReviews` is requested but frequently absent
 *   from live responses. Where there is no rating, the whole rating block is
 *   dropped rather than rendered as zero stars.
 */
import type { FormatterInput, FormatterOutput } from './types.js';
import type { GetItemsResponse, GetVariationsResponse, SearchItemsResponse } from '../types/creators.js';
import {
  AMAZON_DISCLOSURE,
  brand,
  detailUrl,
  displayPrice,
  primaryImage,
  savingsSummary,
  title,
  truncate,
} from './helpers.js';
import { extractItems } from './html.js';
import { DEALS_CSS } from './deals-css.js';

export interface DealsFormatterInput<T> extends FormatterInput<T> {
  /** Emit the stylesheet alongside the markup. Off by default — most destinations already define it. */
  includeCss?: boolean;
  /** Optional `<h3>` above the rows, e.g. "This week's picks". Omitted when unset. */
  heading?: string;
  /**
   * Feature bullets per row. Defaults to 0: the row is a fixed-height list
   * item, and bullets would blow that height. Raise it only alongside custom
   * CSS that unsets `.amazon-deal-features { display: none }` and the row's
   * max-height.
   */
  featureCount?: number;
}

/** Render a numeric rating as filled / half / empty stars, matching the template's glyphs. */
function starGlyphs(value: number): string {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return '★'.repeat(full) + (half ? '☆' : '') + '·'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
}

export function formatDealsSection<
  R extends SearchItemsResponse | GetItemsResponse | GetVariationsResponse,
>(input: DealsFormatterInput<R>): FormatterOutput<R> {
  const {
    response,
    marketplace,
    partnerTag,
    customStyles,
    retrievedAt,
    titleMaxChars,
    hideItemsWithoutPrice = true,
    includeCss = false,
    heading,
    featureCount = 0,
  } = input;

  const all = extractItems(response);
  const items = hideItemsWithoutPrice ? all.filter((i) => displayPrice(i) !== undefined) : all;
  const ts = retrievedAt ?? new Date().toISOString();

  const rows = items.map((item) => {
    const href = detailUrl(item, marketplace, partnerTag);
    const img = primaryImage(item);
    const price = displayPrice(item);
    const savings = savingsSummary(item);
    const brandName = brand(item);

    const rating = item.customerReviews?.starRating?.value;
    const reviewCount = item.customerReviews?.count;
    const ratingBlock =
      typeof rating === 'number'
        ? `      <div class="amazon-deal-rating">
        <span class="amazon-stars">${starGlyphs(rating)}</span>
        <span class="amazon-review-count">${
          typeof reviewCount === 'number' && reviewCount > 0
            ? `${reviewCount.toLocaleString()} reviews`
            : `${Math.round(rating * 10) / 10} out of 5`
        }</span>
      </div>\n`
        : '';

    const features = (item.itemInfo?.features?.displayValues ?? [])
      .slice(0, featureCount)
      .map((f) => `          <li>${esc(truncate(String(f), 140))}</li>`)
      .join('\n');

    const featureBlock = features
      ? `      <div class="amazon-deal-features">\n        <ul>\n${features}\n        </ul>\n      </div>\n`
      : '';

    const imageBlock = img
      ? `    <div class="amazon-deal-image">
      <img src="${esc(img)}" alt="${esc(title(item))}" loading="lazy">
    </div>\n`
      : '';

    return `  <div class="amazon-deal-row">
${imageBlock}    <div class="amazon-deal-info">
      <h4 class="amazon-deal-title">${esc(truncate(title(item), titleMaxChars || 0))}</h4>
${brandName ? `      <div class="amazon-deal-brand">${esc(brandName)}</div>\n` : ''}${ratingBlock}${featureBlock}    </div>
    <div class="amazon-deal-price">
      <span class="amazon-price-amount">${esc(price ?? 'See price on Amazon')}</span>
${savings ? `      <span class="amazon-deal-savings">${esc(savings)}</span>\n` : ''}      <a href="${esc(href)}" class="amazon-buy-button" target="_blank" rel="sponsored nofollow noopener">View on Amazon</a>
    </div>
  </div>`;
  });

  const userStyles = customStyles && customStyles.trim().length > 0 ? customStyles : '';
  const cssBody = [includeCss ? DEALS_CSS : '', userStyles ? `${userStyles}\n` : ''].filter(Boolean).join('\n');
  const css = cssBody ? `<style>\n${cssBody}</style>\n` : '';
  const headingHtml = heading ? `  <h3 class="amazon-deals-header">${esc(heading)}</h3>\n` : '';

  const text = `${css}<div class="amazon-deals-section">
${headingHtml}${rows.join('\n')}
  <p class="amazon-deal-disclosure">${esc(AMAZON_DISCLOSURE)} Checked ${esc(readableDate(ts))}.</p>
</div>`;

  // Echo the original envelope (not the filtered items) so it can be passed
  // straight back to `format_items`, like the other formats' output.
  return { text, structured: response };
}

/**
 * The disclosure already says prices are "accurate as of the time shown", so the
 * only job here is to show that time in a form a reader parses at a glance. A
 * raw ISO timestamp is precision nobody wants on a blog post - the day is the
 * useful unit, and it is what the Associates terms are really asking for.
 */
function readableDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // UTC, so the day matches the UTC timestamps the other formats show.
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
