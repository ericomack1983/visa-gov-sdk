/**
 * Example: Visa Payments — Virtual Card request + settlement
 *
 * Run:  npx ts-node examples/payments.ts
 */
import { VCNService, SettlementService, buildSPVRule, buildBlockRule } from '../src';

async function main() {
  // ── 1. Request a Virtual Card (B2B Virtual Account API) ──────────────────
  const vcn = new VCNService();

  console.log('\n━━━  Visa B2B Virtual Card Request  ━━━');

  const response = await vcn.requestVirtualCard({
    clientId:      'B2BWS_1_1_9999',
    buyerId:       '9999',
    messageId:     Date.now().toString(),
    action:        'A',
    numberOfCards: '1',
    proxyPoolId:   'Proxy12345',
    requisitionDetails: {
      startDate: '2025-05-11',
      endDate:   '2025-06-01',
      timeZone:  'UTC-8',
      rules: [
        buildSPVRule({ spendLimitAmount: 48_500, maxAuth: 1, currencyCode: '840', rangeType: 'monthly' }),
        buildBlockRule('ECOM'),
        buildBlockRule('ATM'),
      ],
    },
  });

  const card = response.accounts[0];
  console.log('\nCard provisioned:');
  console.log(`  PAN:         •••• •••• •••• ${card.accountNumber.slice(-4)}`);
  console.log(`  Proxy:       ${card.proxyNumber}`);
  console.log(`  Expiry:      ${card.expiryDate}`);
  console.log(`  Status:      ${card.status}`);
  console.log(`  Response:    ${response.responseCode} — ${response.responseMessage}`);

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

  console.log('\n━━━  Card Settlement (automated)  ━━━');
  const result = await settlement.settle(
    { method: 'Card', orderId: 'ORD-2025-0002', amount: 12_000 },
    400, // 400ms per step for demo (real: 1500ms)
  );
  console.log('  Settled:', result);
}

main().catch(console.error);
