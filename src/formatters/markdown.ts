/**
 * Markdown formatters per operation — tuned for pasting into blog posts.
 */
import type { FormatterInput, FormatterOutput } from './types.js';
import type {
  SearchItemsResponse,
  GetItemsResponse,
  GetVariationsResponse,
  GetBrowseNodesResponse,
  Item,
  BrowseNode,
  ApiErrorEntry,
} from '../types/creators.js';
import {
  AMAZON_DISCLOSURE,
  brand,
  detailUrl,
  displayPrice,
  primaryImage,
  savingsSummary,
  starRating,
  title,
} from './helpers.js';

function renderItem(item: Item, marketplace: string, partnerTag: string, retrievedAt: string): string {
  const url = detailUrl(item, marketplace, partnerTag);
  const t = title(item);
  const img = primaryImage(item);
  const price = displayPrice(item);
  const savings = savingsSummary(item);
  const stars = starRating(item);
  const brandName = brand(item);

  const lines: string[] = [];

  if (img) lines.push(`[![${escapeAlt(t)}](${img})](${url})`);
  lines.push(`**[${t}](${url})**`);

  const meta: string[] = [];
  if (brandName) meta.push(`Brand: ${brandName}`);
  if (stars) meta.push(stars);
  if (meta.length) lines.push(meta.join(' · '));

  if (price) {
    // Associates compliance: a displayed price must be accompanied by its retrieval
    // timestamp + a "subject to change" notice (latter lives in the disclosure block).
    const priceLine = savings ? `**${price}** — ${savings}` : `**${price}**`;
    lines.push(`${priceLine} _(as of ${humaniseTimestamp(retrievedAt)})_`);
  }

  lines.push(`ASIN: \`${item.asin}\``);
  return lines.join('\n');
}

function resolveTimestamp(retrievedAt: string | undefined): string {
  const raw = retrievedAt ?? new Date().toISOString();
  return raw.replace(/\.\d{3}Z$/, 'Z');
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function humaniseTimestamp(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, h, min] = m;
  const monthName = MONTH_ABBR[parseInt(mo!, 10) - 1] ?? mo;
  return `${parseInt(d!, 10)} ${monthName} ${y}, ${h}:${min} UTC`;
}

function renderErrors(errors: ApiErrorEntry[] | undefined): string {
  if (!errors || errors.length === 0) return '';
  const items = errors.map((e) => {
    const key = e.asin ? `\`${e.asin}\`: ` : '';
    return `- ${key}${e.code ?? 'Error'} — ${e.message ?? 'unspecified'}`;
  });
  return `\n### Errors\n${items.join('\n')}\n`;
}

function escapeAlt(s: string): string {
  return s.replace(/[\[\]]/g, '');
}

function disclosureBlock(): string {
  return `\n> *${AMAZON_DISCLOSURE}*\n`;
}

// ---------- searchItems ----------

export function formatSearchItemsMarkdown(
  input: FormatterInput<SearchItemsResponse>,
): FormatterOutput<SearchItemsResponse> {
  const { response, marketplace, partnerTag, retrievedAt } = input;
  const ts = resolveTimestamp(retrievedAt);
  const items = response.searchResult?.items ?? [];
  const total = response.searchResult?.totalResultCount;
  const searchURL = response.searchResult?.searchURL;

  const header = `## Amazon search results${typeof total === 'number' ? ` (${total.toLocaleString()} total)` : ''}`;
  const blocks = items.map((it) => renderItem(it, marketplace, partnerTag, ts));
  const body = blocks.length ? blocks.join('\n\n---\n\n') : '_No items found._';
  const footer = searchURL ? `\n[View all results on Amazon](${searchURL})\n` : '';

  return {
    text: [header, '', body, footer, renderErrors(response.errors), disclosureBlock()].join('\n'),
    structured: response,
  };
}

// ---------- getItems ----------

export function formatGetItemsMarkdown(
  input: FormatterInput<GetItemsResponse>,
): FormatterOutput<GetItemsResponse> {
  const { response, marketplace, partnerTag, retrievedAt } = input;
  const ts = resolveTimestamp(retrievedAt);
  const items = response.itemsResult?.items ?? [];
  const header = `## Amazon products`;
  const blocks = items.map((it) => renderItem(it, marketplace, partnerTag, ts));
  const body = blocks.length ? blocks.join('\n\n---\n\n') : '_No items returned._';
  return {
    text: [header, '', body, renderErrors(response.errors), disclosureBlock()].join('\n'),
    structured: response,
  };
}

// ---------- getVariations ----------

export function formatGetVariationsMarkdown(
  input: FormatterInput<GetVariationsResponse>,
): FormatterOutput<GetVariationsResponse> {
  const { response, marketplace, partnerTag, retrievedAt } = input;
  const ts = resolveTimestamp(retrievedAt);
  const items = response.variationsResult?.items ?? [];
  const header = `## Variations`;
  const blocks = items.map((it) => renderItem(it, marketplace, partnerTag, ts));
  const body = blocks.length ? blocks.join('\n\n---\n\n') : '_No variations returned._';
  return {
    text: [header, '', body, renderErrors(response.errors), disclosureBlock()].join('\n'),
    structured: response,
  };
}

// ---------- getBrowseNodes ----------

function renderBrowseNode(node: BrowseNode, depth = 0): string {
  const bullet = '  '.repeat(depth) + '-';
  const name = node.displayName ?? node.contextFreeName ?? '(unnamed)';
  const id = node.id ? ` \`${node.id}\`` : '';
  const rank = typeof node.salesRank === 'number' ? ` (rank ${node.salesRank.toLocaleString()})` : '';
  const children = node.children?.length
    ? '\n' + node.children.map((c) => renderBrowseNode(c, depth + 1)).join('\n')
    : '';
  return `${bullet} ${name}${id}${rank}${children}`;
}

export function formatGetBrowseNodesMarkdown(
  input: FormatterInput<GetBrowseNodesResponse>,
): FormatterOutput<GetBrowseNodesResponse> {
  const { response } = input;
  const nodes = response.browseNodesResult?.browseNodes ?? [];
  const header = `## Browse nodes`;
  const body = nodes.length ? nodes.map((n) => renderBrowseNode(n)).join('\n\n') : '_No nodes returned._';
  return {
    text: [header, '', body, renderErrors(response.errors)].join('\n'),
    structured: response,
  };
}
