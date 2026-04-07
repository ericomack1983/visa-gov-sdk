#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// test-guardrails.ts — Dedicated guardrail / security tests for MCP tools
//
// Verifies:
//   1. No-token → requiresConfirmation: true, no money moved
//   2. Tampered token (wrong hash) → rejected
//   3. Expired token (> 5 min) → rejected
//   4. Cross-tool token reuse → rejected
//   5. Token replay prevention (double-use) → rejected
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// After bundling, test-guardrails.js is in the same directory as index.js (mcp/dist/)
const SERVER_PATH = path.join(__dirname, 'index.js');

// ─────────────────────────────────────────────────────────────────────────────
// JSON-RPC client
// ─────────────────────────────────────────────────────────────────────────────

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

class McpTestClient {
  private proc: ReturnType<typeof spawn>;
  private buffer = '';
  private pending = new Map<number, (r: JsonRpcResponse) => void>();
  private idCounter = 1;

  constructor() {
    this.proc = spawn('node', [SERVER_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as JsonRpcResponse;
          if (msg.id !== undefined) {
            const resolve = this.pending.get(msg.id);
            if (resolve) { this.pending.delete(msg.id); resolve(msg); }
          }
        } catch { /* ignore */ }
      }
    });
    this.proc.stderr!.on('data', () => {});
  }

  async initialize(): Promise<void> {
    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'guardrail-test', version: '1.0' },
      capabilities: {},
    });
    this.notify('notifications/initialized', {});
  }

  send(method: string, params: unknown): Promise<JsonRpcResponse> {
    const id = this.idCounter++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  notify(method: string, params: unknown): void {
    this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const res = await this.send('tools/call', { name, arguments: args });
    return res.result;
  }

  close(): void { this.proc.stdin!.end(); this.proc.kill(); }
}

function parseResult(raw: unknown): Record<string, unknown> {
  const r = raw as { content?: Array<{ text: string }> };
  if (r?.content?.[0]?.text) return JSON.parse(r.content[0].text) as Record<string, unknown>;
  return raw as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test runner
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ PASS  ${name}`);
    passed++;
  } catch (e: unknown) {
    console.log(`  ✗ FAIL  ${name}: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared VCN params for tests
// ─────────────────────────────────────────────────────────────────────────────

const VCN_PARAMS = {
  clientId:    'B2BWS_1_1_9999',
  buyerId:     '9999',
  proxyPoolId: 'Proxy12345',
  startDate:   '06/01/2026',
  endDate:     '06/30/2026',
  rules:       [{ ruleCode: 'ATM' }],
  memo:        'Guardrail test',
};

const BIP_PARAMS = {
  clientId:      'B2BWS_1_1_9999',
  buyerId:       '9999',
  supplierId:    'SUPP-001',
  paymentAmount: 1000,
  currencyCode:  '840',
  invoiceNumber: 'INV-GUARD-TEST',
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

const client = new McpTestClient();
await client.initialize();

console.log('\n─── Guardrail Tests ─────────────────────────────────────────\n');

// Test 1: No token → Phase 1 (preview only, no money moved)
await test('vcn: no token → requiresConfirmation: true, no card issued', async () => {
  const raw = await client.callTool('vcn_issue_virtual_card', VCN_PARAMS);
  const result = parseResult(raw);
  assert(result.requiresConfirmation === true, 'Expected requiresConfirmation: true');
  assert(typeof result.confirmationToken === 'string', 'Expected confirmationToken string');
  assert(!('accounts' in result), 'Must NOT return accounts in Phase 1');
});

await test('bip: no token → requiresConfirmation: true, no payment created', async () => {
  const raw = await client.callTool('bip_initiate_payment', BIP_PARAMS);
  const result = parseResult(raw);
  assert(result.requiresConfirmation === true, 'Expected requiresConfirmation: true');
  assert(!('paymentId' in result), 'Must NOT return paymentId in Phase 1');
});

await test('sip_approve: no token → requiresConfirmation: true, no funds moved', async () => {
  const raw = await client.callTool('sip_approve_payment', {
    clientId: 'B2BWS_1_1_9999', buyerId: '9999',
    requisitionId: 'DUMMY-REQ', approvedAmount: 100,
  });
  const result = parseResult(raw);
  assert(result.requiresConfirmation === true, 'Expected requiresConfirmation: true');
  assert(!('paymentId' in result), 'Must NOT return paymentId in Phase 1');
});

// Test 2: Tampered token (wrong hash)
await test('vcn: tampered token (wrong hash) → isError: true', async () => {
  // Get a real token first
  const phase1 = parseResult(await client.callTool('vcn_issue_virtual_card', VCN_PARAMS));
  const realToken = phase1.confirmationToken as string;
  // Tamper the hash part
  const parts = realToken.split(':');
  parts[1] = 'tampered_hash_value_abc123';
  const tamperedToken = parts.join(':');

  const raw = await client.callTool('vcn_issue_virtual_card', { ...VCN_PARAMS, confirmationToken: tamperedToken });
  const result = raw as { isError?: boolean };
  assert(result.isError === true, 'Expected isError: true for tampered token');
});

// Test 3: Expired token (> 5 minutes)
await test('vcn: expired token (>5 min old) → isError: true', async () => {
  const oldTs = Date.now() - 310_000; // 310 seconds ago
  const fakeHash = crypto.createHash('sha256').update('{}').digest('hex');
  const expiredToken = `vcn_issue_virtual_card:${fakeHash}:${oldTs}`;

  const raw = await client.callTool('vcn_issue_virtual_card', { ...VCN_PARAMS, confirmationToken: expiredToken });
  const result = raw as { isError?: boolean; content?: Array<{ text: string }> };
  assert(result.isError === true, 'Expected isError: true for expired token');
});

// Test 4: Cross-tool token reuse (BIP token used for VCN)
await test('cross-tool token reuse → isError: true', async () => {
  // Get a BIP token
  const bipPhase1 = parseResult(await client.callTool('bip_initiate_payment', BIP_PARAMS));
  const bipToken = bipPhase1.confirmationToken as string;

  // Try to use the BIP token for VCN
  const raw = await client.callTool('vcn_issue_virtual_card', { ...VCN_PARAMS, confirmationToken: bipToken });
  const result = raw as { isError?: boolean };
  assert(result.isError === true, 'Expected isError: true when using BIP token for VCN tool');
});

// Test 5: Token replay prevention (use same token twice)
await test('token replay prevention → second use rejected', async () => {
  // Phase 1 — get token
  const phase1 = parseResult(await client.callTool('vcn_issue_virtual_card', VCN_PARAMS));
  const token = phase1.confirmationToken as string;

  // Phase 2 — first use (should succeed)
  const first = parseResult(await client.callTool('vcn_issue_virtual_card', { ...VCN_PARAMS, confirmationToken: token }));
  assert(first.responseCode === '00', `Phase 2 first use failed: ${JSON.stringify(first)}`);

  // Phase 2 — second use (should be rejected as replay)
  const replay = await client.callTool('vcn_issue_virtual_card', { ...VCN_PARAMS, confirmationToken: token });
  const replayResult = replay as { isError?: boolean };
  assert(replayResult.isError === true, 'Expected isError: true for replay attack');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

client.close();

const total = passed + failed;
console.log(`\n${'─'.repeat(60)}`);
console.log(`  Guardrail Tests — Passed: ${passed}/${total}  Failed: ${failed}`);

if (failed > 0) process.exit(1);
