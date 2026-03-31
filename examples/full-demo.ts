// full-demo.ts
import { VCNService } from '../src/payments/VCNService';
#import { SettlementService } from '../src/settlement/SettlementService';
#import { SupplierMatcher } from '../src/procurement/SupplierMatcher';

async function main() {
  console.log('=== Visa Gov SDK Full Demo ===');

  // 1️⃣ Issue a VCN
  const vcnService = new VCNService();
  console.log('\n[VCN] Issuing a new card...');
  const { card } = await vcnService.issue({
    holderName: 'Ministry of Health',
    brand: 'Visa',
    type: 'credit',
    usageType: 'single-use',
    mccCode: '5047',
    spendLimit: 48_500,
    controls: { allowOnline: true, allowIntl: false, allowRecurring: false },
  });
  console.log(`[VCN] Card issued: **** **** **** ${card.last4}, Expiry: ${card.expiry}`);


  // 3️⃣ Supplier matching
 // const supplierMatcher = new SupplierMatcher();
  //console.log('\n[SupplierMatcher] Finding best supplier for $50,000 medical purchase...');
  //const supplier = await supplierMatcher.findBestSupplier({
   // criteria: { category: 'medical', location: 'USA' },
   // amount: 50_000,
  //});
  //console.log(`[SupplierMatcher] Best supplier: ${supplier.supplierName} (Score: ${supplier.score})`);

  console.log('\n✅ Full demo complete!');
}

main().catch(console.error);
