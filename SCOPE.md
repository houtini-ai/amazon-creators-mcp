# @houtini/amazon-creators-mcp — Technical Scope & Execution Plan

**Status:** v0.3 shipped • **Owner:** Houtini AI • **Date:** 2026-04-16
**Protocol target:** MCP 2025-11-25 (latest stable spec)

---

## 1. Why this project exists

Amazon is deprecating Product Advertising API 5.0 on **2026-04-30**. The replacement is the [Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction) — a REST API with OAuth 2.0 client-credentials authentication, targeted at publishers, influencers, and affiliates.

**Gap in the market:** no TypeScript/Node MCP server for the Creators API exists today. The only comparable PAAPI server (`jademind/mcp-amazon-paapi`) is Python-only, passes raw JSON through, and will be rendered obsolete by the deprecation in 14 days.

**Our differentiation:**
1. First-to-market Node/TypeScript MCP server for Creators API.
2. Creator-focused output formats (markdown / html-card / html-grid) — not just raw JSON.
3. Live preview via the official **MCP Apps spec** (2026-01-26) so creators see the card inline in hosts like Claude Desktop before pasting.
4. Strict affiliate-compliance defaults (disclosure footer, `rel="sponsored nofollow noopener"`, correct `tag=` injection).

---

## 2. Scope coverage — Creators API operations

The Creators API surface area as of 2026-04-16 is small and fully enumerable:

| Surface | Operations | Status |
|---|---|---|
| **Products API** | `searchItems`, `getItems`, `getBrowseNodes`, `getVariations` | ✅ v0.1 |
| **Formatting (local)** | `format_items` — re-render previously-fetched structuredContent without hitting Amazon | ✅ v0.2 |

**Verified by:** the [official API Reference](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference) lists only the four Products operations. `format_items` is a local-only convenience tool exposed by this MCP server — it performs no network I/O.

**Out-of-scope:**
- **Reporting API / S3 report generation** — the public REST reference doesn't exist yet (only a Node.js SDK zip, which we won't reverse-engineer — ToS risk for downstream users' Associates accounts). Not a commitment for any future version; if Amazon publishes proper REST docs later it can be reconsidered.
- Affiliate link shortening (OneLink) — separate from Creators API.
- Disk/KV caching of product data — in-memory only.
- Bundling Amazon's Node.js SDK — we call REST directly to keep the dep tree small.

---

## 3. Amazon Creators API — verified facts

All pulled from the official docs (`affiliate-program.amazon.com/creatorsapi/docs`, 2026-04-16):

### 3.1 Credentials — v3.x (LwA) only
We only support v3.x Login with Amazon credentials. **v2.x Cognito is rejected** because Amazon now only issues v3.x to new signups (confirmed 2026-04-16 — the Associates Central onboarding requires creating an "Application" in Login with Amazon, which is a v3.x-specific construct). v2.x users are on a migration deadline anyway. Dropping v2.x halves the auth surface and prevents legacy debt on day one.

- Auth: Login with Amazon, JSON body, `grant_type=client_credentials`
- Token endpoint pattern: `api.amazon.{tld}/auth/o2/token`
- Scope: `creatorsapi::default`
- Response: `Authorization: Bearer <token>` (plain — no `Version` suffix)
- Access tokens expire after **3600 s** and must be cached.
- Credential CSV fields as downloaded from Associates Central: `Application, Application Id, Credential Id, Secret, Version`
- Our env maps: `AMAZON_CLIENT_ID ← Credential Id`, `AMAZON_CLIENT_SECRET ← Secret`, `AMAZON_CREDENTIAL_VERSION ← Version` (expected `3.x`).

### 3.2 Regions → token endpoints (v3.x only)
| Region | Token endpoint |
|---|---|
| NA | `https://api.amazon.com/auth/o2/token` |
| EU | `https://api.amazon.co.uk/auth/o2/token` |
| FE | `https://api.amazon.co.jp/auth/o2/token` |

### 3.3 API base + headers
- **Base URL:** `https://creatorsapi.amazon` (all regions, identical)
- Required headers on every call: `Authorization`, `Content-Type: application/json`, `x-marketplace: www.amazon.{tld}`
- Marketplace is **also** a field in the JSON body for most operations.

### 3.4 Operations (our four tools map 1:1)
| Our tool | Endpoint | Description |
|---|---|---|
| `search_items` | `POST /catalog/v1/searchItems` | Search by keywords/actor/author/brand/title, filter by price/ratings/brand/index |
| `get_items` | `POST /catalog/v1/getItems` | Look up 1–10 ASINs, return requested resources |
| `get_browse_nodes` | `POST /catalog/v1/getBrowseNodes` | Category metadata, ancestors, children |
| `get_variations` | `POST /catalog/v1/getVariations` | Size/colour/etc. variants of a parent ASIN |

### 3.5 Resources (selectable `resources: [...]` in every request)

**Resource names are camelCase with leading lowercase** — NOT PascalCase like legacy PAAPI 5.0. This was confirmed against the live API 2026-04-16 (a PascalCase request returned a 400 `ValidationException`).

**`getBrowseNodes` uses a SEPARATE, minimal 2-value enum** (also confirmed via 400 on 2026-04-16):
- `browseNodes.children` — include direct children of each node
- `browseNodes.ancestor` — include ancestor chain

Passing `browseNodeInfo.*` (the item-level names) to `getBrowseNodes` returns 400.

The 35 valid values enumerated by the item-level endpoints (`searchItems` / `getItems` / `getVariations`):

- `browseNodeInfo.browseNodes`, `browseNodeInfo.browseNodes.ancestor`, `browseNodeInfo.browseNodes.salesRank`
- `browseNodeInfo.websiteSalesRank`
- `customerReviews.starRating`, `customerReviews.count` *(not listed in public docs)*
- `images.primary.{small,medium,large,highRes}`
- `images.variants.{small,medium,large,highRes}` *(highRes not listed in public docs)*
- `itemInfo.{byLineInfo,classifications,contentInfo,contentRating,externalIds,features,manufactureInfo,productInfo,technicalInfo,title,tradeInInfo}`
- `offersV2.listings.{availability,condition,dealDetails,isBuyBoxWinner,loyaltyPoints,merchantInfo,price,type}`
- `parentASIN`, `searchRefinements`

### 3.6 Important quirks (several confirmed against live API)
- **Response envelope wraps the items:** `searchItems` returns `{searchResult: {items[], searchURL, totalResultCount}}`. `getItems` returns `{itemsResult: {items[]}}`. Downstream formatters unwrap this.
- **`detailPageURL` already includes `tag=<partnerTag>&linkCode=osi`** when `partnerTag` is passed in the request. We do NOT re-append the tag ourselves (would risk duplicating).
- **`offersV2.listings` is an array** per item (buy box + resellers). Filter to `isBuyBoxWinner: true` for the primary price.
- **Price shape:** `price.money.{amount, currency, displayAmount}` — `displayAmount` is pre-formatted by Amazon (e.g. `"$49.99"`).
- `itemIds` max 10 per `getItems` call.
- `itemCount` max 10 per `searchItems` call; pagination via `itemPage` (1–10).
- Prices in request parameters (`minPrice`, `maxPrice`) are in **lowest currency denomination** (cents / pence / öre).
- Response `errors` array is populated on partial failures — the order of returned items is NOT guaranteed to match request order (Amazon docs explicit warning). Always match on `asin`.
- `parentASIN` is a top-level response field, not nested under `itemInfo`.
- Every request needs `partnerTag`, `partnerType: "Associates"`, `marketplace` in the JSON body (in addition to the `x-marketplace` header).

---

## 4. Architecture

```
┌──────────────────────────┐
│  MCP client              │
│  (Claude Desktop, etc.)  │
└────────────┬─────────────┘
             │ stdio JSON-RPC
┌────────────▼─────────────┐
│  src/index.ts  (bin)     │
│  src/server.ts           │    registers 5 × ext-apps tools + 1 viewer resource
└────────────┬─────────────┘
             │
   ┌─────────┴───────────┬──────────────────────┐
   ▼                     ▼                      ▼
src/tools/*.ts    src/formatters/*.ts    src/mcp-apps/*.ts
  (business       (json|md|html-card|     (registerViewerResource,
   logic)          html-grid)              viewer.html bundled by
                                           scripts/build-viewer.mjs)
   │
   ▼
src/client/creators-api.ts
  │ OAuth token cache  ← src/auth/token-cache.ts
  │ marketplace router ← src/config/marketplaces.ts
  ▼
https://creatorsapi.amazon
```

### 4.1 Request flow per tool call
1. Client calls tool with Zod-validated input, incl. `format: 'json'|'markdown'|'html-card'|'html-grid'` (default `markdown`).
2. Tool handler builds PAAPI-style payload, injects `partnerTag` and `marketplace` from env.
3. `creators-api.ts` checks token cache → refreshes if within 60s of expiry → POSTs to `/catalog/v1/{op}`.
4. Response dispatched to the selected formatter.
5. Formatter returns `{content, structuredContent}` pair:
   - `content[0]` = single text block (markdown or rendered HTML — for `html-card`/`html-grid` this IS the paste-ready HTML document).
   - `structuredContent` = parsed/cleaned product data (matches `outputSchema`).
6. Tool *definitions* carry `_meta.ui.resourceUri = "ui://amazon-creators/viewer.html"` (and the legacy mirror `_meta['ui/resourceUri']` for older hosts). MCP Apps-capable clients fetch the viewer once via `resources/read`, render it in a sandboxed iframe, and the viewer's client-side bootstrap receives each tool's result over `postMessage` — rendering HTML in a nested `srcdoc` iframe or falling back to `<pre>` text. Hosts without MCP Apps just see the plain text content, which is already useful (especially for `html-card`/`html-grid`, where the text IS the HTML).

### 4.2 Why both `structuredContent` and HTML
Agents / programmatic consumers want parsed data. Humans pasting into blog posts want HTML. MCP 2025-11-25 officially supports returning both in a single response — we do.

### 4.3 Why a single shared viewer (and not per-tool URIs)
The MCP Apps spec binds `_meta.ui.resourceUri` to the tool *definition*, not to the tool *call*. So the URI must be static across calls. We have one `ui://amazon-creators/viewer.html` resource and let the viewer's client-side code inspect each incoming `CallToolResult` and dispatch: HTML-looking text goes into a nested `<iframe srcdoc>`; anything else renders as a `<pre>` block. This keeps the host's resource cache clean (one read per session) and sidesteps the pre-v0.3 hash-URI scheme entirely.

---

## 5. Output formats (v0.1 set)

| `format` | `content[0].type` | `structuredContent` | MCP Apps preview |
|---|---|---|---|
| `json` | `text` (pretty-printed JSON) | full parsed object | renders as `<pre>` in the viewer |
| `markdown` | `text` (markdown) | parsed object | renders as `<pre>` in the viewer |
| `html-card` | `text` (full HTML document) | parsed object | renders inline via nested `<iframe srcdoc>` |
| `html-grid` | `text` (full HTML document) | parsed object | renders inline via nested `<iframe srcdoc>` |

All four formats flow through the same viewer resource (`ui://amazon-creators/viewer.html`) via `_meta.ui.resourceUri`. The viewer decides at render time whether to use a sandboxed `srcdoc` iframe (HTML) or a plain `<pre>` block (everything else).

### 5.1 Affiliate compliance (baked into all HTML outputs)
- Every anchor to an Amazon URL: `rel="sponsored nofollow noopener"` and `target="_blank"`.
- `tag=<partnerTag>` appended/upserted on every URL.
- Disclosure block (visually present, `<small class="amzn-disclosure">`):
  > "As an Amazon Associate we earn from qualifying purchases. Prices and availability are accurate as of the time shown and are subject to change."
- No tracking scripts, no external CSS — all styles inline — paste-and-go.

### 5.2 Markdown format skeleton
```markdown
[![Echo Show 5](https://…_SL160_.jpg)](https://www.amazon.com/dp/B09B2SBHQK?tag=yourtag-20)

**[Amazon Echo Show 5](https://www.amazon.com/dp/B09B2SBHQK?tag=yourtag-20)**
Charcoal · Smart display with Alexa+ Early Access
**$79.99** ~~$89.99~~ (11% off)

> *As an Amazon Associate we earn from qualifying purchases…*
```

### 5.3 HTML card skeleton (self-contained, ~2 kB)
```html
<article class="amzn-card" style="display:flex;gap:12px;border:1px solid #e5e7eb;border-radius:12px;padding:16px;max-width:520px;font-family:system-ui,sans-serif">
  <a href="…?tag=yourtag-20" rel="sponsored nofollow noopener" target="_blank">
    <img src="…" alt="Echo Show 5" style="width:120px;height:auto;border-radius:8px">
  </a>
  <div>
    <a href="…?tag=yourtag-20" rel="sponsored nofollow noopener" target="_blank"
       style="font-weight:600;color:#111;text-decoration:none">Amazon Echo Show 5</a>
    <div style="color:#374151;font-size:14px;margin:4px 0">Charcoal · Smart display…</div>
    <div><strong style="font-size:18px">$79.99</strong>
         <s style="color:#9ca3af;margin-left:6px">$89.99</s></div>
    <a href="…?tag=yourtag-20" rel="sponsored nofollow noopener" target="_blank"
       style="display:inline-block;margin-top:8px;padding:8px 14px;background:#f59e0b;
              color:#111;border-radius:999px;text-decoration:none;font-weight:600">
      Buy on Amazon
    </a>
    <small class="amzn-disclosure" style="display:block;color:#6b7280;font-size:11px;margin-top:8px">
      As an Amazon Associate we earn from qualifying purchases.
    </small>
  </div>
</article>
```

### 5.4 HTML grid skeleton
Responsive 12-col flex grid, collapses from 4 → 3 → 2 → 1 via `flex-basis` media breakpoints using inline `@media` wrapped in a single `<style>` block. Each cell is a compact version of the card above.

---

## 6. MCP Apps integration

As of v0.3 this server is a pure **MCP Apps** implementation, using the official `@modelcontextprotocol/ext-apps` library on both ends (server register helpers + bundled client).

### 6.1 Server side — `src/server.ts` + `src/mcp-apps/register.ts`

```ts
import { registerAppTool, registerAppResource } from '@modelcontextprotocol/ext-apps/server';

// One shared viewer resource for the whole server.
registerAppResource(server, 'Amazon Creators preview', 'ui://amazon-creators/viewer.html',
  { description: '...' },
  () => ({ contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: getViewerHtml() }] }),
);

// Every tool carries the same _meta pointer.
registerAppTool(server, 'search_items', {
  description: SEARCH_ITEMS_DESCRIPTION,
  inputSchema: searchItemsShape,
  _meta: { ui: { resourceUri: 'ui://amazon-creators/viewer.html' } },
}, handler);
```

`registerAppTool` normalises the `_meta.ui.resourceUri` key AND mirrors it to the legacy `_meta['ui/resourceUri']` slot so older hosts that only know the flat key still discover the viewer.

### 6.2 Client side — `src/mcp-apps/viewer-client.ts` + `viewer-template.html`

The viewer HTML is built once at `npm run build:viewer` by `scripts/build-viewer.mjs`, which:

1. esbuild-bundles `viewer-client.ts` (which imports `@modelcontextprotocol/ext-apps/app-with-deps`) into a single IIFE.
2. Inlines the IIFE into `viewer-template.html` at the `/* __VIEWER_CLIENT__ */` marker.
3. Writes the final single-file HTML to `dist/mcp-apps/viewer.html` (~400 kB).

At runtime the viewer boots `new App(...)` with a `PostMessageTransport`, sets `ontoolresult` **before** `connect()` (ordering matters — late handlers miss the first result), then for each incoming `CallToolResult`:

- If `content[0].text` looks like an HTML document (`/^\s*<!doctype\s+html|^\s*<html[\s>]/i`), render it into a nested `<iframe id="preview" srcdoc="...">` with `sandbox="allow-same-origin"`. The nesting matters — `document.write` into the outer frame would destroy the `App` instance and its `postMessage` listener; nesting preserves it while giving the HTML its own isolated DOM.
- Otherwise render the text into a `<pre>` block.
- Wire `wireAutoHeight` on the nested iframe's `load` event plus fallback timeouts at 250 ms and 1000 ms to handle content that reflows after first paint.

### 6.3 Graceful degradation

Hosts without MCP Apps support simply ignore `_meta.ui.resourceUri`. They still get the tool's text content — which, for `html-card` / `html-grid`, IS the full HTML document the creator pastes into their blog. **No feature loss — just no inline preview.**

### 6.4 Regression guard

`tests/integration/mcp-apps-registration.test.ts` boots the server in-process, introspects the McpServer's internal `_registeredTools` and `_registeredResources` maps, and asserts:

- All 5 tools carry `_meta.ui.resourceUri === VIEWER_RESOURCE_URI`.
- All 5 tools also carry the legacy `_meta['ui/resourceUri']` mirror.
- The viewer URI is actually registered as a resource.

This catches silent drift — e.g. if a future SDK release renames the legacy key, or if a new tool is added without wiring the `_meta` block, the test fails loudly rather than the host silently falling back to plain text.

---

## 7. Auth module (`src/auth/token-cache.ts`)

- **v3.x (Login with Amazon) only** — see §3.1 for rationale.
- Single-flight: concurrent token requests collapse to one in-flight promise.
- Refresh window: 60 s before `expires_in`.
- No disk persistence — memory only (process-scoped MCP servers restart frequently).
- On 401 from Creators API: force-refresh token once, retry once, then surface error.
- Request builder: POST JSON body `{grant_type:'client_credentials', client_id, client_secret, scope:'creatorsapi::default'}` to `https://api.amazon.{com|co.uk|co.jp}/auth/o2/token` based on marketplace region.

Environment:
```
AMAZON_CLIENT_ID            required — "Credential Id" from downloaded CSV
AMAZON_CLIENT_SECRET        required — "Secret" from downloaded CSV
AMAZON_PARTNER_TAG          required — fail loudly if missing
AMAZON_CREDENTIAL_VERSION   required — must be "3.1"|"3.2"|"3.3" — v2.x rejected with clear error
AMAZON_MARKETPLACE          required — e.g. www.amazon.com
DEBUG                       optional — "1" enables verbose console.error logging
```

If `AMAZON_CREDENTIAL_VERSION` starts with `2.`, we throw on startup with:
> "v2.x Cognito credentials are not supported. Create a new Login with Amazon application at Associates Central → Creators API to generate v3.x credentials."

No defaults for partner tag or marketplace — fail fast with a clear error if unset (unlike the predecessor repo which shipped a personal tag as default).

---

## 8. Error handling & rate limiting

**Error envelope (all tools):**
1. On Zod validation failure → `{isError: true, content: [{type:'text', text: 'Invalid input: …'}]}`
2. On HTTP 4xx (other than 429) → surface Amazon's `errors[]` array verbatim.
3. On HTTP 5xx or network error → retry once with 500ms backoff, then surface.
4. On 401 → single token refresh + retry, then surface.
5. Logs go via `console.error` only — never `stdout` (JSON-RPC reserved).

Amazon's partial-failure pattern is respected: if `itemResults.items` is non-empty but `errors[]` also populated, we return both — `structuredContent` contains `{items, errors}`.

**Rate limiting (decision post-Gemini review — reversed from earlier plan):**
- No hardcoded req/sec cap. LLMs often issue parallel tool calls and a conservative 1 req/s would bottleneck unnecessarily.
- On HTTP **429**, respect the `Retry-After` header (seconds or HTTP-date), queue the pending request, resume automatically.
- A single global async queue in the HTTP client gates everything so a 429 on one call pauses all in-flight calls from the same process.
- Expose `AMAZON_MAX_CONCURRENCY` (default 4) as an env var for users who hit 429s repeatedly — lets them self-throttle without code changes.

## 8a. Tool descriptions — LLM-facing guidance (Gemini review follow-up)

The `description` field on each tool must explicitly warn the LLM about non-obvious response semantics. These strings become part of the tool manifest the LLM sees:

- **`get_items`**: "Look up 1–10 ASINs. IMPORTANT: the returned `items` array is NOT guaranteed to be in the same order as the input `asins` array. Always match items to your inputs by the `asin` field, not by index. Invalid or inaccessible ASINs will appear in a separate `errors` array rather than in `items` — check both."
- **`search_items`**: "Returns up to 10 items per page. To get more, call again with `itemPage: 2`, `itemPage: 3`, etc. Total pages cap at 10 (100 items max per search). `totalResultCount` in the response tells you how many results exist overall, not how many are accessible."
- **`get_variations`**: "Parent ASIN required. `variationCount` max 10 per call; paginate via `variationPage` (1–10)."
- **`get_browse_nodes`**: "Returns ancestor chain and direct children for each node. Use `browseNodeInfo.websiteSalesRank` resource to find top-selling categories."

---

## 9. Testing plan

### 9.1 Unit (no network)
- `tests/auth/token-cache.test.ts` — expiry math, single-flight, v2/v3 endpoint selection.
- `tests/config/marketplaces.test.ts` — marketplace → region mapping for all 22 marketplaces.
- `tests/formatters/markdown.test.ts` — golden-file assertions against fixture responses.
- `tests/formatters/html-card.test.ts` — same.
- `tests/formatters/html-grid.test.ts` — same + responsive media-query breakpoints present.
- `tests/formatters/affiliate-tag.test.ts` — `tag=` present on every anchor; `rel` set correctly; disclosure present.
- `tests/integration/mcp-apps-registration.test.ts` — all tools carry `_meta.ui.resourceUri` + legacy mirror; viewer resource is registered at that URI.

### 9.2 Integration (mocked network via `msw`)
- `tests/integration/search-items.test.ts` — end-to-end tool call; asserts both `content` and `structuredContent`.
- `tests/integration/get-items-partial-failure.test.ts` — Amazon returns 2 items + 1 error; all three surface correctly, items matched on `asin`.
- `tests/integration/401-refresh.test.ts` — first call returns 401, token refreshes, second call succeeds.
- `tests/integration/rate-limit.test.ts` — consecutive calls are serialised to 1 req/s.

### 9.3 Contract (optional, gated on `AMAZON_CLIENT_ID` env being present)
- `tests/contract/live.test.ts` — one smoke test per tool against real API, uses a throwaway `.env.test`.
- Skipped by default in CI; runs manually.

### 9.4 MCP protocol tests
- `tests/mcp/list-tools.test.ts` — boots server in-process, asserts `tools/list` returns the five tools with correct `inputSchema`, `outputSchema`, and `annotations.readOnlyHint: true`.
- `tests/integration/mcp-apps-registration.test.ts` — asserts `_meta.ui.resourceUri` is set on **every** tool definition and points at a registered resource (catches silent fallback drift in MCP Apps-capable hosts).

Target coverage: **80% lines, 75% branches** (see `vitest.config.ts` thresholds).

### 9.5 Local smoke test script
`scripts/smoke.ts` — spawns the built server via stdio, runs one `search_items` call per format, prints results. Manual sanity check before publish.

---

## 10. Execution plan (milestones)

### v0.1 — Minimum shippable ✅ shipped 2026-04-16
- [x] Token cache + multi-marketplace auth module
- [x] Low-level HTTP client with retry/backoff
- [x] All four tools with `json` and `markdown` formats
- [x] Unit tests for formatters + auth
- [x] Integration tests with `msw`
- [x] README + SCOPE.md + CLAUDE.md
- [x] `npm publish` dry-run passes (0.2.0, 79 files, 41.3 kB tarball, no stray test/env files)
- [ ] Submit to Glama, set GitHub topics *(manual, post-publish)*

### v0.2 — HTML formats + MCP UI (v1) ✅ shipped 2026-04-16
- [x] `html-card` formatter (single product) with stable class-name anchors
- [x] `html-grid` formatter (multiple products) with responsive CSS grid
- [x] MCP UI preview via `@mcp-ui/server` `createUIResource` — superseded by v0.3's MCP Apps swap below
- [x] `customStyles` input on `search_items` / `get_items` / `get_variations` / `format_items` — appended verbatim to the `<style>` block so creators iterate without the repo changing
- [x] `format_items` tool — re-renders a previously-returned `structuredContent` locally; style iterations don't hit Amazon (rate-limit safety + fast loop)
- [x] README updated — 5 tools, HTML formats, `customStyles` hooks, `format_items` workflow

### v0.3 — MCP Apps swap (official spec) ✅ shipped 2026-04-16
- [x] Drop `@mcp-ui/server` entirely; no more per-call hash URIs
- [x] Adopt `@modelcontextprotocol/ext-apps` on both server (`registerAppTool` / `registerAppResource`) and client (bundled `App` + `PostMessageTransport` via `app-with-deps`)
- [x] Single shared viewer resource at `ui://amazon-creators/viewer.html` with nested sandboxed-iframe rendering (preserves the outer `App` instance through content swaps)
- [x] `scripts/build-viewer.mjs` — esbuild IIFE bundle inlined into `viewer-template.html` at build time; `npm run build` = `build:viewer && tsc`
- [x] `tests/integration/mcp-apps-registration.test.ts` — regression guard asserting every tool carries `_meta.ui.resourceUri` + legacy key, and the viewer URI is registered
- [x] `tests/formatters/html.test.ts`, `tests/tools/format-items.test.ts` updated for the single-text-content shape (no more `content[1]` resource assertions)
- [x] Version bump to `0.3.0`; breaking change for any downstream that was reading the MCP UI resource shape directly
- [ ] Restart Claude Desktop + verify inline render end-to-end *(manual)*
- [ ] Screenshots of rendered cards *(manual — needs a live MCP Apps host)*

### v0.4 — Formatter polish + ops
- [ ] Carousel + comparison-table formats
- [ ] `bbcode` and `wp-shortcode` formats (forum/WordPress creators)
- [ ] Memory for houtini-lm review pass

---

## 11. Open questions for Gemini review

1. Given April 30 deprecation is 14 days away, is racing to publish **before** that date (locking in the "first Creators-API MCP on npm" claim) worth prioritising over test coverage?
2. MCP UI / MCP Apps — is returning both `content[*].type: 'text'` (raw HTML string) **and** `_meta.ui.resourceUri` acceptable, or will MCP Apps hosts double-render? Docs are silent.
3. Partial-failure handling — should `structuredContent.errors` surface Amazon's error objects 1:1, or normalise to a shared shape? Agents consuming this will probably prefer 1:1 for transparency.
4. Should `format: 'html-card'` default to a **full** HTML document or a **fragment** (for CMS embedding)? Leaning fragment; confirm.
5. Is `rel="sponsored nofollow noopener"` the current SEO best practice for affiliate links in 2026, or has Google's guidance shifted toward `rel="sponsored"` only?
6. The `@modelcontextprotocol/ext-apps` import path — context7 shows `.../server` subpath; confirm that is the stable public import for the current version.
7. SDK rate-limit behaviour: Amazon doesn't publish hard numbers for the Creators API anywhere we've seen. Is 1 req/s a sensible conservative default, or should we start unlimited and let 429s drive backoff?
