/**
 * Example: Visa B2B Virtual Account — requestVirtualCard()
 *
 * Demonstrates issuing virtual cards via POST /vpa/v1/cards/provisioning
 * with embedded payment controls using the typed rule builder helpers.
 *
 * Run:  npx ts-node --esm examples/vcn-request.ts
 */
import {
  VCNService,
  buildSPVRule,
  buildAmountRule,
  buildToleranceRule,
  buildCAIDRule,
  buildBlockRule,
} from '../src';

const vcn = new VCNService();

async function main() {
  // ── 1. Single-use card with spend velocity + channel blocks ───────────────
  console.log('\n━━━  Issue VCN — Spend Velocity + Channel Blocks  ━━━\n');

  const response1 = await vcn.requestVirtualCard({
    clientId:     'B2BWS_1_1_9999',
    buyerId:      '9999',
    messageId:    Date.now().toString(),
    action:       'A',
    numberOfCards: '1',
    proxyPoolId:  'Proxy12345',
    requisitionDetails: {
      startDate: '2025-05-11',
      endDate:   '2025-06-01',
      timeZone:  'UTC-8',
      rules: [
        // $5,000 monthly limit, max 10 authorisations
        buildSPVRule({
          spendLimitAmount: 5_000,
          maxAuth:          10,
          currencyCode:     '840',    // USD
          rangeType:        'monthly',
          startDate:        '05/11/2025',
          endDate:          '06/01/2025',
        }),
        // Single-purchase cap: $1,000
        buildAmountRule('PUR', 1_000, '840'),
        // Block e-commerce and ATM withdrawals
        buildBlockRule('ECOM'),
        buildBlockRule('ATM'),
        // Block cross-border transactions
        buildBlockRule('XBR'),
      ],
    },
  });

  console.log('Response code:', response1.responseCode, '—', response1.responseMessage);
  console.log('Card(s) issued:');
  for (const acct of response1.accounts) {
    console.log(`  PAN:    ${acct.accountNumber}`);
    console.log(`  Proxy:  ${acct.proxyNumber}`);
    console.log(`  Expiry: ${acct.expiryDate}`);
    console.log(`  CVV2:   ${acct.cvv2}   (sandbox only)`);
    console.log(`  Status: ${acct.status}`);
  }

  // ── 2. Exact-amount card locked to a single merchant (CAID) ───────────────
  console.log('\n━━━  Issue VCN — Exact Amount + CAID Lock  ━━━\n');

  const response2 = await vcn.requestVirtualCard({
    clientId:     'B2BWS_1_1_9999',
    buyerId:      '9999',
    messageId:    Date.now().toString(),
    action:       'A',
    numberOfCards: '1',
    requisitionDetails: {
      startDate: '2025-05-11',
      endDate:   '2025-05-11',    // single-day card
      rules: [
        // Exact amount match: $48,500 USD only
        buildAmountRule('EAM', 48_500, '840'),
        // Lock to a specific merchant CAID
        buildCAIDRule('MEDSUPPLY_CORP_001'),
        // Block ATM cash
        buildBlockRule('ATM'),
      ],
    },
  });

  console.log('Response code:', response2.responseCode, '—', response2.responseMessage);
  const acct2 = response2.accounts[0];
  console.log(`  PAN:    ${acct2.accountNumber}`);
  console.log(`  Expiry: ${acct2.expiryDate}`);

  // ── 3. Tolerance band card (invoice ±5%) ──────────────────────────────────
  console.log('\n━━━  Issue VCN — Tolerance Band  ━━━\n');

  const invoiceAmount = 12_000;
  const tolerance     = invoiceAmount * 0.05; // 5%

  const response3 = await vcn.requestVirtualCard({
    clientId:     'B2BWS_1_1_9999',
    buyerId:      '9999',
    messageId:    Date.now().toString(),
    action:       'A',
    numberOfCards: '1',
    requisitionDetails: {
      startDate: '2025-05-11',
      endDate:   '2025-06-01',
      rules: [
        buildToleranceRule({
          currencyCode: '840',
          minValue:     invoiceAmount - tolerance,  // $11,400
          maxValue:     invoiceAmount + tolerance,  // $12,600
        }),
        buildBlockRule('ATM'),
        buildBlockRule('ECOM'),
      ],
    },
    optionalInfo: [
      { optionalFieldName: 'invoiceRef',  optionalFieldValue: 'INV-2025-0042' },
      { optionalFieldName: 'department',  optionalFieldValue: 'Ministry of Health' },
    ],
  });

  console.log('Response code:', response3.responseCode, '—', response3.responseMessage);
  console.log(`  PAN:    ${response3.accounts[0].accountNumber}`);

  // ── 4. Bulk issuance (3 cards) ────────────────────────────────────────────
  console.log('\n━━━  Bulk Issuance (3 cards)  ━━━\n');

  const response4 = await vcn.requestVirtualCard({
    clientId:     'B2BWS_1_1_9999',
    buyerId:      '9999',
    messageId:    Date.now().toString(),
    action:       'A',
    numberOfCards: '3',
    proxyPoolId:  'Proxy12345',
    requisitionDetails: {
      startDate: '2025-06-01',
      endDate:   '2025-06-30',
      rules: [
        buildSPVRule({ spendLimitAmount: 2_000, maxAuth: 5, currencyCode: '840', rangeType: 'monthly' }),
        buildBlockRule('ATM'),
      ],
    },
  });

  console.log(`Issued ${response4.accounts.length} card(s):`);
  for (const [i, a] of response4.accounts.entries()) {
    console.log(`  #${i + 1}  PAN: ${a.accountNumber}  Expiry: ${a.expiryDate}`);
  }

  // ── 5. Live mode reference (requires real Visa credentials) ───────────────
  console.log('\n━━━  Live mode (reference — requires Visa credentials)  ━━━\n');
  console.log(`
  const response = await vcn.requestVirtualCard(payload, {
    baseUrl:     'https://sandbox.api.visa.com',  // or https://api.visa.com
    credentials: {
      userId:   process.env.VISA_USER_ID!,
      password: process.env.VISA_PASSWORD!,
    },
  });
  `);
}

main().catch(console.error);
