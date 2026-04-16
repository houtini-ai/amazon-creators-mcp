/**
 * Environment config loader + validator.
 * Fails fast at startup with a clear error if anything is missing or malformed.
 * All config flows through the MCP client's `env` block — no .env loading here.
 */
import { regionForMarketplace, regionForVersion, type Region } from './marketplaces.js';

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  partnerTag: string;
  credentialVersion: string;
  marketplace: string;
  region: Region;
  maxConcurrency: number;
  debug: boolean;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `Missing required env var ${name}. Set it in your MCP client config under "env". See README.`,
    );
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

export function loadConfig(): AppConfig {
  const credentialVersion = required('AMAZON_CREDENTIAL_VERSION');

  if (credentialVersion.startsWith('2.')) {
    throw new Error(
      'v2.x Cognito credentials are not supported. Create a new Login with Amazon ' +
        'application at Associates Central → Creators API to generate v3.x credentials.',
    );
  }

  const marketplace = required('AMAZON_MARKETPLACE');
  const credRegion = regionForVersion(credentialVersion);
  const marketplaceRegion = regionForMarketplace(marketplace);

  if (credRegion !== marketplaceRegion) {
    throw new Error(
      `Credential version ${credentialVersion} (${credRegion}) does not match marketplace ` +
        `${marketplace} (${marketplaceRegion}). Use credentials issued for the same region as your marketplace.`,
    );
  }

  const maxConcurrencyRaw = optional('AMAZON_MAX_CONCURRENCY', '4');
  const maxConcurrency = Number.parseInt(maxConcurrencyRaw, 10);
  if (!Number.isFinite(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 32) {
    throw new Error(
      `AMAZON_MAX_CONCURRENCY must be an integer between 1 and 32 (got "${maxConcurrencyRaw}").`,
    );
  }

  return {
    clientId: required('AMAZON_CLIENT_ID'),
    clientSecret: required('AMAZON_CLIENT_SECRET'),
    partnerTag: required('AMAZON_PARTNER_TAG'),
    credentialVersion,
    marketplace,
    region: credRegion,
    maxConcurrency,
    debug: optional('DEBUG', '0') === '1',
  };
}
