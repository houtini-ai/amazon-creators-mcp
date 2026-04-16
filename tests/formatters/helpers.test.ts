import { describe, it, expect } from 'vitest';
import {
  brand,
  detailUrl,
  displayPrice,
  primaryImage,
  primaryListing,
  savingsSummary,
  starRating,
  title,
  truncate,
} from '../../src/formatters/helpers.js';
import type { Item } from '../../src/types/creators.js';

const baseItem = (overrides: Partial<Item> = {}): Item => ({
  asin: 'B00TEST0001',
  ...overrides,
});

describe('helpers', () => {
  describe('title', () => {
    it('returns the displayValue when present', () => {
      expect(title(baseItem({ itemInfo: { title: { displayValue: 'Foo' } } }))).toBe('Foo');
    });
    it('falls back to asin when missing', () => {
      expect(title(baseItem())).toBe('B00TEST0001');
    });
  });

  describe('brand', () => {
    it('returns the brand when present', () => {
      expect(brand(baseItem({ itemInfo: { byLineInfo: { brand: { displayValue: 'Amazon' } } } }))).toBe('Amazon');
    });
    it('returns undefined when missing', () => {
      expect(brand(baseItem())).toBeUndefined();
    });
  });

  describe('primaryImage', () => {
    it('prefers large > medium > small > highRes', () => {
      expect(
        primaryImage(
          baseItem({
            images: {
              primary: {
                small: { url: 's' },
                medium: { url: 'm' },
                large: { url: 'l' },
              },
            },
          }),
        ),
      ).toBe('l');
      expect(
        primaryImage(
          baseItem({
            images: { primary: { small: { url: 's' }, medium: { url: 'm' } } },
          }),
        ),
      ).toBe('m');
    });
    it('returns undefined when no image', () => {
      expect(primaryImage(baseItem())).toBeUndefined();
    });
  });

  describe('primaryListing', () => {
    it('returns the buybox winner', () => {
      const item = baseItem({
        offersV2: {
          listings: [
            { isBuyBoxWinner: false, price: { money: { amount: 10, currency: 'USD', displayAmount: '$10' } } },
            { isBuyBoxWinner: true, price: { money: { amount: 20, currency: 'USD', displayAmount: '$20' } } },
          ],
        },
      });
      expect(primaryListing(item)?.price?.money.amount).toBe(20);
    });
    it('falls back to the first listing if no buybox winner', () => {
      const item = baseItem({
        offersV2: {
          listings: [{ price: { money: { amount: 5, currency: 'USD', displayAmount: '$5' } } }],
        },
      });
      expect(primaryListing(item)?.price?.money.amount).toBe(5);
    });
  });

  describe('displayPrice', () => {
    it('returns the displayAmount from the primary listing', () => {
      const item = baseItem({
        offersV2: {
          listings: [
            { isBuyBoxWinner: true, price: { money: { amount: 99, currency: 'USD', displayAmount: '$99.00' } } },
          ],
        },
      });
      expect(displayPrice(item)).toBe('$99.00');
    });
  });

  describe('savingsSummary', () => {
    it('includes amount and percentage when both present', () => {
      const item = baseItem({
        offersV2: {
          listings: [
            {
              isBuyBoxWinner: true,
              price: {
                money: { amount: 90, currency: 'USD', displayAmount: '$90' },
                savings: { money: { amount: 10, currency: 'USD', displayAmount: '$10' }, percentage: 10 },
              },
            },
          ],
        },
      });
      expect(savingsSummary(item)).toBe('save $10 (10% off)');
    });
    it('returns undefined when no savings', () => {
      expect(savingsSummary(baseItem())).toBeUndefined();
    });
  });

  describe('detailUrl', () => {
    it('uses the detailPageURL as-is when present (already contains tag)', () => {
      const item = baseItem({ detailPageURL: 'https://example.com/dp/X?tag=pre' });
      expect(detailUrl(item, 'www.amazon.com', 'ignored-20')).toBe('https://example.com/dp/X?tag=pre');
    });
    it('constructs a tagged dp URL when missing', () => {
      const item = baseItem({ asin: 'ABCDEFGHIJ' });
      expect(detailUrl(item, 'www.amazon.com', 'mytag-20')).toBe(
        'https://www.amazon.com/dp/ABCDEFGHIJ?tag=mytag-20',
      );
    });
  });

  describe('truncate', () => {
    it('returns the string unchanged when shorter than max', () => {
      expect(truncate('Echo Show 5', 80)).toBe('Echo Show 5');
    });
    it('returns the string unchanged when max <= 0', () => {
      expect(truncate('anything', 0)).toBe('anything');
      expect(truncate('anything', -5)).toBe('anything');
    });
    it('truncates at word boundary when one is in the back half of the budget', () => {
      // Budget = 19 → slice = 19 chars: "The quick brown fox" — lastSpace is at 15
      // (back half threshold 9.5) → cut at "The quick brown" + ellipsis.
      const out = truncate('The quick brown fox jumps over the lazy dog', 20);
      expect(out).toBe('The quick brown\u2026');
      expect(out.length).toBeLessThanOrEqual(20);
    });
    it('hard-cuts mid-word when the last space is too early', () => {
      // "Supercalifragilisticexpialidocious" has no spaces — no word boundary to
      // prefer, so we hard-cut at budget (max-1 = 9 chars) and append the ellipsis.
      const out = truncate('Supercalifragilisticexpialidocious', 10);
      expect(out).toBe('Supercali\u2026');
      expect(out.length).toBe(10);
    });
    it('strips trailing punctuation that sits next to an ellipsis', () => {
      // max=10, budget=9, slice="Apples, o", lastSpace=7 (7>4.5 ⇒ word-boundary
      // cut to "Apples,"), trailing "," gets stripped before the ellipsis.
      const out = truncate('Apples, oranges, bananas, pears', 10);
      expect(out).toBe('Apples\u2026');
    });
    it('handles empty string', () => {
      expect(truncate('', 10)).toBe('');
    });
  });

  describe('starRating', () => {
    it('formats rating + count', () => {
      expect(
        starRating(baseItem({ customerReviews: { count: 1234, starRating: { value: 4.567 } } })),
      ).toBe('4.6★ (1,234 reviews)');
    });
    it('shows just stars when no count', () => {
      expect(starRating(baseItem({ customerReviews: { starRating: { value: 4 } } }))).toBe('4★');
    });
    it('undefined when no rating', () => {
      expect(starRating(baseItem())).toBeUndefined();
    });
  });
});
