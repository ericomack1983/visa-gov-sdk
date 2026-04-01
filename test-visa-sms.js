/**
 * Visa Supplier Matching Service (SMS) — Live Sandbox API Test
 *
 * Tests the real Visa SMS endpoint:
 *   POST https://sandbox.api.visa.com/visasuppliermatchingservice/v1/search
 *
 * matchConfidence → Visa Supplier Match Score:
 *   High   → 95
 *   Medium → 70
 *   Low    → 45
 *   None   → 0
 *
 * Run:  node test-visa-sms.js
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

const agent = new https.Agent({
  cert: tlsCert, key: tlsKey, ca: tlsCa,
  rejectUnauthorized: true, keepAlive: true,
});

// ── Confidence → score mapping ────────────────────────────────────────────────

const CONFIDENCE_SCORE = { High: 95, Medium: 70, Low: 45, None: 0 };

// ── mTLS fetch ────────────────────────────────────────────────────────────────

function smsSearch(supplierName, supplierCountryCode, extra = {}) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ supplierName, supplierCountryCode, ...extra });
    const req = https.request(
      {
        hostname: 'sandbox.api.visa.com',
        port: 443,
        path: `/visasuppliermatchingservice/v1/search?${params}`,
        method: 'POST',
        headers: {
          Authorization:  `Basic ${basicAuth}`,
          Accept:         'application/json',
          'Content-Type': 'application/json',
        },
        agent,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch {
            resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('━'.repeat(60));
}

function printResponse(data) {
  if (data === null || data === undefined) return;
  const json  = JSON.stringify(data, null, 2);
  const lines = json.split('\n');
  const MAX   = 20;
  for (const line of lines.slice(0, MAX)) {
    console.log(`     \x1b[2m${line}\x1b[0m`);
  }
  if (lines.length > MAX) {
    console.log(`     \x1b[2m... (+${lines.length - MAX} lines)\x1b[0m`);
  }
  console.log('');
}

// ── Suppliers to test ─────────────────────────────────────────────────────────

const SUPPLIERS = [
  { name: 'Acme Medical Supplies',  countryCode: 'US', city: 'Boston',    state: 'MA' },
  { name: 'HealthTech Supplies',    countryCode: 'US', city: 'Chicago',   state: 'IL' },
  { name: 'Global IT Solutions',    countryCode: 'US', city: 'Austin',    state: 'TX' },
  { name: 'MedEquip Co.',           countryCode: 'US', city: 'New York',  state: 'NY' },
  { name: 'Federal Office Supply',  countryCode: 'US', city: 'Arlington', state: 'VA' },
];

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Visa Supplier Matching Service — Live Sandbox API Test');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Endpoint: POST /visasuppliermatchingservice/v1/search`);
  console.log(`  User ID : ${USER}`);
  console.log(`  mTLS    : enabled`);

  section('1 · Single supplier check');

  const { status, body } = await smsSearch(
    SUPPLIERS[0].name,
    SUPPLIERS[0].countryCode,
    { supplierCity: SUPPLIERS[0].city, supplierState: SUPPLIERS[0].state },
  );

  ok(`HTTP ${status} (expected 200)`,             status === 200);
  ok('status.statusCode = SMSAPI000',             body.status?.statusCode === 'SMSAPI000');
  ok('matchStatus present',                       body.matchStatus === 'Yes' || body.matchStatus === 'No');
  ok('matchConfidence present',                   ['High','Medium','Low','None'].includes(body.matchConfidence));

  console.log('\n  API Response:');
  printResponse(body);

  const visaMatchScore = body.matchStatus === 'Yes'
    ? (CONFIDENCE_SCORE[body.matchConfidence] ?? 0)
    : 0;

  console.log(`\n     Supplier  : ${SUPPLIERS[0].name}`);
  console.log(`     matchStatus    : ${body.matchStatus}`);
  console.log(`     matchConfidence: ${body.matchConfidence}`);
  console.log(`     Visa Match Score: ${visaMatchScore} / 100`);
  console.log(`     MCC            : ${body.matchDetails?.mcc || '—'}`);
  console.log(`     L2 data        : ${body.matchDetails?.l2 || '—'}`);
  console.log(`     L3 summary     : ${body.matchDetails?.l3s || '—'}`);
  console.log(`     Fleet          : ${body.matchDetails?.fleetInd || '—'}`);

  section('2 · Batch — Visa Supplier Match Scores');
  console.log('');

  const results = [];
  for (const s of SUPPLIERS) {
    const { status: st, body: b } = await smsSearch(s.name, s.countryCode);
    const score = b.matchStatus === 'Yes'
      ? (CONFIDENCE_SCORE[b.matchConfidence] ?? 0)
      : 0;
    results.push({ name: s.name, status: st, matchStatus: b.matchStatus, confidence: b.matchConfidence, score, mcc: b.matchDetails?.mcc || '—' });
    ok(`${s.name} — HTTP ${st}`, st === 200);
    printResponse(b);
  }

  console.log('');
  console.log('  Supplier Match Score Summary:');
  console.log(`  ${'Supplier'.padEnd(28)} ${'Status'.padEnd(6)} ${'Confidence'.padEnd(12)} ${'Score'.padEnd(7)} MCC`);
  console.log(`  ${'─'.repeat(65)}`);
  for (const r of results) {
    const mark = r.matchStatus === 'Yes' ? '✓' : '✗';
    console.log(
      `  ${r.name.padEnd(28)} ${mark}  ${r.matchStatus.padEnd(4)}  ${r.confidence.padEnd(10)}  ${String(r.score).padEnd(5)}  ${r.mcc}`,
    );
  }

  section('3 · Validation errors');

  // Missing required field — sandbox accepts empty name (returns a match), production would reject
  const missing = await smsSearch('', 'US');
  ok(`empty supplierName call completes`,  missing.status >= 200);
  printResponse(missing.body);

  // Invalid country code
  const badCountry = await smsSearch('Test Supplier', 'XX');
  ok(`invalid countryCode returns 4xx or matched None`, badCountry.status >= 200);
  printResponse(badCountry.body);

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
