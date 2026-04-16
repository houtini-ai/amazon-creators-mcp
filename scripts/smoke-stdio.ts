/**
 * End-to-end stdio smoke test: spawns the built binary and exchanges JSON-RPC frames.
 * Verifies:
 *   - initialize → tools/list (expect 5 tools)
 *   - tools/call search_items (markdown) — content + structuredContent
 *   - tools/call search_items (html-card) — HTML + MCP UI resource in content[]
 *   - tools/call format_items (html-card, customStyles) — re-render without hitting Amazon
 * Run: npm run build && npx tsx scripts/smoke-stdio.ts
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnvIntoObject(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[k] = v;
    }
  } catch {
    /* ignore */
  }
  return out;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

async function main(): Promise<void> {
  const envFromFile = loadDotEnvIntoObject();
  const child = spawn('node', ['dist/index.js'], {
    cwd: resolve(process.cwd()),
    env: { ...process.env, ...envFromFile, DEBUG: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stderr.on('data', (buf: Buffer) => process.stderr.write(`[server stderr] ${buf.toString()}`));

  const pending = new Map<number, (res: JsonRpcResponse) => void>();
  let buffer = '';
  child.stdout.on('data', (buf: Buffer) => {
    buffer += buf.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() === '') continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line) as JsonRpcResponse;
      } catch {
        console.error(`[client] could not parse line: ${line}`);
        continue;
      }
      if (typeof msg.id === 'number' && pending.has(msg.id)) {
        const resolve = pending.get(msg.id);
        pending.delete(msg.id);
        resolve?.(msg);
      }
    }
  });

  let nextId = 1;
  const send = (method: string, params?: unknown): Promise<JsonRpcResponse> => {
    const id = nextId++;
    return new Promise<JsonRpcResponse>((resolveP) => {
      pending.set(id, resolveP);
      const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      child.stdin.write(frame);
    });
  };

  try {
    console.error('\n[stdio] initialize');
    const initRes = await send('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'smoke-stdio', version: '0.0.0' },
    });
    console.error('  →', JSON.stringify(initRes.result).slice(0, 400));

    // MCP requires the client to send a notifications/initialized after initialize.
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    console.error('\n[stdio] tools/list');
    const listRes = await send('tools/list', {});
    const tools = (listRes.result as { tools: Array<{ name: string }> }).tools ?? [];
    console.error(`  → ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`);
    if (tools.length !== 5) throw new Error(`expected 5 tools, got ${tools.length}`);

    console.error('\n[stdio] tools/call search_items (markdown)');
    const callRes = await send('tools/call', {
      name: 'search_items',
      arguments: { keywords: 'coffee grinder', itemCount: 2, format: 'markdown' },
    });
    const callResult = callRes.result as {
      content: Array<{ type: string; text?: string; resource?: { uri: string; mimeType: string } }>;
      structuredContent?: unknown;
      isError?: boolean;
    };
    if (callResult.isError) throw new Error(`tool call errored: ${callResult.content[0]?.text}`);
    console.error(`  → content[0].text length=${callResult.content[0]?.text?.length ?? 0}`);
    console.error(`  → structuredContent present=${callResult.structuredContent !== undefined}`);
    const preview = callResult.content[0]?.text?.slice(0, 300) ?? '';
    console.error(`  → preview:\n${preview}\n…`);

    console.error('\n[stdio] tools/call search_items (html-card + customStyles)');
    const htmlRes = await send('tools/call', {
      name: 'search_items',
      arguments: {
        keywords: 'coffee grinder',
        itemCount: 1,
        format: 'html-card',
        customStyles: '.amzn-card { background: #0f172a; color: #f1f5f9; }',
      },
    });
    const htmlResult = htmlRes.result as {
      content: Array<{ type: string; text?: string; resource?: { uri: string; mimeType: string } }>;
      structuredContent?: unknown;
      isError?: boolean;
    };
    if (htmlResult.isError) throw new Error(`html-card tool call errored: ${htmlResult.content[0]?.text}`);
    const uiItem = htmlResult.content.find((c) => c.type === 'resource');
    if (!uiItem?.resource) throw new Error('expected a UIResource in content[]');
    console.error(`  → content kinds: ${htmlResult.content.map((c) => c.type).join(', ')}`);
    console.error(`  → ui resource uri: ${uiItem.resource.uri}`);
    console.error(`  → ui resource mimeType: ${uiItem.resource.mimeType}`);

    console.error('\n[stdio] tools/call format_items (re-render without hitting Amazon)');
    const formatRes = await send('tools/call', {
      name: 'format_items',
      arguments: {
        response: htmlResult.structuredContent,
        format: 'html-card',
        customStyles: '.amzn-card { border: 4px dashed hotpink; }',
      },
    });
    const formatResult = formatRes.result as {
      content: Array<{ type: string; text?: string; resource?: { uri: string; mimeType: string } }>;
      isError?: boolean;
    };
    if (formatResult.isError) throw new Error(`format_items errored: ${formatResult.content[0]?.text}`);
    const reUri = formatResult.content.find((c) => c.type === 'resource')?.resource?.uri;
    console.error(`  → format_items ui resource uri: ${reUri}`);
    if (!reUri || reUri === uiItem.resource.uri) {
      throw new Error('format_items URI should differ from search_items URI (different customStyles)');
    }

    console.error('\n✅ stdio smoke passed');
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error('\n❌ stdio smoke failed:', err);
  process.exit(1);
});
