import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const BASE_ENV = {
  AMAZON_CLIENT_ID: 'amzn1.application-oa2-client.test',
  AMAZON_CLIENT_SECRET: 'amzn1.oa2-cs.v1.test',
  AMAZON_PARTNER_TAG: 'sometag-20',
  AMAZON_CREDENTIAL_VERSION: '3.1',
  AMAZON_MARKETPLACE: 'www.amazon.com',
};

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(BASE_ENV)) delete process.env[key];
    delete process.env.AMAZON_MAX_CONCURRENCY;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    for (const key of Object.keys(originalEnv)) process.env[key] = originalEnv[key];
  });

  it('loads a valid v3.1 NA config', () => {
    Object.assign(process.env, BASE_ENV);
    const cfg = loadConfig();
    expect(cfg.region).toBe('NA');
    expect(cfg.marketplace).toBe('www.amazon.com');
    expect(cfg.maxConcurrency).toBe(4);
    expect(cfg.debug).toBe(false);
  });

  it('rejects v2.x credentials with a migration message', () => {
    Object.assign(process.env, BASE_ENV, { AMAZON_CREDENTIAL_VERSION: '2.1' });
    expect(() => loadConfig()).toThrowError(/v2\.x Cognito credentials are not supported/);
  });

  it('rejects mismatched credential region vs marketplace', () => {
    Object.assign(process.env, BASE_ENV, {
      AMAZON_CREDENTIAL_VERSION: '3.1', // NA
      AMAZON_MARKETPLACE: 'www.amazon.co.uk', // EU
    });
    expect(() => loadConfig()).toThrowError(/does not match marketplace/);
  });

  it('fails fast on missing required env', () => {
    Object.assign(process.env, BASE_ENV);
    delete process.env.AMAZON_PARTNER_TAG;
    expect(() => loadConfig()).toThrowError(/Missing required env var AMAZON_PARTNER_TAG/);
  });

  it('respects AMAZON_MAX_CONCURRENCY within bounds', () => {
    Object.assign(process.env, BASE_ENV, { AMAZON_MAX_CONCURRENCY: '8' });
    expect(loadConfig().maxConcurrency).toBe(8);
  });

  it('rejects AMAZON_MAX_CONCURRENCY outside [1,32]', () => {
    Object.assign(process.env, BASE_ENV, { AMAZON_MAX_CONCURRENCY: '0' });
    expect(() => loadConfig()).toThrowError(/AMAZON_MAX_CONCURRENCY/);

    Object.assign(process.env, BASE_ENV, { AMAZON_MAX_CONCURRENCY: '99' });
    expect(() => loadConfig()).toThrowError(/AMAZON_MAX_CONCURRENCY/);
  });

  it('enables debug when DEBUG=1', () => {
    Object.assign(process.env, BASE_ENV, { DEBUG: '1' });
    expect(loadConfig().debug).toBe(true);
  });
});
