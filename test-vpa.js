/**
 * Visa B2B Virtual Account Payment (VPA) — Sandbox API Test
 *
 * For each endpoint:
 *   LIVE (2xx)  — real Visa sandbox accepted the call
 *   WARN (400)  — endpoint reached; business/payload validation error
 *   MOCK        — endpoint exists but blocked (401/404/provisioning);
 *                 a realistic mock response is shown instead so the full
 *                 flow is visible end-to-end
 *
 * Why some endpoints fall back to MOCK:
 *   accountManagement/* — require a processor-level token (TSYS/FDR credential),
 *                         distinct from the Two-Way SSL Basic Auth
 *   supplier/*          — SUA Pool / Supplier module not enabled on this
 *                         sandbox project; contact Visa implementation team
 *   proxyPool/*         — same as above
 *   create endpoints    — need Visa-provisioned processorConfig / vanConfig fields
 *
 * Run:  node test-vpa.js
 */

'use strict';

const { printBanner } = require('./banner');
printBanner('Full VPA Account Management');

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

// ── mTLS fetch ────────────────────────────────────────────────────────────────

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

  // 401 / 403 / 404 / 5xx → mock
  const reason = status === 401 ? 'requires processor token'
    : status === 404 ? 'module not enabled on project'
    : `HTTP ${status}`;
  console.log(`\x1b[35mMOCK\x1b[0m   (${reason})`);
  mocked++;
  printResponse(mockData);
  return { status, data: mockData };
}

// ── Sandbox identifiers ───────────────────────────────────────────────────────

const CLIENT_ID   = 'B2BWS_1_1_9999';
const BUYER_ID    = '9999';
const FUNDING_PAN = '4111111111111111';

function msgId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Realistic mock responses ──────────────────────────────────────────────────

const NOW = new Date().toISOString();
const EXP_DATE = '1229';          // MM/YY
const VAN_1    = '4532015112830366';
const VAN_2    = '4916338506082832';

const MOCKS = {
  createBuyer: {
    buyerId: 'BUYER-SBX-001',
    clientId: CLIENT_ID,
    billingCurrency: '840',
    status: 'active',
    expirationDays: 30,
    defaultLanguageCode: 'en_US',
    paymentNotificationConfig: { emailNotification: true, notificationEmailAddress: 'procurement@gov-agency.example' },
    authorizationControlConfig: { authorizationControlEnabled: true },
    createdAt: NOW,
    updatedAt: NOW,
  },
  createBuyerTemplate: {
    templateId: 'TPL-SBX-001',
    clientId: CLIENT_ID,
    templateName: 'Gov Procurement Standard',
    billingCurrency: '840',
    dateFormat: 'YYYY-MM-DD',
    createdAt: NOW,
    updatedAt: NOW,
  },
  addFundingAccount: {
    accountNumber: FUNDING_PAN,
    maskedAccountNumber: '411111XXXXXX1111',
    creditLimit: 500000.00,
    expirationDate: EXP_DATE,
    activeVirtualAccounts: 0,
    status: 'active',
  },
  getFundingAccount: {
    accountNumber: FUNDING_PAN,
    maskedAccountNumber: '411111XXXXXX1111',
    creditLimit: 500000.00,
    availableCredit: 485000.00,
    expirationDate: EXP_DATE,
    activeVirtualAccounts: 3,
    status: 'active',
  },
  getSecurityCode: {
    accountNumber: VAN_1,
    cvv2: '847',
    expirationDate: EXP_DATE,
  },
  virtualCardRequisition: {
    statusCode: '00',
    statusDesc: 'Success',
    accounts: [
      { accountNumber: VAN_1, expiryDate: '04/2029', cvv2: '482', status: 'active', proxyNumber: 'PRX4A2F9E1C' },
    ],
  },
  getAccountStatus: {
    accountNumber: VAN_1,
    status: 'active',
    availableBalance: 5000.00,
    currencyCode: '840',
    expirationDate: EXP_DATE,
  },
  getPaymentControls: {
    accountNumber: VAN_1,
    paymentControlDetails: [
      { ruleCode: 'SPV', spendLimitAmount: 5000, maxAuth: 10, amountCurrencyCode: '840', rangeType: 3, startDate: '2026-04-01', endDate: '2026-06-30', consumedAmount: 0, consumedAuthCount: 0 },
      { ruleCode: 'ECOM' },
    ],
  },
  managePaymentControls: {
    statusCode: '00',
    statusDesc: 'Payment controls updated successfully',
    accountNumber: VAN_1,
    paymentControlDetails: [
      { ruleCode: 'ATM' },
      { ruleCode: 'HOT' },
    ],
  },
  getRequisitionDetails: {
    statusCode: '00',
    buyerId: BUYER_ID,
    accountNumber: VAN_1,
    requisitionId: 'REQ-SBX-' + Date.now(),
    status: 'A',
    startDate: '2026-04-01',
    endDate: '2026-06-30',
    createdAt: NOW,
  },
  createProxyPool: {
    proxyPoolId: 'POOL-SBX-001',
    buyerId: BUYER_ID,
    proxyPoolName: 'Gov Procurement Pool Q2-2026',
    initialOrderCount: 10,
    minAvailableAccounts: 3,
    reOrderCount: 5,
    availableAccounts: 10,
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  },
  updateProxyPool: {
    proxyPoolId: 'POOL-SBX-001',
    buyerId: BUYER_ID,
    minAvailableAccounts: 5,
    reOrderCount: 10,
    availableAccounts: 10,
    status: 'active',
    updatedAt: NOW,
  },
  getProxyPool: {
    proxyPoolId: 'POOL-SBX-001',
    buyerId: BUYER_ID,
    proxyPoolName: 'Gov Procurement Pool Q2-2026',
    initialOrderCount: 10,
    minAvailableAccounts: 5,
    reOrderCount: 10,
    availableAccounts: 8,
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  },
  manageProxyPool: {
    statusCode: '00',
    statusDesc: 'Proxy pool updated successfully',
    proxyPoolId: 'POOL-SBX-001',
    accountsAdded: 1,
    availableAccounts: 9,
  },
  deleteProxyPool: {
    statusCode: '00',
    statusDesc: 'Proxy pool deleted successfully',
    proxyPoolId: 'POOL-SBX-001',
  },
  createSupplier: {
    supplierId: 'SUPP-SBX-001',
    clientId: CLIENT_ID,
    supplierName: 'Acme Medical Supplies LLC',
    emailAddress: 'accounts@acmemedical.example',
    paymentDeliveryMethod: 'SIP',
    accountModel: 'SUA',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  },
  updateSupplier: {
    supplierId: 'SUPP-SBX-001',
    supplierName: 'Acme Medical Supplies LLC',
    emailAddress: 'ap@acmemedical.example',
    status: 'active',
    updatedAt: NOW,
  },
  getSupplier: {
    supplierId: 'SUPP-SBX-001',
    clientId: CLIENT_ID,
    supplierName: 'Acme Medical Supplies LLC',
    emailAddress: 'ap@acmemedical.example',
    paymentDeliveryMethod: 'SIP',
    accountModel: 'SUA',
    status: 'active',
    createdAt: NOW,
  },
  manageSupplierAccount: {
    statusCode: '00',
    statusDesc: 'Supplier account added successfully',
    supplierId: 'SUPP-SBX-001',
    accountNumber: FUNDING_PAN,
    action: 'A',
  },
  disableSupplier: {
    statusCode: '00',
    statusDesc: 'Supplier disabled successfully',
    supplierId: 'SUPP-SBX-001',
    status: 'disabled',
    updatedAt: NOW,
  },
  processPayments: {
    paymentId: 'PAY-SBX-' + Date.now(),
    buyerId: BUYER_ID,
    supplierId: 'SUPP-SBX-001',
    paymentAmount: 1500.00,
    currencyCode: '840',
    status: 'pending',
    paymentDate: '2026-04-15',
    invoiceNumber: 'INV-2026-GOV-001',
    accountNumber: VAN_2,
    createdAt: NOW,
  },
  getPaymentDetails: {
    paymentId: 'PAY-SBX-001',
    buyerId: BUYER_ID,
    supplierId: 'SUPP-SBX-001',
    paymentAmount: 1500.00,
    currencyCode: '840',
    status: 'unmatched',
    paymentDate: '2026-04-15',
    invoiceNumber: 'INV-2026-GOV-001',
    accountNumber: VAN_2,
    createdAt: NOW,
    updatedAt: NOW,
  },
  getPaymentDetailURL: {
    paymentId: 'PAY-SBX-001',
    url: `${BASE_URL}/vpa/v1/payment/PAY-SBX-001/entry?token=sbx_tok_abc123`,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  },
  resendPayment: {
    statusCode: '00',
    statusDesc: 'Payment notification resent successfully',
    paymentId: 'PAY-SBX-001',
    notificationSentAt: NOW,
  },
  cancelPayment: {
    statusCode: '00',
    statusDesc: 'Payment cancelled successfully',
    paymentId: 'PAY-SBX-001',
    status: 'cancelled',
    cancelledAt: NOW,
  },
  requisitionService: {
    statusCode: '00',
    requisitionId: 'REQ-SBX-' + Date.now(),
    accountNumber: VAN_1,
    expiryDate: '04/2027',
    status: 'active',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    createdAt: NOW,
  },
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nVisa B2B Virtual Account Payment (VPA) — Sandbox Test');
  console.log('=======================================================');
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`User ID  : ${USER}`);
  console.log('mTLS     : enabled\n');

  let buyerId = BUYER_ID;
  let templateId = 'TPL-SBX-001';
  let proxyPoolId = 'POOL-SBX-001';
  let supplierId  = 'SUPP-SBX-001';
  let paymentId   = 'PAY-SBX-001';

  // ── 1. Buyer Management ────────────────────────────────────────────────────
  console.log('── 1. Buyer Management ─────────────────────────────────────────────────────────');

  const r1 = await test('createBuyer', 'POST', '/vpa/v1/buyerManagement/buyer/create',
    {
      messageId: msgId(), clientId: CLIENT_ID,
      billingCurrency: '840',
      paymentNotificationConfig: { emailNotification: true, notificationEmailAddress: 'procurement@gov-agency.example' },
      authorizationControlConfig: { authorizationControlEnabled: true },
      dateFormat: 'YYYY-MM-DD', expirationDays: 30, defaultLanguageCode: 'en_US',
    },
    MOCKS.createBuyer,
  );
  if (r1.data?.buyerId) buyerId = r1.data.buyerId;

  await test('updateBuyer', 'PATCH', '/vpa/v1/buyerManagement/buyer/update',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, expirationDays: 45 },
    { buyerId, clientId: CLIENT_ID, expirationDays: 45, status: 'active', updatedAt: NOW },
  );

  await test('getBuyer', 'POST', '/vpa/v1/buyerManagement/buyer/get',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId },
    { ...MOCKS.createBuyer, buyerId },
  );

  const r4 = await test('createBuyerTemplate', 'POST', '/vpa/v1/buyerManagement/buyerTemplate/create',
    { messageId: msgId(), clientId: CLIENT_ID, templateName: 'Gov Procurement Standard', billingCurrency: '840', dateFormat: 'YYYY-MM-DD', authorizationControlConfig: { authorizationControlEnabled: true } },
    MOCKS.createBuyerTemplate,
  );
  if (r4.data?.templateId) templateId = r4.data.templateId;

  await test('updateBuyerTemplate', 'PATCH', '/vpa/v1/buyerManagement/buyerTemplate/update',
    { messageId: msgId(), clientId: CLIENT_ID, templateId, templateName: 'Gov Procurement Standard v2' },
    { ...MOCKS.createBuyerTemplate, templateId, templateName: 'Gov Procurement Standard v2', updatedAt: NOW },
  );

  await test('getBuyerTemplate', 'POST', '/vpa/v1/buyerManagement/buyerTemplate/get',
    { messageId: msgId(), clientId: CLIENT_ID, templateId },
    { ...MOCKS.createBuyerTemplate, templateId },
  );

  // ── 2. Funding Account & Virtual Account ───────────────────────────────────
  console.log('\n── 2. Funding Account & Virtual Account ────────────────────────────────────────');

  await test('addFundingAccount', 'POST', '/vpa/v1/accountManagement/fundingAccount/create',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, accountNumber: FUNDING_PAN },
    MOCKS.addFundingAccount,
  );

  await test('getFundingAccount', 'POST', '/vpa/v1/accountManagement/fundingAccount/get',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, accountNumber: FUNDING_PAN },
    MOCKS.getFundingAccount,
  );

  await test('getSecurityCode', 'POST', '/vpa/v1/accountManagement/GetSecurityCode',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, accountNumber: FUNDING_PAN, expirationDate: EXP_DATE },
    MOCKS.getSecurityCode,
  );

  const r8 = await test('VirtualCardRequisition (RVA)', 'POST', '/vpa/v1/accountManagement/VirtualCardRequisition',
    {
      messageId: msgId(), clientId: CLIENT_ID, buyerId, accountNumber: FUNDING_PAN, numberOfCards: '1',
      requisitionDetails: {
        startDate: '2026-04-01', endDate: '2026-06-30', timeZone: 'UTC-5',
        rules: [
          { ruleCode: 'SPV', spendLimitAmount: 5000, maxAuth: 10, amountCurrencyCode: '840', rangeType: 3 },
          { ruleCode: 'ECOM' },
        ],
      },
    },
    MOCKS.virtualCardRequisition,
  );
  const vanNumber = r8.data?.accounts?.[0]?.accountNumber ?? VAN_1;

  await test('getAccountStatus', 'POST', '/vpa/v1/accountManagement/GetAccountStatus',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, accountRequestID: vanNumber },
    MOCKS.getAccountStatus,
  );

  await test('getPaymentControls', 'POST', '/vpa/v1/accountManagement/getPaymentControls',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, accountNumber: vanNumber },
    MOCKS.getPaymentControls,
  );

  await test('managePaymentControls', 'POST', '/vpa/v1/accountManagement/ManagePaymentControls',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, accountNumber: vanNumber, action: 'A', paymentControlDetails: [{ ruleCode: 'ATM' }, { ruleCode: 'HOT' }] },
    MOCKS.managePaymentControls,
  );

  await test('getRequisitionDetails', 'POST', '/vpa/v1/getRequisitionDetails',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, accountNumber: vanNumber },
    MOCKS.getRequisitionDetails,
  );

  // ── 3. Proxy Pool ──────────────────────────────────────────────────────────
  console.log('\n── 3. Proxy Pool ───────────────────────────────────────────────────────────────');

  const r12 = await test('createProxyPool', 'POST', '/vpa/v1/suaPoolMaintenance/proxyPool/create',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, proxyPoolName: 'Gov Procurement Pool Q2-2026', initialOrderCount: 10, minAvailableAccounts: 3, reOrderCount: 5 },
    MOCKS.createProxyPool,
  );
  if (r12.data?.proxyPoolId) proxyPoolId = r12.data.proxyPoolId;

  await test('updateProxyPool', 'PATCH', '/vpa/v1/suaPoolMaintenance/proxyPool/update',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, proxyPoolId, minAvailableAccounts: 5, reOrderCount: 10 },
    { ...MOCKS.updateProxyPool, proxyPoolId },
  );

  await test('getProxyPool', 'POST', '/vpa/v1/suaPoolMaintenance/proxyPool/get',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, proxyPoolId },
    { ...MOCKS.getProxyPool, proxyPoolId },
  );

  await test('manageProxyPool', 'POST', '/vpa/v1/suaPoolMaintenance/manageProxyPool',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, proxyPoolId, accounts: [FUNDING_PAN] },
    { ...MOCKS.manageProxyPool, proxyPoolId },
  );

  await test('deleteProxyPool', 'POST', '/vpa/v1/suaPoolMaintenance/proxyPool/delete',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, proxyPoolId },
    { ...MOCKS.deleteProxyPool, proxyPoolId },
  );

  // ── 4. Supplier ────────────────────────────────────────────────────────────
  console.log('\n── 4. Supplier ─────────────────────────────────────────────────────────────────');

  const r17 = await test('createSupplier', 'POST', '/vpa/v1/supplierManagement/supplier/create',
    { messageId: msgId(), clientId: CLIENT_ID, supplierName: 'Acme Medical Supplies LLC', emailAddress: 'accounts@acmemedical.example', paymentDeliveryMethod: 'SIP', accountModel: 'SUA' },
    MOCKS.createSupplier,
  );
  if (r17.data?.supplierId) supplierId = r17.data.supplierId;

  await test('updateSupplier', 'PATCH', '/vpa/v1/supplierManagement/supplier/update',
    { messageId: msgId(), clientId: CLIENT_ID, supplierId, emailAddress: 'ap@acmemedical.example' },
    { ...MOCKS.updateSupplier, supplierId },
  );

  await test('getSupplier', 'POST', '/vpa/v1/supplierManagement/supplier/get',
    { messageId: msgId(), clientId: CLIENT_ID, supplierId },
    { ...MOCKS.getSupplier, supplierId },
  );

  await test('manageSupplierAccount', 'POST', '/vpa/v1/supplierManagement/ManageSupplierAccount',
    { messageId: msgId(), clientId: CLIENT_ID, supplierId, action: 'A', accountNumber: FUNDING_PAN },
    { ...MOCKS.manageSupplierAccount, supplierId },
  );

  await test('disableSupplier', 'POST', '/vpa/v1/supplierManagement/supplier/disable',
    { messageId: msgId(), clientId: CLIENT_ID, supplierId },
    { ...MOCKS.disableSupplier, supplierId },
  );

  // ── 5. Payment ─────────────────────────────────────────────────────────────
  console.log('\n── 5. Payment ──────────────────────────────────────────────────────────────────');

  const r22 = await test('processPayments', 'POST', '/vpa/v1/payment/processPayments',
    { messageId: msgId(), clientId: CLIENT_ID, buyerId, supplierId, paymentAmount: 1500.00, currencyCode: '840', paymentDate: '2026-04-15', invoiceNumber: 'INV-2026-GOV-001' },
    MOCKS.processPayments,
  );
  if (r22.data?.paymentId) paymentId = r22.data.paymentId;

  await test('getPaymentDetails', 'POST', '/vpa/v1/payment/getPaymentDetails',
    { messageId: msgId(), clientId: CLIENT_ID, paymentId },
    { ...MOCKS.getPaymentDetails, paymentId },
  );

  await test('getPaymentDetailURL', 'POST', '/vpa/v1/payment/getPaymentDetailURL',
    { messageId: msgId(), clientId: CLIENT_ID, paymentId },
    { ...MOCKS.getPaymentDetailURL, paymentId },
  );

  await test('resendPayment', 'POST', '/vpa/v1/payment/resendPayment',
    { messageId: msgId(), clientId: CLIENT_ID, paymentId },
    { ...MOCKS.resendPayment, paymentId },
  );

  await test('cancelPayment', 'POST', '/vpa/v1/payment/cancelPayment',
    { messageId: msgId(), clientId: CLIENT_ID, paymentId },
    { ...MOCKS.cancelPayment, paymentId },
  );

  await test('requisitionService', 'POST', '/vpa/v1/requisitionService',
    {
      messageId: msgId(), clientId: CLIENT_ID, buyerId, action: 'A', accountNumber: FUNDING_PAN, numberOfCards: '1',
      requisitionDetails: { startDate: '2026-04-01', endDate: '2026-04-30', timeZone: 'UTC-5', rules: [{ ruleCode: 'SPV', spendLimitAmount: 2500, maxAuth: 5, amountCurrencyCode: '840' }] },
    },
    MOCKS.requisitionService,
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = live + warned + mocked;
  console.log('\n=======================================================');
  console.log(`Results : \x1b[32m${live} live\x1b[0m  \x1b[33m${warned} warn\x1b[0m  \x1b[35m${mocked} mock\x1b[0m  (${total} endpoints tested)`);
  console.log('');
  console.log('Legend:');
  console.log('  \x1b[32mLIVE\x1b[0m  — real Visa sandbox accepted the call (2xx)');
  console.log('  \x1b[33mWARN\x1b[0m  — endpoint reached; business/payload validation error (400)');
  console.log('  \x1b[35mMOCK\x1b[0m  — endpoint blocked (401/404); realistic response shown');
  console.log('');
  console.log('To unlock MOCK endpoints:');
  console.log('  accountManagement/* — provide processor-level token (TSYS/FDR credential)');
  console.log('  supplier/proxyPool  — enable SUA Pool + Supplier modules via Visa implementation team');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
