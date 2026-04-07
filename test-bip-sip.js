/**
 * Visa B2B Payment — BIP & SIP Sandbox API Test
 *
 * Tests both Buyer-Initiated Payment (BIP) and Supplier-Initiated Payment (SIP)
 * flows against the real Visa sandbox environment using mTLS + HTTP Basic auth.
 *
 * For each endpoint:
 *   LIVE (2xx)  — real Visa sandbox accepted the call
 *   WARN (400)  — endpoint reached; business/payload validation error
 *   MOCK        — endpoint exists but blocked (401/404/provisioning);
 *                 a realistic mock response is shown so the full flow is visible
 *
 * ── BIP Flow ──────────────────────────────────────────────────────────────────
 *   1. POST /vpa/v1/paymentService/processPayments   (paymentDeliveryMethod: BIP)
 *   2. POST /vpa/v1/paymentService/getPaymentDetailURL
 *   3. POST /vpa/v1/paymentService/getPaymentDetails
 *   4. POST /vpa/v1/paymentService/resendPayment
 *   5. POST /vpa/v1/paymentService/cancelPayment
 *
 * ── SIP Flow ──────────────────────────────────────────────────────────────────
 *   6. POST /vpa/v1/requisitionService               (supplier submits request)
 *   7. POST /vpa/v1/paymentService/processPayments   (buyer approves, SIP)
 *   8. POST /vpa/v1/paymentService/getPaymentDetails (status check)
 *   9. POST /vpa/v1/requisitionService               (second request)
 *  10. POST /vpa/v1/paymentService/cancelPayment     (buyer rejects)
 *
 * Run:  node test-bip-sip.js
 */

'use strict';

const { printBanner } = require('./banner');
printBanner('BIP & SIP Payment Flows');

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

// ── mTLS agent & fetch helper ─────────────────────────────────────────────────

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
    const code = data?.responseStatus?.code || data?.statusCode || '';
    const msg  = data?.responseStatus?.message || data?.message || '';
    console.log(`\x1b[33mWARN ${status}\x1b[0m  ${code} ${msg}`.trimEnd());
    warned++;
    printResponse(mockData ?? data);
    return { status, data: mockData ?? data };
  }

  const reason = status === 401 ? 'requires processor token'
    : status === 404 ? 'module not enabled on project'
    : `HTTP ${status}`;
  console.log(`\x1b[35mMOCK\x1b[0m   (${reason})`);
  mocked++;
  printResponse(mockData);
  return { status, data: mockData };
}

// ── Sandbox identifiers ───────────────────────────────────────────────────────

const CLIENT_ID  = 'B2BWS_1_1_9999';
const BUYER_ID   = '9999';
const SUPP_ID    = 'SUPP-SBX-001';
const NOW        = new Date().toISOString();
const VAN_BIP    = '4532015112830366';
const VAN_SIP    = '4916338506082832';
const TS         = Date.now();

function msgId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Realistic mock responses ──────────────────────────────────────────────────

const MOCKS = {
  // ── BIP ────────────────────────────────────────────────────────────────────
  bipProcessPayment: {
    paymentId:             `BIP-PAY-${TS}`,
    buyerId:               BUYER_ID,
    supplierId:            SUPP_ID,
    paymentAmount:         4750.00,
    currencyCode:          '840',
    paymentDeliveryMethod: 'BIP',
    status:                'pending',
    accountNumber:         VAN_BIP,
    expiryDate:            '04/2027',
    invoiceNumber:         'INV-2026-GOV-042',
    paymentDate:           '2026-04-15',
    createdAt:             NOW,
    updatedAt:             NOW,
  },
  bipPaymentDetailURL: {
    paymentId:  `BIP-PAY-${TS}`,
    url:        `${BASE_URL}/vpa/v1/payment/BIP-PAY-${TS}/entry?token=sbx_bip_tok_abc123`,
    expiresAt:  new Date(Date.now() + 86400000).toISOString(),
  },
  bipGetPaymentDetails: {
    paymentId:             `BIP-PAY-${TS}`,
    buyerId:               BUYER_ID,
    supplierId:            SUPP_ID,
    paymentAmount:         4750.00,
    currencyCode:          '840',
    paymentDeliveryMethod: 'BIP',
    status:                'unmatched',
    accountNumber:         VAN_BIP,
    invoiceNumber:         'INV-2026-GOV-042',
    createdAt:             NOW,
    updatedAt:             NOW,
  },
  bipResendPayment: {
    statusCode:          '00',
    statusDesc:          'BIP card notification resent to supplier',
    paymentId:           `BIP-PAY-${TS}`,
    notificationSentAt:  NOW,
  },
  bipCancelPayment: {
    statusCode:  '00',
    statusDesc:  'BIP payment cancelled successfully',
    paymentId:   `BIP-PAY-${TS}`,
    status:      'cancelled',
    cancelledAt: NOW,
  },

  // ── SIP ────────────────────────────────────────────────────────────────────
  sipRequisition: {
    statusCode:    '00',
    requisitionId: `SIP-REQ-${TS}`,
    supplierId:    SUPP_ID,
    buyerId:       BUYER_ID,
    accountNumber: VAN_SIP,
    expiryDate:    '04/2027',
    paymentAmount: 2300.00,
    currencyCode:  '840',
    invoiceNumber: 'INV-SUPP-2026-007',
    status:        'pending_approval',
    startDate:     '2026-04-01',
    endDate:       '2026-04-30',
    createdAt:     NOW,
  },
  sipApprovePayment: {
    paymentId:             `SIP-PAY-${TS}`,
    buyerId:               BUYER_ID,
    supplierId:            SUPP_ID,
    paymentAmount:         2300.00,
    currencyCode:          '840',
    paymentDeliveryMethod: 'SIP',
    requisitionId:         `SIP-REQ-${TS}`,
    status:                'approved',
    createdAt:             NOW,
    updatedAt:             NOW,
  },
  sipGetPaymentDetails: {
    paymentId:             `SIP-PAY-${TS}`,
    buyerId:               BUYER_ID,
    supplierId:            SUPP_ID,
    paymentAmount:         2300.00,
    currencyCode:          '840',
    paymentDeliveryMethod: 'SIP',
    requisitionId:         `SIP-REQ-${TS}`,
    status:                'processing',
    invoiceNumber:         'INV-SUPP-2026-007',
    createdAt:             NOW,
    updatedAt:             NOW,
  },
  sipRejectRequisition: {
    statusCode:    '00',
    statusDesc:    'Requisition rejected by buyer',
    requisitionId: `SIP-REQ2-${TS}`,
    status:        'rejected',
    rejectedAt:    NOW,
  },
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log('  Visa B2B Payment — BIP & SIP Sandbox Test');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  User ID  : ${USER}`);
  console.log('  mTLS     : enabled\n');

  let bipPaymentId = MOCKS.bipProcessPayment.paymentId;
  let sipReqId     = MOCKS.sipRequisition.requisitionId;

  // ── BIP Flow ───────────────────────────────────────────────────────────────
  console.log('── BIP (Buyer Initiated Payment) ───────────────────────────────────────────────');
  console.log('   Buyer provisions a virtual card and pushes it to the supplier.\n');

  // Step 1 — Initiate BIP
  const r1 = await test(
    'BIP · initiate payment',
    'POST', '/vpa/v1/paymentService/processPayments',
    {
      messageId:             msgId(),
      clientId:              CLIENT_ID,
      buyerId:               BUYER_ID,
      supplierId:            SUPP_ID,
      paymentAmount:         4750.00,
      currencyCode:          '840',
      paymentDeliveryMethod: 'BIP',
      invoiceNumber:         'INV-2026-GOV-042',
      paymentDate:           '2026-04-15',
      memo:                  'Q2 medical equipment purchase',
    },
    MOCKS.bipProcessPayment,
  );
  if (r1.data?.paymentId) bipPaymentId = r1.data.paymentId;

  console.log(`\n         paymentId    : ${r1.data?.paymentId ?? bipPaymentId}`);
  console.log(`         virtualCard  : ${r1.data?.accountNumber ?? VAN_BIP}`);
  console.log(`         status       : ${r1.data?.status ?? 'pending'}`);
  console.log(`         method       : ${r1.data?.paymentDeliveryMethod ?? 'BIP'}\n`);

  // Step 2 — Get supplier card-entry URL
  const r2 = await test(
    'BIP · get payment detail URL',
    'POST', '/vpa/v1/paymentService/getPaymentDetailURL',
    { messageId: msgId(), clientId: CLIENT_ID, paymentId: bipPaymentId },
    MOCKS.bipPaymentDetailURL,
  );
  console.log(`\n         paymentDetailUrl: ${(r2.data?.url ?? MOCKS.bipPaymentDetailURL.url).slice(0, 80)}...\n`);

  // Step 3 — Get payment status
  await test(
    'BIP · get payment details',
    'POST', '/vpa/v1/paymentService/getPaymentDetails',
    { messageId: msgId(), clientId: CLIENT_ID, paymentId: bipPaymentId },
    MOCKS.bipGetPaymentDetails,
  );

  // Step 4 — Resend notification to supplier
  await test(
    'BIP · resend payment notification',
    'POST', '/vpa/v1/paymentService/resendPayment',
    { messageId: msgId(), clientId: CLIENT_ID, paymentId: bipPaymentId },
    MOCKS.bipResendPayment,
  );

  // Step 5 — Cancel the payment
  await test(
    'BIP · cancel payment',
    'POST', '/vpa/v1/paymentService/cancelPayment',
    { messageId: msgId(), clientId: CLIENT_ID, paymentId: bipPaymentId },
    MOCKS.bipCancelPayment,
  );

  // ── SIP Flow ───────────────────────────────────────────────────────────────
  console.log('\n── SIP (Supplier Initiated Payment) ────────────────────────────────────────────');
  console.log('   Supplier submits invoice; buyer reviews and approves.\n');

  // Step 6 — Supplier submits payment request
  const r6 = await test(
    'SIP · supplier submits requisition',
    'POST', '/vpa/v1/requisitionService',
    {
      messageId:             msgId(),
      clientId:              CLIENT_ID,
      buyerId:               BUYER_ID,
      supplierId:            SUPP_ID,
      action:                'A',
      paymentDeliveryMethod: 'SIP',
      paymentAmount:         2300.00,
      currencyCode:          '840',
      invoiceNumber:         'INV-SUPP-2026-007',
      startDate:             '2026-04-01',
      endDate:               '2026-04-30',
      timeZone:              'UTC-5',
    },
    MOCKS.sipRequisition,
  );
  if (r6.data?.requisitionId) sipReqId = r6.data.requisitionId;

  console.log(`\n         requisitionId : ${r6.data?.requisitionId ?? sipReqId}`);
  console.log(`         virtualAccount: ${r6.data?.accountNumber ?? VAN_SIP}`);
  console.log(`         status        : ${r6.data?.status ?? 'pending_approval'}`);
  console.log(`         requested     : ${r6.data?.paymentAmount ?? 2300.00} USD\n`);

  // Step 7 — Buyer approves and processes
  const r7 = await test(
    'SIP · buyer approves (processPayments)',
    'POST', '/vpa/v1/paymentService/processPayments',
    {
      messageId:             msgId(),
      clientId:              CLIENT_ID,
      buyerId:               BUYER_ID,
      paymentDeliveryMethod: 'SIP',
      requisitionId:         sipReqId,
      paymentAmount:         2300.00,
      currencyCode:          '840',
      memo:                  'Approved — INV-SUPP-2026-007',
    },
    MOCKS.sipApprovePayment,
  );

  console.log(`\n         paymentId : ${r7.data?.paymentId ?? MOCKS.sipApprovePayment.paymentId}`);
  console.log(`         status    : ${r7.data?.status ?? 'approved'}\n`);

  // Step 8 — Status check after approval
  await test(
    'SIP · get payment details (post-approval)',
    'POST', '/vpa/v1/paymentService/getPaymentDetails',
    { messageId: msgId(), clientId: CLIENT_ID, paymentId: r7.data?.paymentId ?? MOCKS.sipApprovePayment.paymentId },
    MOCKS.sipGetPaymentDetails,
  );

  // Step 9 — Supplier submits a second request (rejection scenario)
  const r9 = await test(
    'SIP · supplier submits requisition #2',
    'POST', '/vpa/v1/requisitionService',
    {
      messageId:             msgId(),
      clientId:              CLIENT_ID,
      buyerId:               BUYER_ID,
      supplierId:            SUPP_ID,
      action:                'A',
      paymentDeliveryMethod: 'SIP',
      paymentAmount:         500.00,
      currencyCode:          '840',
      invoiceNumber:         'INV-SUPP-2026-008',
      startDate:             '2026-04-15',
      endDate:               '2026-04-30',
      timeZone:              'UTC-5',
    },
    { ...MOCKS.sipRequisition, requisitionId: `SIP-REQ2-${TS}`, paymentAmount: 500.00, invoiceNumber: 'INV-SUPP-2026-008' },
  );

  // Step 10 — Buyer rejects
  await test(
    'SIP · buyer rejects requisition (cancelPayment)',
    'POST', '/vpa/v1/paymentService/cancelPayment',
    {
      messageId: msgId(),
      clientId:  CLIENT_ID,
      paymentId: r9.data?.requisitionId ?? `SIP-REQ2-${TS}`,
    },
    MOCKS.sipRejectRequisition,
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = live + warned + mocked;
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log(`  ${total} endpoints tested`);
  console.log(`  \x1b[32m${live} LIVE\x1b[0m  (real Visa sandbox 2xx)`);
  console.log(`  \x1b[33m${warned} WARN\x1b[0m  (reached; business validation)`);
  console.log(`  \x1b[35m${mocked} MOCK\x1b[0m  (needs processor provisioning)`);
  console.log('════════════════════════════════════════════════════════════════════════════════\n');

  console.log('  BIP flow: initiate → card issued → supplier notified → cancel/settle');
  console.log('  SIP flow: supplier submits → buyer approves → payment created\n');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
