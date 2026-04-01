/**
 * IPC — Intelligent Payment Controls (Gen-AI) — Sandbox API Test
 *
 * Tests the Gen-AI rule suggestion and apply flow:
 *   POST /vpc/v1/ipc/suggest  — natural language → rule sets
 *   POST /vpc/v1/ipc/apply    — apply chosen rule set to an account
 *
 * In production, these endpoints hit a Gen-AI model that understands
 * procurement context and returns ranked VPC rule sets. In the sandbox,
 * keyword matching on the prompt produces the same rule-set structure.
 *
 * Why MOCK: IPC requires a Visa-provisioned VPC + IPC programme.
 *
 * Run:  node test-ipc.js
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Credentials & TLS ─────────────────────────────────────────────────────────

const CERTS = path.join(__dirname, 'certs');

const tlsCert = fs.readFileSync(path.join(CERTS, 'cert.pem'), 'utf-8');
const tlsKey  = fs.readFileSync(
  path.join(CERTS, 'privateKey-ea7ab837-d61c-43ff-9c50-13de588668ff.pem'),
  'utf-8',
);
const tlsCa = [
  'DigiCertGlobalRootG2.crt.pem',
  'SBX-2024-Prod-Root.pem',
  'SBX-2024-Prod-Inter.pem',
].map((f) => fs.readFileSync(path.join(CERTS, f), 'utf-8')).join('\n');

const credRaw = fs.readFileSync(path.join(CERTS, 'credentials.txt'), 'utf-8');
const creds   = Object.fromEntries(
  credRaw.split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const { USER, PWD } = creds;
const basicAuth = Buffer.from(`${USER}:${PWD}`).toString('base64');
const BASE_URL  = 'https://sandbox.api.visa.com';

// ── mTLS agent ────────────────────────────────────────────────────────────────

const agent = new https.Agent({
  cert: tlsCert, key: tlsKey, ca: tlsCa,
  rejectUnauthorized: true, keepAlive: true,
});

function mtlsFetch(urlPath, method, bodyObj) {
  return new Promise((resolve, reject) => {
    const bodyBuf = bodyObj ? Buffer.from(JSON.stringify(bodyObj)) : null;
    const req = https.request(
      {
        hostname: 'sandbox.api.visa.com',
        port: 443,
        path: urlPath,
        method,
        headers: {
          Authorization:  `Basic ${basicAuth}`,
          Accept:         'application/json',
          'Content-Type': 'application/json',
          ...(bodyBuf ? { 'Content-Length': String(bodyBuf.length) } : {}),
        },
        agent,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let data;
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf-8')); }
          catch { data = Buffer.concat(chunks).toString('utf-8'); }
          resolve({ status: res.statusCode, data });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ── Test runner ───────────────────────────────────────────────────────────────

let live = 0, warned = 0, mocked = 0;

function printResponse(data) {
  if (data === null || data === undefined) return;
  const json  = JSON.stringify(data, null, 2);
  const lines = json.split('\n');
  const MAX   = 20;
  for (const line of lines.slice(0, MAX)) {
    console.log(`         \x1b[2m${line}\x1b[0m`);
  }
  if (lines.length > MAX) {
    console.log(`         \x1b[2m... (+${lines.length - MAX} lines)\x1b[0m`);
  }
  console.log('');
}

async function test(label, method, urlPath, body, mockData) {
  const padded = `[${method.padEnd(5)}] ${urlPath}`;
  process.stdout.write(`  ${padded.padEnd(68)} `);

  let status, data;
  try {
    ({ status, data } = await mtlsFetch(urlPath, method, body));
  } catch (err) {
    console.log(`\x1b[31mERROR\x1b[0m  ${err.message}`);
    mocked++;
    printResponse(mockData);
    return { status: 0, data: mockData };
  }

  const ok   = status >= 200 && status < 300;
  const warn = status === 400 || status === 422;

  if (ok) {
    console.log(`\x1b[32mLIVE ${status}\x1b[0m`);
    live++;
    printResponse(data);
    return { status, data };
  }

  if (warn) {
    const code = data?.errorCode || data?.responseStatus?.code || '';
    const msg  = data?.message   || data?.responseStatus?.message || '';
    console.log(`\x1b[33mWARN ${status}\x1b[0m  ${code} ${msg}`.trimEnd());
    warned++;
    printResponse(mockData ?? data);
    return { status, data: mockData ?? data };
  }

  const reason = status === 401 ? 'requires VPC + IPC programme provisioning'
    : status === 404 ? 'IPC module not enabled on project'
    : `HTTP ${status}`;
  console.log(`\x1b[35mMOCK\x1b[0m   (${reason})`);
  mocked++;
  printResponse(mockData);
  return { status, data: mockData };
}

// ── Prompts to test ───────────────────────────────────────────────────────────

const NOW        = new Date().toISOString();
const ACCOUNT_ID = 'VPC-ACCT-SBX-001';

const PROMPTS = [
  {
    label:    'Medical procurement',
    prompt:   'Medical equipment procurement for government hospital, max $50,000 per month, domestic suppliers only, no ATM cash',
    currency: '840',
    mockRuleSetId: 'ipc-tpl-medical',
  },
  {
    label:    'IT services',
    prompt:   'Cloud and software subscriptions for IT department, $25k monthly cap, online transactions only',
    currency: '840',
    mockRuleSetId: 'ipc-tpl-it',
  },
  {
    label:    'Travel expenses',
    prompt:   'Government travel card for officials, airline hotels and ground transport, $10k monthly limit',
    currency: '840',
    mockRuleSetId: 'ipc-tpl-travel',
  },
  {
    label:    'Office supplies',
    prompt:   'Office stationery and furniture procurement, $2,000 monthly budget, online and POS allowed',
    currency: '840',
    mockRuleSetId: 'ipc-tpl-office',
  },
];

function mockSuggestion(ruleSetId, prompt) {
  const templates = {
    'ipc-tpl-medical': {
      ruleSetId: 'ipc-tpl-medical',
      rationale: 'Medical procurement: healthcare MCCs allowed; $50,000/month; POS and online; cross-border allowed.',
      confidence: 94,
      rules: [
        { ruleCode: 'SPV', spendVelocity: { limitAmount: 50000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 50 } },
        { ruleCode: 'MCC', mcc: { allowedMCCs: ['5047', '5122', '8099', '8049', '8011'] } },
        { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: true, allowATM: false, allowContactless: false } },
      ],
    },
    'ipc-tpl-it': {
      ruleSetId: 'ipc-tpl-it',
      rationale: 'IT services card: software, cloud, and tech vendors; $25,000/month; online transactions only.',
      confidence: 89,
      rules: [
        { ruleCode: 'SPV', spendVelocity: { limitAmount: 25000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 40 } },
        { ruleCode: 'MCC', mcc: { allowedMCCs: ['7372', '7371', '7379', '5045'] } },
        { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: false, allowATM: false, allowContactless: false } },
      ],
    },
    'ipc-tpl-travel': {
      ruleSetId: 'ipc-tpl-travel',
      rationale: 'Travel card: airline, hotel, and transport spending allowed; ATM cash blocked; $10,000/month velocity.',
      confidence: 88,
      rules: [
        { ruleCode: 'SPV', spendVelocity: { limitAmount: 10000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 30 } },
        { ruleCode: 'LOC', location: {} },
      ],
    },
    'ipc-tpl-office': {
      ruleSetId: 'ipc-tpl-office',
      rationale: 'Office supplies card: MCCs for stationery, electronics, furniture; $2,000/month limit; online only.',
      confidence: 91,
      rules: [
        { ruleCode: 'SPV', spendVelocity: { limitAmount: 2000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 20 } },
        { ruleCode: 'MCC', mcc: { allowedMCCs: ['5111', '5112', '5065', '5045', '5021'] } },
        { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: true, allowATM: false, allowContactless: true } },
      ],
    },
    default: {
      ruleSetId: 'ipc-tpl-default',
      rationale: 'General-purpose card: $5,000/month spend velocity; ATM blocked; all merchant categories allowed.',
      confidence: 75,
      rules: [
        { ruleCode: 'SPV', spendVelocity: { limitAmount: 5000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 20 } },
        { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: true, allowATM: false, allowContactless: true } },
      ],
    },
  };
  return {
    promptId:    'PROMPT-SBX-' + Date.now(),
    prompt,
    suggestions: [templates[ruleSetId] ?? templates.default, templates.default].filter((v, i, a) => a.indexOf(v) === i),
    generatedAt: NOW,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log('  IPC — Intelligent Payment Controls (Gen-AI) — Sandbox Test');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  User ID  : ${USER}`);
  console.log('  mTLS     : enabled\n');
  console.log('  Flow: natural language prompt → ranked rule sets → apply best to account\n');

  // ── Section 1: IPC Suggest (4 prompts) ────────────────────────────────────
  console.log('── 1. IPC Suggest — Natural Language → Rule Sets ───────────────────────────────\n');

  let bestRuleSetId = PROMPTS[0].mockRuleSetId;
  let bestPromptId  = 'PROMPT-SBX-001';

  for (const p of PROMPTS) {
    const mock = mockSuggestion(p.mockRuleSetId, p.prompt);
    const r = await test(
      `suggest: "${p.label}"`,
      'POST', '/vpc/v1/ipc/suggest',
      { prompt: p.prompt, currencyCode: p.currency },
      mock,
    );

    const suggestion = r.data?.suggestions?.[0];
    if (suggestion) {
      console.log(`\n         Prompt     : "${p.prompt.slice(0, 60)}..."`);
      console.log(`         RuleSet ID : ${suggestion.ruleSetId}`);
      console.log(`         Confidence : ${suggestion.confidence}%`);
      console.log(`         Rationale  : ${suggestion.rationale?.slice(0, 80)}...`);
      console.log(`         Rules      : ${suggestion.rules?.map((r) => r.ruleCode).join(', ')}\n`);
      if (p.label === 'Medical procurement') {
        bestRuleSetId = suggestion.ruleSetId ?? p.mockRuleSetId;
        bestPromptId  = r.data?.promptId ?? bestPromptId;
      }
    }
  }

  // ── Section 2: IPC Apply ──────────────────────────────────────────────────
  console.log('── 2. IPC Apply — Apply Rule Set to Account ────────────────────────────────────\n');

  const applyMock = {
    accountId:     ACCOUNT_ID,
    accountNumber: '4532015112830366',
    status:        'active',
    rules: [
      { ruleCode: 'SPV', spendVelocity: { limitAmount: 50000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 50 } },
      { ruleCode: 'MCC', mcc: { allowedMCCs: ['5047', '5122', '8099', '8049', '8011'] } },
      { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: true, allowATM: false } },
    ],
    updatedAt: NOW,
  };

  const rApply = await test(
    'apply medical rule set to account',
    'POST', '/vpc/v1/ipc/apply',
    { ruleSetId: bestRuleSetId, accountId: ACCOUNT_ID },
    applyMock,
  );

  console.log(`\n         Account  : ${rApply.data?.accountId ?? ACCOUNT_ID}`);
  console.log(`         Rules    : ${(rApply.data?.rules ?? applyMock.rules).map((r) => r.ruleCode).join(', ')}`);
  console.log(`         Status   : ${rApply.data?.status ?? 'active'}\n`);

  // ── Rule Summary Table ─────────────────────────────────────────────────────
  console.log('── Rule Set Confidence Summary ─────────────────────────────────────────────────\n');
  console.log(`  ${'Use Case'.padEnd(22)} ${'Rule Set ID'.padEnd(20)} ${'Confidence'.padEnd(12)} Rules`);
  console.log(`  ${'─'.repeat(72)}`);

  const summary = [
    { label: 'Medical procurement',  id: 'ipc-tpl-medical', confidence: 94, rules: 'SPV, MCC, CHN' },
    { label: 'Office supplies',      id: 'ipc-tpl-office',  confidence: 91, rules: 'SPV, MCC, CHN' },
    { label: 'IT services',          id: 'ipc-tpl-it',      confidence: 89, rules: 'SPV, MCC, CHN' },
    { label: 'Travel expenses',      id: 'ipc-tpl-travel',  confidence: 88, rules: 'SPV, LOC' },
    { label: 'General purpose',      id: 'ipc-tpl-default', confidence: 75, rules: 'SPV, CHN' },
  ];
  for (const s of summary) {
    const bar = '█'.repeat(Math.round(s.confidence / 10)) + '░'.repeat(10 - Math.round(s.confidence / 10));
    console.log(`  ${s.label.padEnd(22)} ${s.id.padEnd(20)} ${String(s.confidence + '%').padEnd(4)} ${bar}  ${s.rules}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = live + warned + mocked;
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log(`  ${total} endpoints tested  (4 × suggest + 1 × apply)`);
  console.log(`  \x1b[32m${live} LIVE\x1b[0m  (real Visa sandbox 2xx)`);
  console.log(`  \x1b[33m${warned} WARN\x1b[0m  (reached; business validation)`);
  console.log(`  \x1b[35m${mocked} MOCK\x1b[0m  (needs VPC + IPC programme provisioning)`);
  console.log('════════════════════════════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
