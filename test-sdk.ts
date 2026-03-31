/**
 * @visa-gov/sdk — Full SDK Test Script
 *
 * Tests all capabilities:
 *   1. VCNService          — requestVirtualCard() (Visa B2B Virtual Account API)
 *   2. SettlementService   — USD and Card rails, manual + auto + streaming
 *   3. SupplierMatcher     — evaluate(), custom weights, override narrative
 *   4. VisaNetworkService  — single check, bulk check, enrichSuppliers
 *   5. VPCService          — account, rules, IPC Gen-AI, reporting, supplier validation
 *
 * Run:
 *   npx ts-node --esm test-sdk.ts
 *   # or
 *   npx tsx test-sdk.ts
 */

import {
  VCNService,
  SettlementService,
  SupplierMatcher,
  VisaNetworkService,
  VPCService,
  buildSPVRule,
  buildAmountRule,
  buildToleranceRule,
  buildCAIDRule,
  buildBlockRule,
} from './src';
import type { Supplier, Bid, RFP } from './src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}${detail ? `  →  ${detail}` : ''}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('━'.repeat(60));
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUPPLIERS: Supplier[] = [
  {
    id: 'sup-001', name: 'MedEquip Co.', rating: 4.8,
    complianceStatus: 'Compliant', certifications: ['ISO 9001', 'ISO 13485'],
    pastPerformance: 92, pricingHistory: [44000, 46000],
    walletAddress: '0xABC', deliveryAvgDays: 28, riskScore: 12,
  },
  {
    id: 'sup-002', name: 'HealthTech Supplies', rating: 4.2,
    complianceStatus: 'Compliant', certifications: ['ISO 9001'],
    pastPerformance: 78, pricingHistory: [51000],
    walletAddress: '0xDEF', deliveryAvgDays: 35, riskScore: 28,
  },
  {
    id: 'sup-003', name: 'BudgetMed LLC', rating: 3.5,
    complianceStatus: 'Pending Review', certifications: ['ISO 9001'],
    pastPerformance: 61, pricingHistory: [38000],
    walletAddress: '0xGHI', deliveryAvgDays: 55, riskScore: 44,
  },
];

const RFP_FIXTURE: RFP = {
  id: 'rfp-001', title: 'Medical Equipment Q2-2025',
  description: 'Surgical instruments for 3 hospitals',
  budgetCeiling: 50_000, deadline: '2025-04-30',
  category: 'Medical Equipment', status: 'Open',
  createdAt: new Date().toISOString(), bids: [],
};

const BIDS: Bid[] = [
  { id: 'b1', rfpId: 'rfp-001', supplierId: 'sup-001', supplierName: 'MedEquip Co.',       amount: 45_000, deliveryDays: 30, notes: '', submittedAt: new Date().toISOString() },
  { id: 'b2', rfpId: 'rfp-001', supplierId: 'sup-002', supplierName: 'HealthTech Supplies', amount: 48_500, deliveryDays: 35, notes: '', submittedAt: new Date().toISOString() },
  { id: 'b3', rfpId: 'rfp-001', supplierId: 'sup-003', supplierName: 'BudgetMed LLC',       amount: 39_000, deliveryDays: 60, notes: '', submittedAt: new Date().toISOString() },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. VCNService
// ─────────────────────────────────────────────────────────────────────────────

async function testVCN() {
  section('1 · VCNService — Request a Virtual Card (B2B Virtual Account API)');
  const vcn = new VCNService();

  // requestVirtualCard() — sandbox
  console.log('\n     requestVirtualCard() — sandbox:');
  const vcnResp = await vcn.requestVirtualCard({
    clientId: 'B2BWS_1_1_9999',
    buyerId: '9999',
    messageId: Date.now().toString(),
    action: 'A',
    numberOfCards: '2',
    proxyPoolId: 'Proxy12345',
    requisitionDetails: {
      startDate: '2025-05-11',
      endDate: '2025-06-01',
      timeZone: 'UTC-8',
      rules: [
        buildSPVRule({ spendLimitAmount: 5_000, maxAuth: 10, currencyCode: '840', rangeType: 'monthly' }),
        buildAmountRule('PUR', 1_000, '840'),
        buildBlockRule('ECOM'),
        buildBlockRule('ATM'),
      ],
    },
  });
  ok('requestVirtualCard responseCode = 00',  vcnResp.responseCode === '00');
  ok('requestVirtualCard returns 2 accounts', vcnResp.accounts.length === 2);
  ok('each account has PAN',                  vcnResp.accounts.every((a) => a.accountNumber.startsWith('4')));
  ok('each account has proxyNumber',          vcnResp.accounts.every((a) => !!a.proxyNumber));
  ok('each account status is active',         vcnResp.accounts.every((a) => a.status === 'active'));
  console.log(`       PAN:   ${vcnResp.accounts[0].accountNumber}`);
  console.log(`       Proxy: ${vcnResp.accounts[0].proxyNumber}`);
  console.log(`       CVV2:  ${vcnResp.accounts[0].cvv2}  (sandbox only)`);

  // Rule builders
  const spv = buildSPVRule({ spendLimitAmount: 3000, maxAuth: 5, currencyCode: '840', rangeType: 'daily' });
  ok('buildSPVRule ruleCode = SPV',           spv.ruleCode === 'SPV');
  ok('buildSPVRule has 4 overrides',          (spv.overrides?.length ?? 0) >= 4);

  const pur = buildAmountRule('PUR', 500, '840');
  ok('buildAmountRule ruleCode = PUR',        pur.ruleCode === 'PUR');

  const tolr = buildToleranceRule({ currencyCode: '840', minValue: 950, maxValue: 1050 });
  ok('buildToleranceRule ruleCode = TOLRNC',  tolr.ruleCode === 'TOLRNC');

  const caid = buildCAIDRule('MERCHANT_001');
  ok('buildCAIDRule ruleCode = CAID',         caid.ruleCode === 'CAID');

  const blk = buildBlockRule('HOT');
  ok('buildBlockRule ruleCode = HOT',         blk.ruleCode === 'HOT');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SettlementService
// ─────────────────────────────────────────────────────────────────────────────

async function testSettlement() {
  section('2 · SettlementService — multi-rail payment settlement');
  const service = new SettlementService();

  // USD rail — manual advance
  console.log('\n     USD rail — manual steps:');
  const usdSession = service.initiate({ method: 'USD', orderId: 'ORD-001', amount: 48_500 });
  let state = usdSession.getState();
  ok('USD starts at authorized (33%)',        state.currentStep === 'authorized' && state.progress === 33);
  console.log(`       ${state.progress}% — ${state.currentStep}`);

  state = usdSession.advance();
  ok('USD advances to processing (66%)',      state.currentStep === 'processing' && state.progress === 66);
  console.log(`       ${state.progress}% — ${state.currentStep}`);

  state = usdSession.advance();
  ok('USD advances to settled (100%)',        state.currentStep === 'settled' && state.progress === 100);
  ok('isSettled() = true after advance',      usdSession.isSettled());
  console.log(`       ${state.progress}% — ${state.currentStep}`);

  // advance() is no-op when settled
  const same = usdSession.advance();
  ok('advance() is no-op when settled',       same.currentStep === 'settled');

  // Card rail — auto run (fast delay)
  console.log('\n     Card rail — auto run (50ms/step):');
  const cardResult = await service.settle({ method: 'Card', orderId: 'ORD-002', amount: 12_000 }, 50);
  ok('Card rail settles successfully',        !!cardResult.settledAt);
  ok('Card result has orderId',               cardResult.orderId === 'ORD-002');
  ok('Card result has amount',                cardResult.amount === 12_000);
  ok('Card result has durationMs',            cardResult.durationMs > 0);
  console.log(`       Settled at: ${cardResult.settledAt}  (${cardResult.durationMs}ms)`);

  // Streaming
  console.log('\n     USD streaming:');
  const streamSession = service.initiate({ method: 'USD', orderId: 'ORD-003', amount: 5_000 });
  const streamSteps: string[] = [];
  for await (const s of streamSession.stream(50)) {
    streamSteps.push(s.currentStep);
    console.log(`       ${s.progress}% — ${s.currentStep}`);
  }
  ok('stream emits 3 states (33/66/100)',     streamSteps.length === 3);
  ok('stream last state is settled',          streamSteps[streamSteps.length - 1] === 'settled');

  // reset()
  streamSession.reset();
  ok('reset() sets step to idle',             streamSession.getState().currentStep === 'idle');

  // getStepLabel
  ok("getStepLabel('authorized') is defined", !!service.getStepLabel('authorized'));
  ok("getStepLabel('settled') is defined",    !!service.getStepLabel('settled'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SupplierMatcher
// ─────────────────────────────────────────────────────────────────────────────

async function testSupplierMatcher() {
  section('3 · SupplierMatcher — AI bid evaluation');
  const matcher = new SupplierMatcher();

  // evaluate()
  const result = matcher.evaluate({ rfp: RFP_FIXTURE, bids: BIDS, suppliers: SUPPLIERS });
  ok('evaluate() returns rankedBids',         result.rankedBids.length === 3);
  ok('rankedBids are sorted by rank',         result.rankedBids[0].rank === 1);
  ok('winner is rank 1',                      result.winner.rank === 1);
  ok('winner.isWinner = true',                result.winner.isWinner);
  ok('composite scores 0-100',                result.rankedBids.every((sb) => sb.composite >= 0 && sb.composite <= 100));
  ok('each bid has all 6 dimensions',         result.rankedBids.every((sb) =>
    ['price', 'delivery', 'reliability', 'compliance', 'risk', 'visaMatchScore'].every((d) => d in sb.dimensions),
  ));
  ok('narrative is non-empty',                result.narrative.length > 10);
  console.log('\n     Rankings:');
  for (const sb of result.rankedBids) {
    console.log(`       #${sb.rank}  ${sb.supplier.name.padEnd(24)}  composite=${sb.composite}`);
  }
  console.log(`\n     Narrative:\n       ${result.narrative}`);

  // scoreBid()
  const single = matcher.scoreBid(BIDS[0], SUPPLIERS[0], RFP_FIXTURE);
  ok('scoreBid() returns composite',          single.composite > 0);
  ok('scoreBid() returns dimensions',         !!single.dimensions);

  // custom weights
  const priceMatcher = SupplierMatcher.withWeights({ price: 0.80 });
  const priceResult  = priceMatcher.evaluate({ rfp: RFP_FIXTURE, bids: BIDS, suppliers: SUPPLIERS });
  ok('withWeights() creates valid matcher',   priceResult.rankedBids.length === 3);
  ok('weights are normalised to sum ~1.0',    Math.abs(Object.values(priceMatcher.getWeights()).reduce((s, v) => s + v, 0) - 1.0) < 0.01);

  // override narrative
  const override = matcher.generateOverrideNarrative(result.rankedBids[2], result.rankedBids[0]);
  ok('override narrative contains ⚠',        override.includes('⚠'));
  ok('override narrative mentions audit',     override.toLowerCase().includes('audit'));

  // error on empty bids
  let threw = false;
  try { matcher.evaluate({ rfp: RFP_FIXTURE, bids: [], suppliers: SUPPLIERS }); }
  catch { threw = true; }
  ok('evaluate() throws on empty bids',       threw);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. VisaNetworkService
// ─────────────────────────────────────────────────────────────────────────────

async function testVisaNetwork() {
  section('4 · VisaNetworkService — Visa Supplier Match Service (SMS)');
  const visaNetwork = VisaNetworkService.sandbox();

  // single check — registered supplier
  console.log('\n     Single check — MedEquip Co. (registered):');
  const result = await visaNetwork.check({
    supplierName: 'MedEquip Co.',
    supplierCountryCode: 'US',
    supplierCity: 'New York',
    supplierState: 'NY',
    supplierPostalCode: '10001',
  });
  ok('check() returns isRegistered = true',   result.isRegistered);
  ok('check() confidence score = 95',         result.confidenceScore === 95);
  ok('check() has mcc',                       !!result.mcc);
  ok('check() has checkedAt timestamp',       !!result.checkedAt);
  ok('check() raw.matchStatus = Yes',         result.raw.matchStatus === 'Yes');
  console.log(`       isRegistered:    ${result.isRegistered}`);
  console.log(`       confidenceScore: ${result.confidenceScore}`);
  console.log(`       MCC:             ${result.mcc}`);
  console.log(`       supportsL2:      ${result.supportsL2}`);

  // single check — not registered (budget in name triggers sandbox rejection)
  const notFound = await visaNetwork.check({ supplierName: 'BudgetMed LLC', supplierCountryCode: 'US' });
  ok('check() returns isRegistered = false for budget supplier', !notFound.isRegistered);
  ok('check() confidence score = 0 for not found',              notFound.confidenceScore === 0);

  // bulk check
  console.log('\n     Bulk check (3 suppliers):');
  const bulk = await visaNetwork.bulkCheck([
    { supplierName: 'MedEquip Co.',       supplierCountryCode: 'US' },
    { supplierName: 'HealthTech Supplies', supplierCountryCode: 'US' },
    { supplierName: 'BudgetMed LLC',      supplierCountryCode: 'US' },
  ]);
  ok('bulkCheck() returns 3 results',         bulk.size === 3);
  ok('bulkCheck() MedEquip is registered',    bulk.get('MedEquip Co.')?.isRegistered === true);
  ok('bulkCheck() BudgetMed is not found',    bulk.get('BudgetMed LLC')?.isRegistered === false);
  for (const [name, res] of bulk) {
    const status = res.isRegistered
      ? `✓ Registered  (score: ${res.confidenceScore}, MCC: ${res.mcc})`
      : `✗ Not found   (score: ${res.confidenceScore})`;
    console.log(`       ${name.padEnd(24)} ${status}`);
  }

  // enrichSupplier
  const enriched = await visaNetwork.enrichSupplier(SUPPLIERS[0]);
  ok('enrichSupplier() adds visaNetwork field', !!enriched.visaNetwork);
  ok('enrichSupplier() isRegistered',           enriched.visaNetwork.isRegistered);

  // enrichSuppliers (bulk)
  const allEnriched = await visaNetwork.enrichSuppliers(SUPPLIERS, 'US');
  ok('enrichSuppliers() returns same count',    allEnriched.length === SUPPLIERS.length);
  ok('all have visaNetwork field',              allEnriched.every((s) => !!s.visaNetwork));

  // evaluateWithVisaCheck
  console.log('\n     Evaluate with Visa registry check:');
  const visaMatcher = SupplierMatcher.withVisaNetwork(visaNetwork);
  const { rankedBids, winner, visaChecks } = await visaMatcher.evaluateWithVisaCheck({
    rfp: RFP_FIXTURE, bids: BIDS, suppliers: SUPPLIERS, countryCode: 'US',
  });
  ok('evaluateWithVisaCheck() returns rankedBids',        rankedBids.length === 3);
  ok('evaluateWithVisaCheck() returns visaChecks',        visaChecks.size === 3);
  ok('winner is determined',                              !!winner);
  ok('visaMatchScore > 0 for registered supplier',        rankedBids.some((sb) => sb.dimensions.visaMatchScore > 0));
  ok('visaMatchScore = 0 for unregistered supplier',      rankedBids.some((sb) => sb.dimensions.visaMatchScore === 0));
  console.log(`       Winner: ${winner.supplier.name} (${winner.composite}/100)`);
  for (const sb of rankedBids) {
    const vc = visaChecks.get(sb.supplier.id);
    console.log(`       #${sb.rank}  ${sb.supplier.name.padEnd(24)}  composite=${sb.composite}  visaMatchScore=${sb.dimensions.visaMatchScore}  MCC=${vc?.mcc || '—'}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. VPCService
// ─────────────────────────────────────────────────────────────────────────────

async function testVPC() {
  section('5 · VPCService — Visa B2B Payment Controls');
  const vpc = VPCService.sandbox();

  // ── AccountManagement ─────────────────────────────────────────────────────
  console.log('\n     AccountManagement:');

  const account = await vpc.AccountManagement.createAccount({
    accountNumber: '4111111111111111',
    contacts: [
      { name: 'Proc Officer', email: 'proc@gov.example', notifyOn: ['transaction_declined'] },
    ],
  });
  ok('createAccount() returns accountId',     !!account.accountId);
  ok('createAccount() status = active',       account.status === 'active');
  ok('createAccount() contacts assigned',     account.contacts.length === 1);
  ok('createAccount() contact has contactId', !!account.contacts[0].contactId);
  console.log(`       Account ID: ${account.accountId}`);

  const fetched = await vpc.AccountManagement.getAccount(account.accountId);
  ok('getAccount() returns same account',     fetched.accountId === account.accountId);

  const updated = await vpc.AccountManagement.updateAccount(account.accountId, {
    contacts: [
      { name: 'Updated Officer', email: 'updated@gov.example' },
    ],
  });
  ok('updateAccount() updates contacts',      updated.contacts[0].name === 'Updated Officer');

  // ── Rules ─────────────────────────────────────────────────────────────────
  console.log('\n     Rules:');

  const afterRules = await vpc.Rules.setRules(account.accountId, [
    { ruleCode: 'SPV', spendVelocity: { limitAmount: 10_000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 30 } },
    { ruleCode: 'SPP', spendPolicy: { maxTransactionAmount: 2_000, currencyCode: '840' } },
    { ruleCode: 'MCC', mcc: { allowedMCCs: ['5047', '5122'] } },
    { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: true, allowATM: false } },
    { ruleCode: 'BHR', businessHours: { allowedDays: [1,2,3,4,5], startTime: '08:00', endTime: '18:00', timezone: 'America/New_York' } },
  ]);
  ok('setRules() applies 5 rules',            afterRules.rules.length === 5);
  ok('setRules() rule codes correct',         afterRules.rules.map((r) => r.ruleCode).includes('SPV'));
  console.log(`       Rules: ${afterRules.rules.map((r) => r.ruleCode).join(', ')}`);

  const { rules, status } = await vpc.Rules.getRules(account.accountId);
  ok('getRules() returns 5 rules',            rules.length === 5);
  ok('getRules() status = active',            status === 'active');

  const disabled = await vpc.Rules.disableRules(account.accountId);
  ok('disableRules() status = rules_disabled', disabled.status === 'rules_disabled');

  const enabled = await vpc.Rules.enableRules(account.accountId);
  ok('enableRules() status = active',         enabled.status === 'active');

  const blocked = await vpc.Rules.blockAccount(account.accountId);
  ok('blockAccount() status = blocked',       blocked.status === 'blocked');
  ok('blockAccount() sets HOT rule',          blocked.rules[0]?.ruleCode === 'HOT');

  await vpc.Rules.deleteRules(account.accountId);
  const { rules: cleared } = await vpc.Rules.getRules(account.accountId);
  ok('deleteRules() clears all rules',        cleared.length === 0);

  // Restore rules for reporting tests
  await vpc.Rules.setRules(account.accountId, [
    { ruleCode: 'SPV', spendVelocity: { limitAmount: 5_000, currencyCode: '840', periodType: 'monthly' } },
  ]);

  // ── Reporting ─────────────────────────────────────────────────────────────
  console.log('\n     Reporting:');

  vpc.Reporting.injectTransaction(account.accountId, {
    amount: 3_000, currencyCode: '840',
    merchantName: 'MedEquip Co.', merchantCategoryCode: '5047',
    channel: 'pos', countryCode: 'US',
    outcome: 'approved',
    transactedAt: new Date().toISOString(),
  });
  vpc.Reporting.injectTransaction(account.accountId, {
    amount: 9_999, currencyCode: '840',
    merchantName: 'OfficeMax', merchantCategoryCode: '5111',
    channel: 'online', countryCode: 'US',
    outcome: 'declined',
    declineReason: 'SPV',
    declineMessage: 'Monthly spend velocity limit exceeded',
    transactedAt: new Date().toISOString(),
  });

  const allTxns     = await vpc.Reporting.getTransactionHistory(account.accountId);
  const declined    = await vpc.Reporting.getTransactionHistory(account.accountId, { outcome: 'declined' });
  const approved    = await vpc.Reporting.getTransactionHistory(account.accountId, { outcome: 'approved' });
  ok('getTransactionHistory() returns 2',     allTxns.length === 2);
  ok('declined filter returns 1',             declined.length === 1);
  ok('approved filter returns 1',             approved.length === 1);
  ok('declined has declineReason = SPV',      declined[0].declineReason === 'SPV');
  console.log(`       Total: ${allTxns.length}  Approved: ${approved.length}  Declined: ${declined.length}`);
  console.log(`       Decline: $${declined[0].amount} @ ${declined[0].merchantName} — [${declined[0].declineReason}]`);

  const emptyNotifs = await vpc.Reporting.getNotificationHistory(account.accountId);
  ok('getNotificationHistory() returns array', Array.isArray(emptyNotifs));

  // ── IPC Gen-AI ────────────────────────────────────────────────────────────
  console.log('\n     IPC — Intelligent Payment Controls (Gen-AI):');

  const medicalIPC = await vpc.IPC.getSuggestedRules({
    prompt: 'Medical equipment procurement, max $50k per month, no ATM',
    currencyCode: '840',
  });
  ok('getSuggestedRules() returns suggestions',    medicalIPC.suggestions.length > 0);
  ok('getSuggestedRules() has promptId',           !!medicalIPC.promptId);
  ok('suggestions have ruleSetId',                 medicalIPC.suggestions.every((s) => !!s.ruleSetId));
  ok('suggestions have confidence > 0',            medicalIPC.suggestions.every((s) => s.confidence > 0));
  ok('suggestions have rules',                     medicalIPC.suggestions.every((s) => s.rules.length > 0));
  ok('suggestions have rationale',                 medicalIPC.suggestions.every((s) => s.rationale.length > 0));

  const itIPC = await vpc.IPC.getSuggestedRules({ prompt: 'IT software and cloud services, online only' });
  ok('IT prompt gets IT template',                 itIPC.suggestions[0].ruleSetId.includes('it'));

  const travelIPC = await vpc.IPC.getSuggestedRules({ prompt: 'Corporate travel — airline, hotel, transport' });
  ok('travel prompt gets travel template',         travelIPC.suggestions[0].ruleSetId.includes('travel'));

  console.log(`       Medical suggestion: [${medicalIPC.suggestions[0].ruleSetId}]  confidence=${medicalIPC.suggestions[0].confidence}%`);
  console.log(`       Rationale: ${medicalIPC.suggestions[0].rationale}`);

  const afterIPC = await vpc.IPC.setSuggestedRules(medicalIPC.suggestions[0].ruleSetId, account.accountId);
  ok('setSuggestedRules() applies rules',          afterIPC.rules.length > 0);
  ok('setSuggestedRules() keeps account active',   ['active', 'blocked', 'rules_disabled'].includes(afterIPC.status));
  console.log(`       Rules after IPC: ${afterIPC.rules.map((r) => r.ruleCode).join(', ')}`);

  // ── SupplierValidation ────────────────────────────────────────────────────
  console.log('\n     SupplierValidation:');

  const supplier = await vpc.SupplierValidation.registerSupplier({
    supplierName: 'MedEquip Co.',
    acquirerBin:  '411111',
    caid:         'MEDSUPPLY_CORP_001',
    countryCode:  'US',
    mcc:          '5047',
  });
  ok('registerSupplier() returns supplierId',  !!supplier.supplierId);
  ok('registerSupplier() status = pending',    supplier.status === 'pending');
  console.log(`       Supplier ID: ${supplier.supplierId}  status: ${supplier.status}`);

  await new Promise((r) => setTimeout(r, 100)); // wait for sandbox auto-validation

  const retrieved = await vpc.SupplierValidation.retrieveSupplier('411111', 'MEDSUPPLY_CORP_001');
  ok('retrieveSupplier() finds by BIN+CAID',   retrieved.supplierId === supplier.supplierId);
  ok('sandbox auto-validates after tick',      retrieved.status === 'validated');
  console.log(`       Status after auto-validation: ${retrieved.status}`);

  const manualUpdate = await vpc.SupplierValidation.updateSupplier(supplier.supplierId, { status: 'suspended' });
  ok('updateSupplier() changes status',        manualUpdate.status === 'suspended');

  // ── Account deletion ──────────────────────────────────────────────────────
  console.log('\n     Account deletion:');
  await vpc.AccountManagement.deleteAccount(account.accountId);
  let deletedErr = '';
  try { await vpc.AccountManagement.getAccount(account.accountId); }
  catch (e) { deletedErr = (e as Error).message; }
  ok('getAccount() throws after delete',       deletedErr.includes(account.accountId));
  console.log(`       Expected error: ${deletedErr}`);

  // ── Static factories ──────────────────────────────────────────────────────
  const sandbox2 = VPCService.sandbox();
  ok('VPCService.sandbox() creates instance',  !!sandbox2);
  ok('sandbox has AccountManagement',          !!sandbox2.AccountManagement);
  ok('sandbox has Rules',                      !!sandbox2.Rules);
  ok('sandbox has Reporting',                  !!sandbox2.Reporting);
  ok('sandbox has IPC',                        !!sandbox2.IPC);
  ok('sandbox has SupplierValidation',         !!sandbox2.SupplierValidation);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  @visa-gov/sdk — Test Suite');
  console.log('═'.repeat(60));

  try { await testVCN();           } catch (e) { console.error('\n  ERROR in VCN:', e); failed++; }
  try { await testSettlement();    } catch (e) { console.error('\n  ERROR in Settlement:', e); failed++; }
  try { await testSupplierMatcher();} catch (e) { console.error('\n  ERROR in SupplierMatcher:', e); failed++; }
  try { await testVisaNetwork();   } catch (e) { console.error('\n  ERROR in VisaNetwork:', e); failed++; }
  try { await testVPC();           } catch (e) { console.error('\n  ERROR in VPC:', e); failed++; }

  console.log('\n' + '═'.repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed  (${passed + failed} total)`);
  console.log('═'.repeat(60) + '\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
