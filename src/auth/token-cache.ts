/**
 * OAuth 2.0 client-credentials token cache for Amazon Login with Amazon (v3.x).
 *
 * - Single-flight: concurrent callers share one in-flight fetch.
 * - Refresh window: 60 s before expiry.
 * - Memory only; process-scoped MCP servers restart often enough that disk cache isn't worth it.
 * - On 401 from Creators API, callers invoke `invalidate()` to force a refresh on next `getToken()`.
 */
import type { AppConfig } from '../config/env.js';
import { TOKEN_ENDPOINTS } from '../config/marketplaces.js';

const REFRESH_WINDOW_MS = 60_000;
const CREATORS_SCOPE = 'creatorsapi::default';

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class TokenCache {
  private cached: CachedToken | null = null;
  private inflight: Promise<string> | null = null;
  private readonly endpoint: string;

  constructor(private readonly config: AppConfig) {
    this.endpoint = TOKEN_ENDPOINTS[config.region];
  }

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAtMs - REFRESH_WINDOW_MS > now) {
      return this.cached.accessToken;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  invalidate(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<string> {
    const body = JSON.stringify({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: CREATORS_SCOPE,
    });

    if (this.config.debug) {
      console.error(`[auth] POST ${this.endpoint} (scope=${CREATORS_SCOPE})`);
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Token fetch failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`,
      );
    }

    let parsed: TokenResponse;
    try {
      parsed = JSON.parse(text) as TokenResponse;
    } catch {
      throw new Error(`Token endpoint returned non-JSON: ${text.slice(0, 300)}`);
    }

    if (!parsed.access_token || typeof parsed.expires_in !== 'number') {
      throw new Error(`Token endpoint returned unexpected shape: ${text.slice(0, 300)}`);
    }

    this.cached = {
      accessToken: parsed.access_token,
      expiresAtMs: Date.now() + parsed.expires_in * 1000,
    };

    if (this.config.debug) {
      console.error(`[auth] token cached, expires in ${parsed.expires_in}s`);
    }
    return parsed.access_token;
  }
}
