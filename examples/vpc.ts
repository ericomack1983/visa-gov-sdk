/**
 * Example: Visa B2B Payment Controls (VPC) — full walkthrough
 *
 * Flow: create account → set rules → IPC Gen-AI suggestion → apply rules →
 *       inject test transactions → query reporting → supplier validation
 *
 * Run:  npx ts-node --esm examples/vpc.ts
 */
import { VPCService } from '../src';

async function main() {
  const vpc = VPCService.sandbox();

  // ── 1. Register a virtual card account with VPC ───────────────────────────
  console.log('\n━━━  1. Create Account  ━━━\n');

  const account = await vpc.AccountManagement.createAccount({
    accountNumber: '4111111111111111',
    contacts: [
      {
        name:     'Procurement Officer',
        email:    'proc@gov.example',
        phone:    '+12025550100',
        notifyOn: ['transaction_declined', 'account_blocked'],
      },
    ],
  });

  console.log('Account ID:     ', account.accountId);
  console.log('Account Number: ', account.accountNumber);
  console.log('Status:         ', account.status);
  console.log('Contacts:       ', account.contacts.length);

  const accountId = account.accountId;

  // ── 2. Set payment control rules ─────────────────────────────────────────
  console.log('\n━━━  2. Set Rules  ━━━\n');

  const updated = await vpc.Rules.setRules(accountId, [
    // $10,000/month spend velocity, max 30 authorisations
    {
      ruleCode: 'SPV',
      spendVelocity: {
        limitAmount:  10_000,
        currencyCode: '840',
        periodType:   'monthly',
        maxAuthCount: 30,
      },
    },
    // Single-transaction cap: $2,000
    {
      ruleCode: 'SPP',
      spendPolicy: { maxTransactionAmount: 2_000, currencyCode: '840' },
    },
    // Medical MCCs only
    {
      ruleCode: 'MCC',
      mcc: { allowedMCCs: ['5047', '5122', '8099'] },
    },
    // Channel: POS + online allowed, ATM blocked
    {
      ruleCode: 'CHN',
      channel: { allowOnline: true, allowPOS: true, allowATM: false, allowContactless: false },
    },
    // Business hours: Mon–Fri 08:00–18:00 EST
    {
      ruleCode: 'BHR',
      businessHours: {
        allowedDays: [1, 2, 3, 4, 5],
        startTime:   '08:00',
        endTime:     '18:00',
        timezone:    'America/New_York',
      },
    },
  ]);

  console.log('Rules applied:', updated.rules.map((r) => r.ruleCode).join(', '));

  // ── 3. Retrieve rules ─────────────────────────────────────────────────────
  console.log('\n━━━  3. Get Rules  ━━━\n');

  const { rules, status } = await vpc.Rules.getRules(accountId);
  console.log(`Account status: ${status}`);
  for (const r of rules) {
    const detail =
      r.spendVelocity ? `  limit=$${r.spendVelocity.limitAmount} ${r.spendVelocity.periodType}` :
      r.spendPolicy   ? `  max=$${r.spendPolicy.maxTransactionAmount}` :
      r.mcc?.allowedMCCs ? `  MCCs=${r.mcc.allowedMCCs.join(',')}` :
      r.channel       ? `  ATM=${r.channel.allowATM}` :
      r.businessHours ? `  hours=${r.businessHours.startTime}–${r.businessHours.endTime}` :
      '';
    console.log(`  [${r.ruleCode}]${detail}`);
  }

  // ── 4. IPC Gen-AI — suggest rules from natural language ───────────────────
  console.log('\n━━━  4. IPC — Intelligent Rule Suggestion  ━━━\n');

  const ipcResponse = await vpc.IPC.getSuggestedRules({
    prompt: 'Medical equipment procurement, max $50k per month, domestic use only, no ATM',
    currencyCode: '840',
  });

  console.log(`Prompt ID: ${ipcResponse.promptId}`);
  console.log(`Suggestions (${ipcResponse.suggestions.length}):`);
  for (const s of ipcResponse.suggestions) {
    console.log(`  [${s.ruleSetId}]  confidence=${s.confidence}%`);
    console.log(`    ${s.rationale}`);
    console.log(`    rules: ${s.rules.map((r) => r.ruleCode).join(', ')}`);
  }

  // ── 5. Apply top suggestion ───────────────────────────────────────────────
  console.log('\n━━━  5. Apply IPC Suggestion  ━━━\n');

  const best = ipcResponse.suggestions[0];
  const afterIPC = await vpc.IPC.setSuggestedRules(best.ruleSetId, accountId);
  console.log('Rules after IPC:', afterIPC.rules.map((r) => r.ruleCode).join(', '));

  // ── 6. Inject sandbox transactions and query reporting ────────────────────
  console.log('\n━━━  6. Reporting  ━━━\n');

  vpc.Reporting.injectTransaction(accountId, {
    amount: 4_200, currencyCode: '840',
    merchantName: 'MedEquip Co.', merchantCategoryCode: '5047',
    channel: 'pos', countryCode: 'US',
    outcome: 'approved',
    transactedAt: new Date().toISOString(),
  });

  vpc.Reporting.injectTransaction(accountId, {
    amount: 55_000, currencyCode: '840',
    merchantName: 'OfficeMax', merchantCategoryCode: '5111',
    channel: 'online', countryCode: 'US',
    outcome: 'declined',
    declineReason: 'SPV',
    declineMessage: 'Monthly spend velocity limit exceeded',
    transactedAt: new Date().toISOString(),
  });

  const allTxns = await vpc.Reporting.getTransactionHistory(accountId);
  const declined = await vpc.Reporting.getTransactionHistory(accountId, { outcome: 'declined' });

  console.log(`Total transactions:    ${allTxns.length}`);
  console.log(`Declined transactions: ${declined.length}`);
  for (const t of declined) {
    console.log(`  ✗ $${t.amount} @ ${t.merchantName} — [${t.declineReason}] ${t.declineMessage}`);
  }

  // ── 7. Disable + re-enable rules ─────────────────────────────────────────
  console.log('\n━━━  7. Disable / Enable Rules  ━━━\n');

  const disabled = await vpc.Rules.disableRules(accountId);
  console.log('Status after disable:', disabled.status);

  const enabled = await vpc.Rules.enableRules(accountId);
  console.log('Status after enable:', enabled.status);

  // ── 8. Block account ──────────────────────────────────────────────────────
  console.log('\n━━━  8. Block Account  ━━━\n');

  const blocked = await vpc.Rules.blockAccount(accountId);
  console.log('Status:', blocked.status);
  console.log('Rules:', blocked.rules.map((r) => r.ruleCode).join(', '));

  // ── 9. Supplier validation ────────────────────────────────────────────────
  console.log('\n━━━  9. Supplier Validation  ━━━\n');

  const supplier = await vpc.SupplierValidation.registerSupplier({
    supplierName: 'MedEquip Co.',
    acquirerBin:  '411111',
    caid:         'MEDSUPPLY_CORP_001',
    countryCode:  'US',
    mcc:          '5047',
    city:         'New York',
    postalCode:   '10001',
  });

  console.log('Supplier ID:', supplier.supplierId);
  console.log('Status:     ', supplier.status);

  // Wait for sandbox auto-validation
  await new Promise((r) => setTimeout(r, 100));

  const retrieved = await vpc.SupplierValidation.retrieveSupplier('411111', 'MEDSUPPLY_CORP_001');
  console.log('Status after validation:', retrieved.status);
  console.log('Validated at:           ', retrieved.validatedAt);

  // ── 10. Delete account ────────────────────────────────────────────────────
  console.log('\n━━━  10. Delete Account  ━━━\n');

  await vpc.AccountManagement.deleteAccount(accountId);
  console.log('Account deleted. Attempting to fetch…');

  try {
    await vpc.AccountManagement.getAccount(accountId);
  } catch (err) {
    console.log('Expected error:', (err as Error).message);
  }

  // ── 11. Live mode reference ───────────────────────────────────────────────
  console.log('\n━━━  11. Live mode (reference — requires Visa credentials)  ━━━\n');
  console.log(`
  import { VPCService } from '@visa-gov/sdk';

  const vpc = VPCService.live({
    baseUrl:     'https://sandbox.api.visa.com',
    credentials: {
      userId:   process.env.VISA_USER_ID!,
      password: process.env.VISA_PASSWORD!,
    },
  });

  // Same API — all calls route to real Visa VPC endpoints
  const account = await vpc.AccountManagement.createAccount({ accountNumber: '4111…' });
  `);
}

main().catch(console.error);
