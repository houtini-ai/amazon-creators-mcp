import { z } from 'zod';
import { formatSearchItemsMarkdown } from '../formatters/markdown.js';
import type { SearchItemsResponse } from '../types/creators.js';
import {
  customStylesSchema,
  DEFAULT_ITEM_RESOURCES,
  formatSchema,
  hideItemsWithoutPriceSchema,
  renderToolOutput,
  resourcesSchema,
  titleMaxCharsSchema,
  type ToolDeps,
} from './shared.js';

export const SEARCH_ITEMS_TOOL_NAME = 'search_items';

export const SEARCH_ITEMS_DESCRIPTION =
  "Search Amazon's catalog by keywords (plus optional title/actor/author/brand/browse-node filters). Returns up to 10 items per page; paginate via `itemPage: 2..10` (100 items max). `totalResultCount` = results that exist, not results accessible. Prices are in the marketplace's currency.\n\nPRESENTATION GUIDANCE (important): default to `format: 'markdown'` or `format: 'json'`. After the tool returns, DO NOT paste the raw output into the chat. Instead, summarise the results conversationally — e.g. \"I found 5 coffee grinders. The standouts are: • Baratza Encore ($179, highly rated burr grinder) • OXO Brew ($99, solid budget pick) …\" — then END your reply by asking the user whether they'd like an **embeddable HTML card/grid for their blog**. Only call the tool with `format: 'html-card'` or `format: 'html-grid'` when the user has *explicitly* asked for a preview, card, widget, embed, or paste-ready HTML. Never default to HTML output.";

export const searchItemsShape = {
  keywords: z.string().min(1).optional().describe('Search keywords. Required unless a different scoping field (title/actor/author/brand/browseNodeId) is provided.'),
  title: z.string().optional().describe('Search within product titles.'),
  actor: z.string().optional(),
  author: z.string().optional(),
  artist: z.string().optional(),
  brand: z.string().optional(),
  browseNodeId: z.string().optional().describe('Restrict results to a browse node (category).'),
  searchIndex: z.string().optional().describe('Product category, e.g. "Electronics", "Books", "All".'),
  itemCount: z.number().int().min(1).max(10).optional().describe('Items per page (max 10).'),
  itemPage: z.number().int().min(1).max(10).optional().describe('Page number (1-10).'),
  minPrice: z.number().int().optional().describe('Min price in smallest currency unit (cents/pence).'),
  maxPrice: z.number().int().optional().describe('Max price in smallest currency unit (cents/pence).'),
  minReviewsRating: z.number().min(1).max(5).optional().describe('Minimum star rating (1-5).'),
  minSavingPercent: z.number().int().min(1).max(99).optional(),
  sortBy: z
    .enum(['Featured', 'NewestArrivals', 'Price:HighToLow', 'Price:LowToHigh', 'Relevance', 'AvgCustomerReviews'])
    .optional(),
  availability: z.enum(['Available', 'IncludeOutOfStock']).optional(),
  condition: z.enum(['Any', 'Collectible', 'New', 'Refurbished', 'Used']).optional(),
  deliveryFlags: z.array(z.string()).optional(),
  languagesOfPreference: z.array(z.string()).optional(),
  merchant: z.enum(['All', 'Amazon']).optional(),
  resources: resourcesSchema,
  format: formatSchema,
  customStyles: customStylesSchema,
  titleMaxChars: titleMaxCharsSchema,
  hideItemsWithoutPrice: hideItemsWithoutPriceSchema,
};

export const searchItemsInput = z.object(searchItemsShape);

export type SearchItemsInput = z.infer<typeof searchItemsInput>;

function ensureSearchScope(input: SearchItemsInput): void {
  if (!input.keywords && !input.title && !input.actor && !input.author && !input.artist && !input.brand && !input.browseNodeId) {
    throw new Error('Provide at least one of: keywords, title, actor, author, artist, brand, browseNodeId.');
  }
}

export function buildSearchItemsPayload(input: SearchItemsInput, partnerTag: string, marketplace: string): Record<string, unknown> {
  const {
    resources,
    format: _format,
    customStyles: _customStyles,
    titleMaxChars: _titleMaxChars,
    hideItemsWithoutPrice: _hideItemsWithoutPrice,
    ...rest
  } = input;

  return {
    ...rest,
    resources: resources ?? DEFAULT_ITEM_RESOURCES,
    partnerTag,
    partnerType: 'Associates',
    marketplace,
  };
}

export async function runSearchItems(deps: ToolDeps, input: SearchItemsInput) {
  ensureSearchScope(input);
  const payload = buildSearchItemsPayload(input, deps.config.partnerTag, deps.config.marketplace);
  const response = await deps.client.call<SearchItemsResponse>('searchItems', payload);
  return renderToolOutput({
    format: input.format,
    response,
    partnerTag: deps.config.partnerTag,
    marketplace: deps.config.marketplace,
    customStyles: input.customStyles,
    retrievedAt: new Date().toISOString(),
    titleMaxChars: input.titleMaxChars,
    hideItemsWithoutPrice: input.hideItemsWithoutPrice,
    markdownFormatter: formatSearchItemsMarkdown,
  });
}
