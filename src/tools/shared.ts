/**
 * Shared pieces for all 4 Creators API tools.
 */
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import type { CreatorsApiClient } from '../client/creators-api.js';
import { formatJson } from '../formatters/json.js';
import { formatHtmlCard, formatHtmlGrid } from '../formatters/html.js';
import { HTML_FORMATS, type FormatterInput, type FormatterOutput, type OutputFormat } from '../formatters/types.js';
import type { SearchItemsResponse, GetItemsResponse, GetVariationsResponse } from '../types/creators.js';

export const FORMAT_OPTIONS = ['json', 'markdown', 'html-card', 'html-grid'] as const;

export const VALID_RESOURCES = [
  'browseNodeInfo.browseNodes',
  'browseNodeInfo.browseNodes.ancestor',
  'browseNodeInfo.browseNodes.salesRank',
  'browseNodeInfo.websiteSalesRank',
  'customerReviews.count',
  'customerReviews.starRating',
  'images.primary.small',
  'images.primary.medium',
  'images.primary.large',
  'images.primary.highRes',
  'images.variants.small',
  'images.variants.medium',
  'images.variants.large',
  'images.variants.highRes',
  'itemInfo.byLineInfo',
  'itemInfo.classifications',
  'itemInfo.contentInfo',
  'itemInfo.contentRating',
  'itemInfo.externalIds',
  'itemInfo.features',
  'itemInfo.manufactureInfo',
  'itemInfo.productInfo',
  'itemInfo.technicalInfo',
  'itemInfo.title',
  'itemInfo.tradeInInfo',
  'offersV2.listings.availability',
  'offersV2.listings.condition',
  'offersV2.listings.dealDetails',
  'offersV2.listings.isBuyBoxWinner',
  'offersV2.listings.loyaltyPoints',
  'offersV2.listings.merchantInfo',
  'offersV2.listings.price',
  'offersV2.listings.type',
  'parentASIN',
  'searchRefinements',
] as const;

/** Sensible defaults for each tool — prioritise what publishers actually display. */
export const DEFAULT_ITEM_RESOURCES = [
  'itemInfo.title',
  'itemInfo.byLineInfo',
  'itemInfo.features',
  'images.primary.large',
  'images.primary.medium',
  'offersV2.listings.price',
  'offersV2.listings.isBuyBoxWinner',
  'customerReviews.starRating',
  'customerReviews.count',
] as const satisfies readonly (typeof VALID_RESOURCES)[number][];

/**
 * Resources accepted by the dedicated `getBrowseNodes` endpoint.
 * NOTE: these are a separate, minimal enum from the item-level `VALID_RESOURCES` —
 * confirmed via a 400 ValidationException from the live API on 2026-04-16.
 */
export const VALID_BROWSE_NODE_RESOURCES = [
  'browseNodes.children',
  'browseNodes.ancestor',
] as const;

export const DEFAULT_BROWSE_RESOURCES = [
  'browseNodes.children',
  'browseNodes.ancestor',
] as const satisfies readonly (typeof VALID_BROWSE_NODE_RESOURCES)[number][];

export const browseNodeResourcesSchema = z
  .array(z.enum(VALID_BROWSE_NODE_RESOURCES))
  .optional()
  .describe(
    'Which fields Amazon should return for browse nodes. Valid: "browseNodes.children", "browseNodes.ancestor". Omit to use both.',
  );

export const formatSchema = z
  .enum(FORMAT_OPTIONS)
  .default('markdown')
  .describe(
    "Output format. DEFAULT TO 'markdown' OR 'json' when you plan to summarise the results in chat. Use 'html-card' / 'html-grid' ONLY when the user has explicitly asked for an embed, preview, card, widget, grid, or paste-ready HTML — these formats return a full HTML document the user pastes into their blog and are not for in-chat reading. 'markdown' = friendly summary source; 'json' = raw API data for programmatic use; 'html-card' = single product card; 'html-grid' = responsive grid of all items.",
  );

export const resourcesSchema = z
  .array(z.enum(VALID_RESOURCES))
  .optional()
  .describe(
    'Which fields Amazon should return. Names are camelCase (e.g. "itemInfo.title"). Omit to use a sensible default set.',
  );

/**
 * Narrower format enum for endpoints that don't produce product cards
 * (e.g. browse nodes — category metadata, nothing to embed).
 */
export const BROWSE_NODE_FORMAT_OPTIONS = ['json', 'markdown'] as const;

export const browseNodeFormatSchema = z
  .enum(BROWSE_NODE_FORMAT_OPTIONS)
  .default('markdown')
  .describe("Output format. 'markdown' is friendly for humans; 'json' is raw API data.");

export const customStylesSchema = z
  .string()
  .max(20_000, 'customStyles must be under 20,000 characters.')
  .optional()
  .describe(
    "Extra CSS appended to the default stylesheet when format is 'html-card' or 'html-grid'. Target stable class-name anchors: .amzn-card, .amzn-card__image, .amzn-card__title, .amzn-card__meta, .amzn-card__brand, .amzn-card__rating, .amzn-card__price, .amzn-card__price--unavailable, .amzn-card__savings, .amzn-card__cta, .amzn-card__disclosure, .amzn-grid. Ignored for 'markdown' and 'json'.",
  );

/** Default title cap for HTML cards — one line on ~320px card width. */
export const DEFAULT_TITLE_MAX_CHARS = 80;

export const titleMaxCharsSchema = z
  .number()
  .int()
  .min(0)
  .max(300)
  .optional()
  .describe(
    `Maximum rendered title length for HTML card/grid output. Amazon titles are often 150+ chars of keyword stuffing; clamping to ~80 keeps cards one-line on typical widths. Defaults to ${DEFAULT_TITLE_MAX_CHARS}. Set to 0 to disable. Ignored by 'markdown' and 'json' — those formats get the full untruncated title.`,
  );

export const hideItemsWithoutPriceSchema = z
  .boolean()
  .optional()
  .describe(
    "When format is 'html-grid', drop items that have no price. Defaults to true — cards without a price are weak embeds (no deal hook, reader must click through to learn anything). Set false for comparison tables where availability can lapse but you still want the product visible. Ignored for 'html-card', 'markdown', and 'json'.",
  );

export interface ToolDeps {
  config: AppConfig;
  client: CreatorsApiClient;
}

/**
 * Content shape accepted by MCP's `ToolResult.content`.
 *
 * Since v0.3.0 we render UI exclusively via the MCP Apps viewer resource
 * (see `src/mcp-apps/`) — hosts discover it via `_meta.ui.resourceUri` on
 * the tool definition, not via an inline resource block here — so every
 * tool only ever produces plain text content.
 */
type McpContent = { type: 'text'; text: string };

export interface McpToolResult {
  // The SDK types ToolResult as `{ [x: string]: unknown; content: [...]; ... }`.
  // Match the index signature so callers can pass us straight into registerTool.
  [x: string]: unknown;
  content: McpContent[];
  structuredContent: Record<string, unknown>;
}

/** Build { content, structuredContent } shape MCP expects from a formatter output. */
export function toMcpResult<T>(out: FormatterOutput<T>): McpToolResult {
  return {
    content: [{ type: 'text', text: out.text }],
    // The SDK types structuredContent as an index-signed record; cast is safe since
    // our response objects are plain JSON with string keys.
    structuredContent: out.structured as unknown as Record<string, unknown>,
  };
}

/** Supported response envelopes for HTML formats. Browse-nodes is excluded because it isn't a product list. */
type ItemBearingResponse = SearchItemsResponse | GetItemsResponse | GetVariationsResponse;

/** Arguments used to render a tool's output into text. */
export interface RenderToolOutputArgs<TResponse extends ItemBearingResponse> {
  format: OutputFormat;
  response: TResponse;
  partnerTag: string;
  marketplace: string;
  customStyles?: string;
  /**
   * ISO-8601 timestamp of when `response` was retrieved from Amazon. Threaded
   * into HTML formatters so they can render "as of <ts>" next to prices
   * (Associates compliance). Runners fetching fresh data pass `new Date().toISOString()`;
   * `format_items` lets the user override to preserve the original fetch time.
   */
  retrievedAt?: string;
  /**
   * Max title length for HTML formats. `undefined` = use `DEFAULT_TITLE_MAX_CHARS`.
   * `0` = disable truncation entirely. Non-HTML formats ignore this.
   */
  titleMaxChars?: number;
  /** html-grid only: drop items with no price. Defaults to true in the formatter. */
  hideItemsWithoutPrice?: boolean;
  /** Markdown formatter specific to this tool's response envelope. */
  markdownFormatter: (i: FormatterInput<TResponse>) => FormatterOutput<TResponse>;
}

/**
 * Run the chosen formatter and produce an MCP tool result.
 *
 * The tool result is plain text + structured content. MCP Apps-capable hosts
 * pick up the rendered HTML via the `_meta.ui.resourceUri` pointer on the
 * tool definition (see `src/server.ts`) and render it in a sandboxed iframe
 * using our viewer resource. Hosts that don't implement MCP Apps still see
 * the text content — which, for `html-card` / `html-grid`, IS the pasteable
 * HTML document the creator wants.
 */
export function renderToolOutput<TResponse extends ItemBearingResponse>(
  args: RenderToolOutputArgs<TResponse>,
): McpToolResult {
  const {
    format,
    response,
    partnerTag,
    marketplace,
    customStyles,
    retrievedAt,
    titleMaxChars,
    hideItemsWithoutPrice,
    markdownFormatter,
  } = args;
  // Apply the default title cap here (not in the schema) so markdown / json
  // can ignore the field entirely — we want the full untruncated title for
  // those formats regardless of what the caller passed.
  const resolvedTitleMax = titleMaxChars ?? DEFAULT_TITLE_MAX_CHARS;
  const input: FormatterInput<TResponse> = {
    response,
    partnerTag,
    marketplace,
    customStyles,
    retrievedAt,
    titleMaxChars: resolvedTitleMax,
    hideItemsWithoutPrice,
  };

  if (format === 'json') return toMcpResult(formatJson(input));
  if (format === 'markdown') return toMcpResult(markdownFormatter(input));

  const out = format === 'html-card' ? formatHtmlCard(input) : formatHtmlGrid(input);
  return toMcpResult(out);
}

export { HTML_FORMATS };
