#!/usr/bin/env node
/**
 * @houtini/amazon-creators-mcp — entry point.
 *
 * Implementation lands in v0.1; see SCOPE.md for the plan.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[amazon-creators-mcp] running on stdio');
}

main().catch((err) => {
  console.error('[amazon-creators-mcp] fatal:', err);
  process.exit(1);
});
