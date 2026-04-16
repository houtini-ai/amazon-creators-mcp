/**
 * Amazon Creators API marketplace → region → token endpoint mapping.
 *
 * Three regions. Each region has one token endpoint and a fixed set of marketplaces.
 * The user's credentials are bound to one region (AMAZON_CREDENTIAL_VERSION:
 * 3.1=NA, 3.2=EU, 3.3=FE). Calling a marketplace outside the credential's region
 * will fail auth — we throw at startup to surface it early.
 */

export type Region = 'NA' | 'EU' | 'FE';

export interface MarketplaceInfo {
  host: string;
  region: Region;
}

/** Token endpoint per region (Login with Amazon). */
export const TOKEN_ENDPOINTS: Record<Region, string> = {
  NA: 'https://api.amazon.com/auth/o2/token',
  EU: 'https://api.amazon.co.uk/auth/o2/token',
  FE: 'https://api.amazon.co.jp/auth/o2/token',
};

/** Creators API host — single endpoint across all regions. */
export const CREATORS_API_BASE = 'https://creatorsapi.amazon';

/** Credential version (3.x) → region. */
export const VERSION_TO_REGION: Record<string, Region> = {
  '3.1': 'NA',
  '3.2': 'EU',
  '3.3': 'FE',
};

/** All supported marketplaces → region. */
export const MARKETPLACES: Record<string, Region> = {
  // NA
  'www.amazon.com': 'NA',
  'www.amazon.ca': 'NA',
  'www.amazon.com.mx': 'NA',
  'www.amazon.com.br': 'NA',
  // EU
  'www.amazon.co.uk': 'EU',
  'www.amazon.de': 'EU',
  'www.amazon.fr': 'EU',
  'www.amazon.it': 'EU',
  'www.amazon.es': 'EU',
  'www.amazon.nl': 'EU',
  'www.amazon.com.be': 'EU',
  'www.amazon.eg': 'EU',
  'www.amazon.in': 'EU',
  'www.amazon.ie': 'EU',
  'www.amazon.pl': 'EU',
  'www.amazon.sa': 'EU',
  'www.amazon.se': 'EU',
  'www.amazon.com.tr': 'EU',
  'www.amazon.ae': 'EU',
  // FE
  'www.amazon.co.jp': 'FE',
  'www.amazon.sg': 'FE',
  'www.amazon.com.au': 'FE',
};

export function regionForMarketplace(host: string): Region {
  const region = MARKETPLACES[host];
  if (!region) {
    throw new Error(
      `Unknown marketplace "${host}". Supported marketplaces: ${Object.keys(MARKETPLACES).join(', ')}`,
    );
  }
  return region;
}

export function regionForVersion(version: string): Region {
  const region = VERSION_TO_REGION[version];
  if (!region) {
    throw new Error(
      `Unknown credential version "${version}". Expected "3.1" (NA), "3.2" (EU), or "3.3" (FE).`,
    );
  }
  return region;
}
