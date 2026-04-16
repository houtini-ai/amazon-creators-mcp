import { describe, it, expect } from 'vitest';
import {
  formatSearchItemsMarkdown,
  formatGetItemsMarkdown,
  formatGetVariationsMarkdown,
  formatGetBrowseNodesMarkdown,
} from '../../src/formatters/markdown.js';
import type {
  SearchItemsResponse,
  GetItemsResponse,
  GetVariationsResponse,
  GetBrowseNodesResponse,
} from '../../src/types/creators.js';

const FIXTURE_ITEM = {
  asin: 'B09B2SBHQK',
  detailPageURL: 'https://www.amazon.com/dp/B09B2SBHQK?tag=sometag-20&linkCode=osi',
  images: {
    primary: {
      medium: { url: 'https://img/medium.jpg', width: 160, height: 160 },
      large: { url: 'https://img/large.jpg', width: 500, height: 500 },
    },
  },
  itemInfo: {
    title: { displayValue: 'Echo Show 5', label: 'Title', locale: 'en_US' },
    byLineInfo: { brand: { displayValue: 'Amazon', label: 'Brand', locale: 'en_US' } },
  },
  offersV2: {
    listings: [
      {
        isBuyBoxWinner: true,
        price: {
          money: { amount: 79.99, currency: 'USD', displayAmount: '$79.99' },
          savings: {
            money: { amount: 10, currency: 'USD', displayAmount: '$10.00' },
            percentage: 11,
          },
        },
      },
    ],
  },
  customerReviews: { count: 12345, starRating: { value: 4.6 } },
};

describe('markdown formatters', () => {
  describe('formatSearchItemsMarkdown', () => {
    it('renders title, brand, price, savings, stars, and tagged URL', () => {
      const response: SearchItemsResponse = {
        searchResult: {
          items: [FIXTURE_ITEM],
          totalResultCount: 42,
          searchURL: 'https://www.amazon.com/s?k=echo',
        },
      };
      const out = formatSearchItemsMarkdown({
        response,
        partnerTag: 'sometag-20',
        marketplace: 'www.amazon.com',
      });
      expect(out.text).toContain('## Amazon search results (42 total)');
      expect(out.text).toContain('Echo Show 5');
      expect(out.text).toContain('**$79.99**');
      expect(out.text).toContain('save $10.00 (11% off)');
      expect(out.text).toContain('4.6★');
      expect(out.text).toContain('Brand: Amazon');
      expect(out.text).toContain('tag=sometag-20');
      expect(out.text).toContain('View all results on Amazon');
      expect(out.text).toContain('As an Amazon Associate');
      expect(out.structured).toBe(response);
    });

    it('handles empty results gracefully', () => {
      const out = formatSearchItemsMarkdown({
        response: { searchResult: { items: [], totalResultCount: 0 } },
        partnerTag: 'x-20',
        marketplace: 'www.amazon.com',
      });
      expect(out.text).toContain('_No items found._');
    });

    it('surfaces partial errors next to items', () => {
      const out = formatSearchItemsMarkdown({
        response: {
          searchResult: { items: [FIXTURE_ITEM] },
          errors: [{ code: 'InvalidParameterValue', message: 'bad input', asin: 'BXXXXXXXXX' }],
        },
        partnerTag: 'x-20',
        marketplace: 'www.amazon.com',
      });
      expect(out.text).toContain('### Errors');
      expect(out.text).toContain('`BXXXXXXXXX`: InvalidParameterValue — bad input');
    });
  });

  describe('formatGetItemsMarkdown', () => {
    it('unwraps itemsResult.items', () => {
      const response: GetItemsResponse = { itemsResult: { items: [FIXTURE_ITEM] } };
      const out = formatGetItemsMarkdown({
        response,
        partnerTag: 'sometag-20',
        marketplace: 'www.amazon.com',
      });
      expect(out.text).toContain('Echo Show 5');
      expect(out.text).toContain('ASIN: `B09B2SBHQK`');
    });
  });

  describe('formatGetVariationsMarkdown', () => {
    it('unwraps variationsResult.items', () => {
      const response: GetVariationsResponse = { variationsResult: { items: [FIXTURE_ITEM] } };
      const out = formatGetVariationsMarkdown({
        response,
        partnerTag: 'sometag-20',
        marketplace: 'www.amazon.com',
      });
      expect(out.text).toContain('## Variations');
      expect(out.text).toContain('Echo Show 5');
    });
  });

  describe('formatGetBrowseNodesMarkdown', () => {
    it('renders nested children as an indented bullet tree', () => {
      const response: GetBrowseNodesResponse = {
        browseNodesResult: {
          browseNodes: [
            {
              id: '172282',
              displayName: 'Electronics',
              children: [
                { id: '493964', displayName: 'Categories' },
                { id: '2527553011', displayName: 'TVs', salesRank: 1 },
              ],
            },
          ],
        },
      };
      const out = formatGetBrowseNodesMarkdown({
        response,
        partnerTag: 'x',
        marketplace: 'www.amazon.com',
      });
      expect(out.text).toContain('- Electronics `172282`');
      expect(out.text).toMatch(/ {2}- Categories `493964`/);
      expect(out.text).toMatch(/TVs `2527553011` \(rank 1\)/);
    });

    it('falls back to a friendly message when no nodes', () => {
      const out = formatGetBrowseNodesMarkdown({
        response: { browseNodesResult: { browseNodes: [] } },
        partnerTag: 'x',
        marketplace: 'www.amazon.com',
      });
      expect(out.text).toContain('_No nodes returned._');
    });
  });
});
