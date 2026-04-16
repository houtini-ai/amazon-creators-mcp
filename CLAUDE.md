# amazon-creators-mcp — Claude Code project guide

## What this is
An MCP server wrapping the Amazon Creators API (the REST API that replaces PA-API 5.0 on 2026-04-30). It exposes five tools — `search_items`, `get_items`, `get_browse_nodes`, `get_variations` (Amazon-facing) and `format_items` (local re-render, no network) — and returns results in multiple creator-friendly formats: raw JSON, markdown, self-contained HTML card, and responsive HTML grid. Inline preview is delivered via the official **MCP Apps spec** (2026-01-26): every tool definition carries `_meta.ui.resourceUri` pointing at a bundled viewer resource that renders the tool's HTML in a sandboxed iframe on MCP Apps-capable hosts (Claude Desktop).

## Tech stack
- TypeScript strict, ESM, Node 20+
- `@modelcontextprotocol/sdk` — server base, `McpServer`
- `@modelcontextprotocol/ext-apps/server` — `registerAppTool` / `registerAppResource` (discovery + legacy-key mirror)
- `@modelcontextprotocol/ext-apps/app-with-deps` — bundled viewer client (`App` + `PostMessageTransport`)
- `esbuild` — IIFE-bundles the viewer client into a single HTML document at build time
- `zod` — input/output schemas
- `vitest` — unit + integration tests (MSW for HTTP mocking)
- `eslint` (flat config) — with `@typescript-eslint`

## Key files
- `src/index.ts` — bin entry, stdio transport wiring
- `src/server.ts` — `McpServer` instance, registers 5 tools + viewer resource
- `src/client/creators-api.ts` — low-level HTTP + token cache
- `src/auth/token-cache.ts` — OAuth2 client-credentials flow (v3.x LwA only; v2.x Cognito rejected on startup)
- `src/config/marketplaces.ts` — marketplace → {region, token endpoint, version}
- `src/tools/*.ts` — one file per tool
- `src/formatters/*.ts` — one file per output format
- `src/mcp-apps/register.ts` — exports `registerViewerResource` + `VIEWER_RESOURCE_URI`
- `src/mcp-apps/viewer.ts` — lazy-reads `dist/mcp-apps/viewer.html` next to the compiled JS
- `src/mcp-apps/viewer-client.ts` — **browser-side**, excluded from `tsc`; esbuild bundles it
- `src/mcp-apps/viewer-template.html` — HTML shell with `/* __VIEWER_CLIENT__ */` marker
- `scripts/build-viewer.mjs` — esbuild bundle step; runs before `tsc` via `npm run build`
- `tests/**` — vitest unit + integration tests (incl. `tests/integration/mcp-apps-registration.test.ts` regression guard)
- `SCOPE.md` — the technical plan (source of truth for scope)

## Non-negotiables
- **Never** hardcode credentials, partner tags, or personal data as defaults.
- **Never** log full credentials or access tokens. Truncate to 6 chars max.
- **Every** affiliate HTML link gets `rel="sponsored nofollow noopener"` and the correct `tag=` query.
- **Every** HTML output includes a visible Associates disclosure footer (legal requirement).
- Errors return `{isError: true, content: [...]}` — never throw unhandled exceptions out of a tool handler.
- Use `console.error` for logs — stdout is reserved for JSON-RPC.
- Tokens are cached in-memory until 60s before `expires_in`; refresh on demand.

## Houtini workflow reminders
- All files under `C:\mcp` mirror to `\\hopper\d\MCP` — remember to sync if asking houtini-lm to review.
- Repo lives at `houtini-ai/amazon-creators-mcp`, publishes as `@houtini/amazon-creators-mcp`.
- README must include the houtini badge row + Glama card (see `C:\MCP\CLAUDE.md`).

## When modifying tools
1. Update the tool's input/output zod schemas first.
2. Regenerate fixtures with real API responses (redacted ASINs ok, never credentials).
3. Add/update the formatter tests — these run without network access.
4. Run `npm run typecheck && npm run test && npm run lint` before committing.
