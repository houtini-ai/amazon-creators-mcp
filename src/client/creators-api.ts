/**
 * Low-level HTTP client for the Amazon Creators API.
 *
 * Responsibilities:
 * - Global concurrency gate (AMAZON_MAX_CONCURRENCY).
 * - 429 handling: respects `Retry-After` header, pauses all in-flight requests.
 *   Bounded: gives up after MAX_RATE_LIMIT_RETRIES, or at once when Amazon asks
 *   for a wait longer than MAX_RETRY_AFTER_MS, so an exhausted quota fails the
 *   call instead of hanging it (and its concurrency slot) indefinitely.
 * - 401 handling: force token refresh once, retry once.
 * - 5xx/network: one retry with 500 ms backoff.
 * - Logs via console.error (stdout is reserved for JSON-RPC).
 */
import { CREATORS_API_BASE } from '../config/marketplaces.js';
import type { AppConfig } from '../config/env.js';
import type { TokenCache } from '../auth/token-cache.js';

type Operation = 'searchItems' | 'getItems' | 'getBrowseNodes' | 'getVariations';

const PATHS: Record<Operation, string> = {
  searchItems: '/catalog/v1/searchItems',
  getItems: '/catalog/v1/getItems',
  getBrowseNodes: '/catalog/v1/getBrowseNodes',
  getVariations: '/catalog/v1/getVariations',
};

export interface CreatorsApiError extends Error {
  status?: number;
  body?: unknown;
  amazonErrors?: unknown;
}

function makeError(message: string, extras: Partial<CreatorsApiError> = {}): CreatorsApiError {
  const err = new Error(message) as CreatorsApiError;
  Object.assign(err, extras);
  return err;
}

/** How many 429s one call will wait out before failing. */
const MAX_RATE_LIMIT_RETRIES = 3;
/** Longest Retry-After we will sleep for; anything longer fails the call immediately. */
const MAX_RETRY_AFTER_MS = 30_000;

/** Retry budget carried through `dispatch` recursion for one call. */
interface Attempt {
  did401Refresh: boolean;
  did5xxRetry: boolean;
  rateLimitRetries: number;
}

/**
 * Parse Retry-After header. Returns milliseconds to wait.
 * Accepts either a delta-seconds integer or an HTTP-date.
 * Defaults to 1000ms if header is missing/malformed.
 */
function parseRetryAfter(header: string | null): number {
  if (!header) return 1000;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 1000;
  }
  return 1000;
}

/** Simple promise-based semaphore. */
class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(capacity: number) {
    this.available = capacity;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.available += 1;
    }
  }
}

export class CreatorsApiClient {
  private readonly semaphore: Semaphore;
  /** Global pause gate — when non-null, all new calls wait on this promise before proceeding. */
  private pauseUntil: Promise<void> | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly tokens: TokenCache,
  ) {
    this.semaphore = new Semaphore(config.maxConcurrency);
  }

  /** Invoke one Creators API operation. Payload is serialised to JSON as-is. */
  async call<TResponse = unknown>(op: Operation, payload: unknown): Promise<TResponse> {
    if (this.pauseUntil) await this.pauseUntil;
    await this.semaphore.acquire();
    try {
      return await this.dispatch<TResponse>(op, payload, {
        did401Refresh: false,
        did5xxRetry: false,
        rateLimitRetries: 0,
      });
    } finally {
      this.semaphore.release();
    }
  }

  private async dispatch<TResponse>(
    op: Operation,
    payload: unknown,
    attempt: Attempt,
  ): Promise<TResponse> {
    const token = await this.tokens.getToken();
    const url = `${CREATORS_API_BASE}${PATHS[op]}`;

    if (this.config.debug) {
      console.error(`[api] POST ${url} (marketplace=${this.config.marketplace})`);
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-marketplace': this.config.marketplace,
        },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      if (!attempt.did5xxRetry) {
        if (this.config.debug) console.error(`[api] network error, retrying once: ${String(netErr)}`);
        await new Promise((r) => setTimeout(r, 500));
        return this.dispatch<TResponse>(op, payload, { ...attempt, did5xxRetry: true });
      }
      throw makeError(`Network error calling ${op}: ${String(netErr)}`);
    }

    if (res.status === 429) {
      const waitMs = parseRetryAfter(res.headers.get('retry-after'));
      if (attempt.rateLimitRetries >= MAX_RATE_LIMIT_RETRIES || waitMs > MAX_RETRY_AFTER_MS) {
        const body = await res.text().catch(() => '');
        throw makeError(
          `Rate limited by Amazon on ${op} (HTTP 429${
            waitMs > MAX_RETRY_AFTER_MS ? `, Retry-After ${Math.ceil(waitMs / 1000)}s` : ''
          }, gave up after ${attempt.rateLimitRetries} ${attempt.rateLimitRetries === 1 ? 'retry' : 'retries'}). Try again later.`,
          { status: 429, body },
        );
      }
      if (this.config.debug) console.error(`[api] 429 rate-limited, pausing ${waitMs}ms`);
      // Globally pause: any future calls await the same promise until it resolves.
      const pausePromise = new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      this.pauseUntil = pausePromise;
      pausePromise.then(() => {
        if (this.pauseUntil === pausePromise) this.pauseUntil = null;
      });
      await pausePromise;
      return this.dispatch<TResponse>(op, payload, {
        ...attempt,
        rateLimitRetries: attempt.rateLimitRetries + 1,
      });
    }

    if (res.status === 401 && !attempt.did401Refresh) {
      if (this.config.debug) console.error(`[api] 401, invalidating token and retrying`);
      this.tokens.invalidate();
      return this.dispatch<TResponse>(op, payload, { ...attempt, did401Refresh: true });
    }

    const text = await res.text();

    // Retry before parsing: gateway 5xx pages (502/503) are usually HTML, and
    // a parse failure must not skip the retry.
    if (res.status >= 500 && !attempt.did5xxRetry) {
      if (this.config.debug) console.error(`[api] ${res.status}, retrying once after 500ms`);
      await new Promise((r) => setTimeout(r, 500));
      return this.dispatch<TResponse>(op, payload, { ...attempt, did5xxRetry: true });
    }

    let body: unknown;
    try {
      body = text === '' ? {} : JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw makeError(`HTTP ${res.status} from ${op}: ${text.slice(0, 500)}`, {
          status: res.status,
          body: text,
        });
      }
      throw makeError(`Non-JSON response from ${op}: ${text.slice(0, 300)}`, {
        status: res.status,
      });
    }

    if (!res.ok) {
      const errors =
        body && typeof body === 'object' && 'errors' in (body as Record<string, unknown>)
          ? (body as Record<string, unknown>).errors
          : undefined;
      throw makeError(`HTTP ${res.status} from ${op}`, {
        status: res.status,
        body,
        amazonErrors: errors,
      });
    }

    return body as TResponse;
  }
}
