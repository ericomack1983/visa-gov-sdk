/**
 * Example: Visa Payments — VCN issuance + settlement
 *
 * Run:  npx ts-node examples/payments.ts
 */
import { VCNService, SettlementService } from '../src';

async function main() {
  // ── 1. Issue a Virtual Card Number ──────────────────────────────────────
  const vcn = new VCNService();

  console.log('\n━━━  Visa VCN Issuance  ━━━');
  console.log('Available MCC categories:', vcn.getMCCCategories().slice(0, 3));

  // Option A: instant result
  const { card } = vcn.issue({
    holderName:  'Ministry of Health',
    brand:       'Visa',
    type:        'credit',
    usageType:   'single-use',
    mccCode:     '5047',              // Medical & Dental Equipment
    spendLimit:  48_500,
    controls:    { allowOnline: true, allowIntl: false, allowRecurring: false },
  });
  console.log('\nCard issued:');
  console.log(`  ID:        ${card.id}`);
  console.log(`  Last4:     •••• ${card.last4}`);
  console.log(`  Expiry:    ${card.expiry}`);
  console.log(`  Brand:     ${card.brand}`);
  console.log(`  Usage:     ${card.usageType}`);
  console.log(`  MCC:       ${card.mccCode}`);
  console.log(`  Controls:  online=${card.controls.allowOnline}, intl=${card.controls.allowIntl}`);

  // Option B: step-by-step (mirrors real API latency — great for progress UIs)
  console.log('\n━━━  VCN Pipeline (step-by-step)  ━━━');
  for await (const { step, card: issued } of vcn.issueStepByStep({ holderName: 'Gov Procurement' })) {
    console.log(`  [${step.key.toUpperCase().padEnd(10)}] ${step.label}`);
    if (issued) console.log(`  → Card ready: •••• ${issued.last4}`);
  }

  // ── 2. Settle a payment ─────────────────────────────────────────────────
  const settlement = new SettlementService();

  console.log('\n━━━  USD Settlement (manual steps)  ━━━');
  const session = settlement.initiate({
    method:  'USD',
    orderId: 'ORD-2025-0001',
    amount:  48_500,
  });

  let state = session.getState();
  while (!session.isSettled()) {
    console.log(`  ${state.progress}%  ${session.getStepLabel()}`);
    await new Promise((r) => setTimeout(r, 300)); // fast for demo
    state = session.advance();
  }
  console.log(`  ${state.progress}%  ${session.getStepLabel()}`);

  console.log('\n━━━  USDC Settlement (automated)  ━━━');
  const result = await settlement.settle(
    { method: 'USDC', orderId: 'ORD-2025-0002', amount: 12_000 },
    400, // 400ms per step for demo (real: 1500ms)
  );
  console.log('  Settled:', result);
}

main().catch(console.error);
