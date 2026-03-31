// full-demo.ts
import { VCNService, buildSPVRule, buildBlockRule } from '../src/index.js';

async function main() {
  console.log('=== Visa Gov SDK Full Demo ===');

  // 1️⃣ Request a Virtual Card (B2B Virtual Account API)
  const vcnService = new VCNService();
  console.log('\n[VCN] Requesting a virtual card...');
  const response = await vcnService.requestVirtualCard({
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
  console.log(`[VCN] Card provisioned: **** **** **** ${card.accountNumber.slice(-4)}, Expiry: ${card.expiryDate}`);

  console.log('\n✅ Full demo complete!');
}

main().catch(console.error);
