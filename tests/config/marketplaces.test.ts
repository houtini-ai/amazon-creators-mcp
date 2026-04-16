import { describe, it, expect } from 'vitest';
import {
  MARKETPLACES,
  TOKEN_ENDPOINTS,
  VERSION_TO_REGION,
  regionForMarketplace,
  regionForVersion,
} from '../../src/config/marketplaces.js';

describe('marketplaces', () => {
  it('maps every marketplace to a region with a token endpoint', () => {
    for (const [host, region] of Object.entries(MARKETPLACES)) {
      expect(regionForMarketplace(host)).toBe(region);
      expect(TOKEN_ENDPOINTS[region]).toMatch(/^https:\/\/api\.amazon\./);
    }
  });

  it('covers the three regions exactly', () => {
    const regions = new Set(Object.values(MARKETPLACES));
    expect(regions).toEqual(new Set(['NA', 'EU', 'FE']));
  });

  it('throws on an unknown marketplace with a helpful message', () => {
    expect(() => regionForMarketplace('www.amazon.bogus')).toThrowError(/Unknown marketplace/);
  });

  it('maps every credential version to a region', () => {
    for (const [version, region] of Object.entries(VERSION_TO_REGION)) {
      expect(regionForVersion(version)).toBe(region);
    }
  });

  it('throws on an unknown credential version', () => {
    expect(() => regionForVersion('9.9')).toThrowError(/Unknown credential version/);
  });

  it('lists the 22 expected marketplaces', () => {
    // If this fails update SCOPE.md too.
    expect(Object.keys(MARKETPLACES)).toHaveLength(22);
  });
});
