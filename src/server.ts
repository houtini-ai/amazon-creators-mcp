/**
 * MCP server factory — builds the server and registers all Creators API tools.
 *
 * Discovery model (v0.3.0):
 * Tools are registered via `registerAppTool` from `@modelcontextprotocol/ext-apps`,
 * each carrying `_meta.ui.resourceUri` pointing at the shared viewer resource.
 * MCP Apps-capable hosts (Claude Desktop) see that pointer, call `resources/read`
 * on the viewer URI, and render the result in a sandboxed iframe. Hosts without
 * MCP Apps still receive the plain text content — which, for `html-card` /
 * `html-grid`, IS the HTML document the creator pastes into their blog.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { loadConfig } from './config/env.js';
import { TokenCache } from './auth/token-cache.js';
import { CreatorsApiClient } from './client/creators-api.js';
import { registerViewerResource, VIEWER_RESOURCE_URI } from './mcp-apps/register.js';
import { SERVER_VERSION } from './version.js';
import {
  SEARCH_ITEMS_TOOL_NAME,
  SEARCH_ITEMS_DESCRIPTION,
  searchItemsShape,
  runSearchItems,
} from './tools/search-items.js';
import {
  GET_ITEMS_TOOL_NAME,
  GET_ITEMS_DESCRIPTION,
  getItemsShape,
  runGetItems,
} from './tools/get-items.js';
import {
  GET_VARIATIONS_TOOL_NAME,
  GET_VARIATIONS_DESCRIPTION,
  getVariationsShape,
  runGetVariations,
} from './tools/get-variations.js';
import {
  GET_BROWSE_NODES_TOOL_NAME,
  GET_BROWSE_NODES_DESCRIPTION,
  getBrowseNodesShape,
  runGetBrowseNodes,
} from './tools/get-browse-nodes.js';
import {
  FORMAT_ITEMS_TOOL_NAME,
  FORMAT_ITEMS_DESCRIPTION,
  formatItemsShape,
  runFormatItems,
} from './tools/format-items.js';

function errorResult(e: unknown) {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === 'string'
        ? e
        : JSON.stringify(e);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `Error: ${msg}` }],
  };
}

/** Shared `_meta` payload — every tool points at the same viewer. */
const UI_META = { ui: { resourceUri: VIEWER_RESOURCE_URI } } as const;

export function buildServer(): McpServer {
  const config = loadConfig();
  const tokens = new TokenCache(config);
  const client = new CreatorsApiClient(config, tokens);
  const deps = { config, client };

  const server = new McpServer({
    name: 'amazon-creators',
    version: SERVER_VERSION,
  });

  // Register the single viewer resource all tools share.
  registerViewerResource(server);

  registerAppTool(
    server,
    SEARCH_ITEMS_TOOL_NAME,
    {
      description: SEARCH_ITEMS_DESCRIPTION,
      inputSchema: searchItemsShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: UI_META,
    },
    async (args) => {
      try {
        return await runSearchItems(deps, args);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  registerAppTool(
    server,
    GET_ITEMS_TOOL_NAME,
    {
      description: GET_ITEMS_DESCRIPTION,
      inputSchema: getItemsShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: UI_META,
    },
    async (args) => {
      try {
        return await runGetItems(deps, args);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  registerAppTool(
    server,
    GET_VARIATIONS_TOOL_NAME,
    {
      description: GET_VARIATIONS_DESCRIPTION,
      inputSchema: getVariationsShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: UI_META,
    },
    async (args) => {
      try {
        return await runGetVariations(deps, args);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // Browse-nodes doesn't produce product cards — the viewer gracefully falls
  // back to a readable text block for markdown/json output, so we still wire
  // it through MCP Apps for consistency.
  registerAppTool(
    server,
    GET_BROWSE_NODES_TOOL_NAME,
    {
      description: GET_BROWSE_NODES_DESCRIPTION,
      inputSchema: getBrowseNodesShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: UI_META,
    },
    async (args) => {
      try {
        return await runGetBrowseNodes(deps, args);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  registerAppTool(
    server,
    FORMAT_ITEMS_TOOL_NAME,
    {
      description: FORMAT_ITEMS_DESCRIPTION,
      inputSchema: formatItemsShape,
      // Local re-render only — doesn't hit Amazon. Read-only but does not open the world.
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: UI_META,
    },
    async (args) => {
      try {
        return await runFormatItems(deps, args);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  return server;
}
