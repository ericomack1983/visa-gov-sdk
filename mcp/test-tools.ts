#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// test-tools.ts — Smoke tests for all MCP tools
//
// Starts the MCP server as a child process and runs JSON-RPC calls against it.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// After bundling, test-tools.js is in the same directory as index.js (mcp/dist/)
const SERVER_PATH = path.join(__dirname, 'index.js');

// ─────────────────────────────────────────────────────────────────────────────
// JSON-RPC client over stdio
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
    this.proc = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

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
        } catch { /* ignore non-JSON lines */ }
      }
    });

    // Suppress stderr from the server
    this.proc.stderr!.on('data', () => {});
  }

  async initialize(): Promise<void> {
    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'test-client', version: '1.0' },
      capabilities: {},
    });
    this.notify('notifications/initialized', {});
  }

  send(method: string, params: unknown): Promise<JsonRpcResponse> {
    const id = this.idCounter++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.proc.stdin!.write(msg);
    });
  }

  notify(method: string, params: unknown): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.proc.stdin!.write(msg);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const res = await this.send('tools/call', { name, arguments: args });
    return res.result;
  }

  async listTools(): Promise<string[]> {
    const res = await this.send('tools/list', {});
    const result = res.result as { tools: Array<{ name: string }> };
    return result.tools.map((t) => t.name);
  }

  close(): void {
    this.proc.stdin!.end();
    this.proc.kill();
  }
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

function assertHasKey(obj: unknown, key: string): void {
  assert(typeof obj === 'object' && obj !== null && key in (obj as object), `Expected key "${key}" in result`);
}

function parseResult(raw: unknown): unknown {
  const r = raw as { content?: Array<{ text: string }> };
  if (r?.content?.[0]?.text) {
    return JSON.parse(r.content[0].text);
  }
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const client = new McpTestClient();

await client.initialize();

console.log('\n─── tools/list ──────────────────────────────────────────────');
const EXPECTED_TOOLS = [
  'sms_check_supplier', 'sms_bulk_check_suppliers', 'ai_evaluate_bids',
  'vpc_suggest_rules', 'vpc_apply_rules', 'vpc_set_rules_manual',
  'vpc_get_rules', 'vpc_block_account', 'vpc_create_account',
  'vpc_get_transaction_history',
  'vcn_issue_virtual_card',
  'bip_initiate_payment', 'bip_get_status', 'bip_cancel_payment',
  'sip_submit_request', 'sip_approve_payment', 'sip_reject_payment',
  'settlement_initiate',
  'vpa_create_buyer', 'vpa_process_payment',
];

await test('tools/list — all expected tools present', async () => {
  const tools = await client.listTools();
  for (const name of EXPECTED_TOOLS) {
    assert(tools.includes(name), `Missing tool: ${name}`);
  }
  console.log(`    (found ${tools.length} tools)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// SAFE TOOLS
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n─── Safe tools (no confirmation required) ───────────────────');

await test('sms_check_supplier', async () => {
  const raw = await client.callTool('sms_check_supplier', {
    supplierName: 'MedEquip Co.',
    supplierCountryCode: 'US',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assertHasKey(result, 'isRegistered');
  assertHasKey(result, 'confidenceScore');
  assertHasKey(result, 'mcc');
});

await test('sms_bulk_check_suppliers', async () => {
  const raw = await client.callTool('sms_bulk_check_suppliers', {
    suppliers: [
      { supplierName: 'MedEquip Co.',   supplierCountryCode: 'US' },
      { supplierName: 'TechSupply Ltd', supplierCountryCode: 'US' },
    ],
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assert(typeof result === 'object' && result !== null, 'Expected object result');
  assert('MedEquip Co.' in result || 'TechSupply Ltd' in result, 'Expected supplier keys in result');
});

await test('ai_evaluate_bids', async () => {
  const raw = await client.callTool('ai_evaluate_bids', {
    rfp: { id: 'RFP-2026-001', budgetCeiling: 50000 },
    bids: [
      { id: 'BID-001', supplierId: 'SUPP-001', amount: 45000, deliveryDays: 14 },
      { id: 'BID-002', supplierId: 'SUPP-002', amount: 48000, deliveryDays:  7 },
    ],
    suppliers: [
      { id: 'SUPP-001', name: 'MedEquip Co.',   pastPerformance: 85, complianceStatus: 'Compliant',      certifications: ['ISO 9001'], riskScore: 20 },
      { id: 'SUPP-002', name: 'HealthTech Ltd', pastPerformance: 78, complianceStatus: 'Pending Review', certifications: [],            riskScore: 35 },
    ],
    countryCode: 'US',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assertHasKey(result, 'winner');
  assertHasKey(result, 'rankedBids');
});

await test('vpc_suggest_rules', async () => {
  const raw = await client.callTool('vpc_suggest_rules', {
    prompt: 'Medical equipment, $50k/month, no ATM',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assertHasKey(result, 'suggestions');
  assertHasKey(result, 'promptId');
});

let vpcAccountId = '';
await test('vpc_create_account', async () => {
  const raw = await client.callTool('vpc_create_account', {
    accountNumber: '4111111111111111',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assertHasKey(result, 'accountId');
  vpcAccountId = result.accountId as string;
});

await test('vpc_get_rules', async () => {
  assert(!!vpcAccountId, 'Need accountId from vpc_create_account');
  const raw = await client.callTool('vpc_get_rules', { accountId: vpcAccountId });
  const result = parseResult(raw) as Record<string, unknown>;
  assertHasKey(result, 'rules');
});

await test('vpc_block_account', async () => {
  assert(!!vpcAccountId, 'Need accountId from vpc_create_account');
  const raw = await client.callTool('vpc_block_account', {
    accountId: vpcAccountId,
    reason: 'test block',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assertHasKey(result, 'accountId');
  assertHasKey(result, 'reason');
});

await test('vpc_get_transaction_history', async () => {
  assert(!!vpcAccountId, 'Need accountId from vpc_create_account');
  const raw = await client.callTool('vpc_get_transaction_history', {
    accountId: vpcAccountId,
    outcome: 'declined',
  });
  const result = parseResult(raw) as unknown;
  assert(Array.isArray(result), 'Expected array of transactions');
});

await test('bip_get_status (graceful error for unknown paymentId)', async () => {
  const raw = await client.callTool('bip_get_status', {
    clientId:  'B2BWS_1_1_9999',
    paymentId: 'FAKE-PAYMENT-ID',
  });
  const r = raw as { isError?: boolean; content?: Array<{ text: string }> };
  assert(r.isError === true, 'Expected isError: true for unknown paymentId');
});

await test('sip_submit_request', async () => {
  const raw = await client.callTool('sip_submit_request', {
    clientId:        'B2BWS_1_1_9999',
    supplierId:      'SUPP-001',
    buyerId:         '9999',
    requestedAmount: 2300,
    currencyCode:    '840',
    invoiceNumber:   'INV-SUPP-2026-007',
    startDate:       '2026-04-01',
    endDate:         '2026-04-30',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assertHasKey(result, 'requisitionId');
  assert(result.status === 'pending_approval', 'Expected pending_approval status');
});

await test('vpa_create_buyer', async () => {
  const raw = await client.callTool('vpa_create_buyer', {
    clientId:  'GOV-001',
    buyerName: 'Ministry of Health',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assertHasKey(result, 'buyerId');
  assertHasKey(result, 'buyerName');
});

await test('settlement_initiate', async () => {
  const raw = await client.callTool('settlement_initiate', {
    method:  'USD',
    orderId: 'ORD-2026-001',
    amount:  48500,
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assertHasKey(result, 'settledAt');
  assertHasKey(result, 'orderId');
  assert(result.amount === 48500, 'Expected amount 48500');
});

// ─────────────────────────────────────────────────────────────────────────────
// GUARDRAIL TOOLS — two-phase confirmation
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n─── Guardrail tools (two-phase confirmation) ────────────────');

let vcnToken = '';
await test('vcn_issue_virtual_card Phase 1 — preview + token', async () => {
  const raw = await client.callTool('vcn_issue_virtual_card', {
    clientId:  'B2BWS_1_1_9999',
    buyerId:   '9999',
    proxyPoolId: 'Proxy12345',
    startDate: '06/01/2026',
    endDate:   '06/30/2026',
    rules: [{ ruleCode: 'SPV', overrides: [
      { sequence: '1', overrideCode: 'spendLimitAmount',   overrideValue: '48500' },
      { sequence: '2', overrideCode: 'maxAuth',            overrideValue: '1'     },
      { sequence: '3', overrideCode: 'amountCurrencyCode', overrideValue: '840'   },
      { sequence: '4', overrideCode: 'rangeType',          overrideValue: '4'     },
    ]}],
    memo: 'Medical procurement Q2 2026',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assert(result.requiresConfirmation === true, 'Expected requiresConfirmation: true');
  assert(typeof result.confirmationToken === 'string', 'Expected confirmationToken string');
  assertHasKey(result, 'preview');
  vcnToken = result.confirmationToken as string;
});

await test('vcn_issue_virtual_card Phase 2 — execute with token', async () => {
  assert(!!vcnToken, 'Need token from Phase 1');
  const raw = await client.callTool('vcn_issue_virtual_card', {
    confirmationToken: vcnToken,
    clientId:  'B2BWS_1_1_9999',
    buyerId:   '9999',
    proxyPoolId: 'Proxy12345',
    startDate: '06/01/2026',
    endDate:   '06/30/2026',
    rules: [{ ruleCode: 'SPV', overrides: [
      { sequence: '1', overrideCode: 'spendLimitAmount',   overrideValue: '48500' },
      { sequence: '2', overrideCode: 'maxAuth',            overrideValue: '1'     },
      { sequence: '3', overrideCode: 'amountCurrencyCode', overrideValue: '840'   },
      { sequence: '4', overrideCode: 'rangeType',          overrideValue: '4'     },
    ]}],
    memo: 'Medical procurement Q2 2026',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assert(result.responseCode === '00', `Expected responseCode "00", got "${result.responseCode}"`);
  assert(result.requiresConfirmation === false, 'Expected requiresConfirmation: false');
});

let bipToken = '';
await test('bip_initiate_payment Phase 1 — preview + token', async () => {
  const raw = await client.callTool('bip_initiate_payment', {
    clientId:      'B2BWS_1_1_9999',
    buyerId:       '9999',
    supplierId:    'SUPP-001',
    paymentAmount: 12000,
    currencyCode:  '840',
    invoiceNumber: 'INV-2026-007',
    memo:          'HealthTech payment',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assert(result.requiresConfirmation === true, 'Expected requiresConfirmation: true');
  assert(typeof result.confirmationToken === 'string', 'Expected confirmationToken string');
  bipToken = result.confirmationToken as string;
});

await test('bip_initiate_payment Phase 2 — execute with token', async () => {
  assert(!!bipToken, 'Need token from Phase 1');
  const raw = await client.callTool('bip_initiate_payment', {
    confirmationToken: bipToken,
    clientId:      'B2BWS_1_1_9999',
    buyerId:       '9999',
    supplierId:    'SUPP-001',
    paymentAmount: 12000,
    currencyCode:  '840',
    invoiceNumber: 'INV-2026-007',
    memo:          'HealthTech payment',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assertHasKey(result, 'virtualCard');
  assert(result.requiresConfirmation === false, 'Expected requiresConfirmation: false');
});

let sipToken = '';
let sipReqId = '';
await test('sip_approve_payment Phase 1 — preview + token', async () => {
  // First submit a requisition to have a real ID
  const sipRaw = await client.callTool('sip_submit_request', {
    clientId: 'B2BWS_1_1_9999', supplierId: 'SUPP-001', buyerId: '9999',
    requestedAmount: 5000, invoiceNumber: 'INV-APPROVE-TEST',
    startDate: '2026-04-01', endDate: '2026-04-30',
  });
  const sipResult = parseResult(sipRaw) as Record<string, unknown>;
  sipReqId = sipResult.requisitionId as string;

  const raw = await client.callTool('sip_approve_payment', {
    clientId:       'B2BWS_1_1_9999',
    buyerId:        '9999',
    requisitionId:  sipReqId,
    approvedAmount: 5000,
    currencyCode:   '840',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assert(result.requiresConfirmation === true, 'Expected requiresConfirmation: true');
  assert(typeof result.confirmationToken === 'string', 'Expected confirmationToken string');
  sipToken = result.confirmationToken as string;
});

await test('sip_approve_payment Phase 2 — execute with token', async () => {
  assert(!!sipToken,  'Need token from Phase 1');
  assert(!!sipReqId, 'Need requisitionId from sip_submit_request');
  const raw = await client.callTool('sip_approve_payment', {
    confirmationToken: sipToken,
    clientId:          'B2BWS_1_1_9999',
    buyerId:           '9999',
    requisitionId:     sipReqId,
    approvedAmount:    5000,
    currencyCode:      '840',
  });
  const result = parseResult(raw) as Record<string, unknown>;
  assert(result.status === 'approved', `Expected status "approved", got "${result.status}"`);
  assert(result.requiresConfirmation === false, 'Expected requiresConfirmation: false');
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPIRED TOKEN
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n─── Expired token test ──────────────────────────────────────');

await test('vcn_issue_virtual_card with expired token — isError: true', async () => {
  // Craft a token that appears valid but has an old timestamp
  const oldTimestamp = Date.now() - 310_000; // 310 seconds ago (> 5 min)
  const expiredToken = `vcn_issue_virtual_card:abc123:${oldTimestamp}`;
  const raw = await client.callTool('vcn_issue_virtual_card', {
    confirmationToken: expiredToken,
    clientId:  'B2BWS_1_1_9999',
    buyerId:   '9999',
    proxyPoolId: 'Proxy12345',
    startDate: '06/01/2026',
    endDate:   '06/30/2026',
    rules: [],
  });
  const r = raw as { isError?: boolean };
  assert(r.isError === true, 'Expected isError: true for expired token');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

client.close();

const total = passed + failed;
console.log(`\n${'─'.repeat(60)}`);
console.log(`  Passed: ${passed}/${total}  Failed: ${failed}`);

if (failed > 0) process.exit(1);
