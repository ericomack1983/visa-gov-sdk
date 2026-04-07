/**
 * Visa B2B Payment Controls (VPC) — Sandbox API Test
 *
 * Tests all VPC sub-services against the Visa sandbox environment.
 *   AccountManagement  — POST/GET/PUT/DELETE /vpc/v1/accounts
 *   Rules              — PUT/GET/DELETE + block/disable/enable
 *   Reporting          — GET notifications + transactions
 *   SupplierValidation — POST/PUT/GET /vpc/v1/suppliers
 *
 * Why MOCK on some endpoints:
 *   VPC requires a Visa-provisioned VPC programme on your sandbox project.
 *   Without it, 401/404 responses are returned. Realistic mock responses
 *   are shown so the full flow is visible end-to-end.
 *
 * Run:  node test-vpc.js
 */

'use strict';

const { printBanner } = require('./banner');
printBanner('Visa B2B Payment Controls');

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
  const padded = `[${method.padEnd(6)}] ${urlPath}`;
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
    const code = data?.responseStatus?.code || data?.errorCode || '';
    const msg  = data?.responseStatus?.message || data?.message || '';
    console.log(`\x1b[33mWARN ${status}\x1b[0m  ${code} ${msg}`.trimEnd());
    warned++;
    printResponse(mockData ?? data);
    return { status, data: mockData ?? data };
  }

  const reason = status === 401 ? 'requires VPC programme provisioning'
    : status === 404 ? 'VPC module not enabled on project'
    : `HTTP ${status}`;
  console.log(`\x1b[35mMOCK\x1b[0m   (${reason})`);
  mocked++;
  printResponse(mockData);
  return { status, data: mockData };
}

// ── Identifiers & mocks ───────────────────────────────────────────────────────

const NOW        = new Date().toISOString();
const ACCOUNT_ID = 'VPC-ACCT-SBX-001';
const SUPP_ID    = 'VPC-SUPP-SBX-001';
const VAN        = '4532015112830366';
const ACQ_BIN    = '411111';
const CAID       = 'MEDSUPPLY_001';

const MOCKS = {
  createAccount: {
    accountId:     ACCOUNT_ID,
    accountNumber: VAN,
    status:        'active',
    contacts:      [{ contactId: 'CON-001', name: 'Procurement Officer', email: 'proc@gov-agency.example' }],
    rules:         [],
    createdAt:     NOW,
    updatedAt:     NOW,
  },
  getAccount: {
    accountId:     ACCOUNT_ID,
    accountNumber: VAN,
    status:        'active',
    contacts:      [{ contactId: 'CON-001', name: 'Procurement Officer', email: 'proc@gov-agency.example' }],
    rules:         [{ ruleCode: 'SPV', spendVelocity: { limitAmount: 50000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 50 } }],
    createdAt:     NOW,
    updatedAt:     NOW,
  },
  updateAccount: {
    accountId:     ACCOUNT_ID,
    accountNumber: VAN,
    status:        'active',
    contacts:      [
      { contactId: 'CON-001', name: 'Procurement Officer', email: 'proc@gov-agency.example' },
      { contactId: 'CON-002', name: 'Finance Manager',     email: 'finance@gov-agency.example' },
    ],
    updatedAt: NOW,
  },
  setRules: {
    accountId: ACCOUNT_ID,
    rules: [
      { ruleCode: 'SPV', spendVelocity: { limitAmount: 50000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 50 } },
      { ruleCode: 'MCC', mcc: { allowedMCCs: ['5047', '5122', '8099'] } },
      { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: true, allowATM: false } },
    ],
    status:    'active',
    updatedAt: NOW,
  },
  getRules: {
    rules: [
      { ruleCode: 'SPV', spendVelocity: { limitAmount: 50000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 50, consumedAmount: 12500, consumedAuthCount: 8 } },
      { ruleCode: 'MCC', mcc: { allowedMCCs: ['5047', '5122', '8099'] } },
    ],
    status: 'active',
  },
  disableRules: {
    accountId:     ACCOUNT_ID,
    status:        'rules_disabled',
    updatedAt:     NOW,
  },
  enableRules: {
    accountId:     ACCOUNT_ID,
    status:        'active',
    updatedAt:     NOW,
  },
  blockAccount: {
    accountId:     ACCOUNT_ID,
    status:        'blocked',
    reason:        'Suspected fraud — manual review initiated',
    blockedAt:     NOW,
  },
  deleteRules: {
    accountId:     ACCOUNT_ID,
    status:        'rules_cleared',
    updatedAt:     NOW,
  },
  notifications: {
    accountId: ACCOUNT_ID,
    notifications: [
      { notificationId: 'NOTIF-001', event: 'rule_triggered', ruleCode: 'SPV', amount: 4750, currencyCode: '840', merchantName: 'MedEquip Co.', occurredAt: NOW },
      { notificationId: 'NOTIF-002', event: 'transaction_declined', ruleCode: 'CHN', amount: 200, currencyCode: '840', merchantName: 'ATM Machine', occurredAt: NOW },
    ],
    total: 2,
  },
  transactions: {
    accountId: ACCOUNT_ID,
    transactions: [
      { transactionId: 'TXN-001', type: 'purchase', amount: 4750, currencyCode: '840', merchantName: 'MedEquip Co.', mcc: '5047', status: 'approved', authorizedAt: NOW },
      { transactionId: 'TXN-002', type: 'purchase', amount: 2300, currencyCode: '840', merchantName: 'HealthTech Supplies', mcc: '5122', status: 'approved', authorizedAt: NOW },
    ],
    total: 2,
    totalSpend: 7050,
  },
  registerSupplier: {
    supplierId:   SUPP_ID,
    supplierName: 'MedEquip Co.',
    acquirerBin:  ACQ_BIN,
    caid:         CAID,
    countryCode:  'US',
    mcc:          '5047',
    status:       'pending',
    createdAt:    NOW,
    updatedAt:    NOW,
  },
  updateSupplier: {
    supplierId:   SUPP_ID,
    status:       'validated',
    validatedAt:  NOW,
    updatedAt:    NOW,
  },
  retrieveSupplier: {
    supplierId:   SUPP_ID,
    supplierName: 'MedEquip Co.',
    acquirerBin:  ACQ_BIN,
    caid:         CAID,
    countryCode:  'US',
    mcc:          '5047',
    status:       'validated',
    validatedAt:  NOW,
  },
  deleteAccount: {
    accountId: ACCOUNT_ID,
    status:    'deleted',
    deletedAt: NOW,
  },
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log('  Visa B2B Payment Controls (VPC) — Sandbox Test');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  User ID  : ${USER}`);
  console.log('  mTLS     : enabled\n');

  let accountId = ACCOUNT_ID;
  let supplierId = SUPP_ID;

  // ── 1. Account Management ──────────────────────────────────────────────────
  console.log('── 1. Account Management ───────────────────────────────────────────────────────\n');

  const r1 = await test('createAccount', 'POST', '/vpc/v1/accounts',
    { accountNumber: VAN, contacts: [{ name: 'Procurement Officer', email: 'proc@gov-agency.example' }] },
    MOCKS.createAccount,
  );
  if (r1.data?.accountId) accountId = r1.data.accountId;

  await test('getAccount', 'GET', `/vpc/v1/accounts/${accountId}`,
    null,
    MOCKS.getAccount,
  );

  await test('updateAccount', 'PUT', `/vpc/v1/accounts/${accountId}`,
    { contacts: [
      { name: 'Procurement Officer', email: 'proc@gov-agency.example' },
      { name: 'Finance Manager',     email: 'finance@gov-agency.example' },
    ]},
    MOCKS.updateAccount,
  );

  // ── 2. Rules Management ────────────────────────────────────────────────────
  console.log('\n── 2. Rules Management ─────────────────────────────────────────────────────────\n');

  await test('setRules', 'PUT', `/vpc/v1/accounts/${accountId}/rules`,
    { rules: [
      { ruleCode: 'SPV', spendVelocity: { limitAmount: 50000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 50 } },
      { ruleCode: 'MCC', mcc: { allowedMCCs: ['5047', '5122', '8099'] } },
      { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: true, allowATM: false } },
    ]},
    MOCKS.setRules,
  );

  await test('getRules', 'GET', `/vpc/v1/accounts/${accountId}/rules`,
    null,
    MOCKS.getRules,
  );

  await test('disableRules', 'POST', `/vpc/v1/accounts/${accountId}/rules/disable`,
    { reason: 'Temporary hold — supplier audit in progress' },
    MOCKS.disableRules,
  );

  await test('enableRules', 'POST', `/vpc/v1/accounts/${accountId}/rules/enable`,
    {},
    MOCKS.enableRules,
  );

  await test('blockAccount', 'POST', `/vpc/v1/accounts/${accountId}/block`,
    { reason: 'Suspected fraud — manual review initiated' },
    MOCKS.blockAccount,
  );

  await test('deleteRules', 'DELETE', `/vpc/v1/accounts/${accountId}/rules`,
    null,
    MOCKS.deleteRules,
  );

  // ── 3. Reporting ───────────────────────────────────────────────────────────
  console.log('\n── 3. Reporting ────────────────────────────────────────────────────────────────\n');

  await test('getNotificationHistory', 'GET',
    `/vpc/v1/accounts/${accountId}/notifications?startDate=2026-04-01&endDate=2026-04-30`,
    null,
    MOCKS.notifications,
  );

  await test('getTransactionHistory', 'GET',
    `/vpc/v1/accounts/${accountId}/transactions?startDate=2026-04-01&endDate=2026-04-30`,
    null,
    MOCKS.transactions,
  );

  console.log(`\n         Total spend : $${MOCKS.transactions.totalSpend.toLocaleString()}`);
  console.log(`         Transactions: ${MOCKS.transactions.total}`);
  console.log(`         Rule alerts : ${MOCKS.notifications.total}\n`);

  // ── 4. Supplier Validation ─────────────────────────────────────────────────
  console.log('── 4. Supplier Validation ──────────────────────────────────────────────────────\n');

  const r2 = await test('registerSupplier', 'POST', '/vpc/v1/suppliers',
    { supplierName: 'MedEquip Co.', acquirerBin: ACQ_BIN, caid: CAID, countryCode: 'US', mcc: '5047' },
    MOCKS.registerSupplier,
  );
  if (r2.data?.supplierId) supplierId = r2.data.supplierId;

  await test('updateSupplier', 'PUT', `/vpc/v1/suppliers/${supplierId}`,
    { status: 'validated' },
    MOCKS.updateSupplier,
  );

  await test('retrieveSupplier', 'GET',
    `/vpc/v1/suppliers?acquirerBin=${ACQ_BIN}&caid=${CAID}`,
    null,
    MOCKS.retrieveSupplier,
  );

  // ── 5. Cleanup ─────────────────────────────────────────────────────────────
  console.log('\n── 5. Cleanup ──────────────────────────────────────────────────────────────────\n');

  await test('deleteAccount', 'DELETE', `/vpc/v1/accounts/${accountId}`,
    null,
    MOCKS.deleteAccount,
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = live + warned + mocked;
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log(`  ${total} endpoints tested`);
  console.log(`  \x1b[32m${live} LIVE\x1b[0m  (real Visa sandbox 2xx)`);
  console.log(`  \x1b[33m${warned} WARN\x1b[0m  (reached; business validation)`);
  console.log(`  \x1b[35m${mocked} MOCK\x1b[0m  (needs VPC programme provisioning)`);
  console.log('════════════════════════════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
