/**
 * Example: Visa Supplier Matching — RFP lifecycle + AI bid evaluation
 *
 * Run:  npx ts-node examples/procurement.ts
 */
import { RFPManager, SupplierMatcher, AuditService } from '../src';
import type { Supplier, Transaction } from '../src';

// ── Sample supplier catalogue ──────────────────────────────────────────────
const SUPPLIERS: Supplier[] = [
  {
    id:                'sup-001',
    name:              'MedEquip Co.',
    rating:            4.8,
    complianceStatus:  'Compliant',
    certifications:    ['ISO 9001', 'ISO 13485', 'FDA Registered'],
    pastPerformance:   92,
    pricingHistory:    [44000, 46000, 43500],
    walletAddress:     '0xABC123',
    deliveryAvgDays:   28,
    riskScore:         12,
    vaaScore:          94,
  },
  {
    id:                'sup-002',
    name:              'HealthTech Supplies',
    rating:            4.2,
    complianceStatus:  'Compliant',
    certifications:    ['ISO 9001', 'CE Mark'],
    pastPerformance:   78,
    pricingHistory:    [51000, 49000],
    walletAddress:     '0xDEF456',
    deliveryAvgDays:   35,
    riskScore:         28,
    vaaScore:          71,
  },
  {
    id:                'sup-003',
    name:              'BudgetMed LLC',
    rating:            3.5,
    complianceStatus:  'Pending Review',
    certifications:    ['ISO 9001'],
    pastPerformance:   61,
    pricingHistory:    [38000, 41000],
    walletAddress:     '0xGHI789',
    deliveryAvgDays:   55,
    riskScore:         44,
    vaaScore:          55,
  },
];

async function main() {
  const manager = new RFPManager();
  const audit   = new AuditService();

  // ── 1. Create & publish an RFP ──────────────────────────────────────────
  console.log('\n━━━  RFP Lifecycle  ━━━');

  const rfp = manager.create({
    title:          'Medical Equipment Procurement Q2-2025',
    description:    'Supply of surgical instruments and diagnostic equipment for 3 hospitals',
    budgetCeiling:  50_000,
    deadline:       '2025-04-30',
    category:       'Medical Equipment',
  });
  console.log(`Created RFP: ${rfp.id}  (status: ${rfp.status})`);

  manager.publish(rfp.id);
  console.log(`Published:   ${rfp.id}  (status: ${manager.get(rfp.id)?.status})`);

  // ── 2. Submit bids ──────────────────────────────────────────────────────
  console.log('\n━━━  Bid Submissions  ━━━');

  manager.submitBid({ rfpId: rfp.id, supplierId: 'sup-001', supplierName: 'MedEquip Co.',        amount: 45_000, deliveryDays: 30 });
  manager.submitBid({ rfpId: rfp.id, supplierId: 'sup-002', supplierName: 'HealthTech Supplies',  amount: 48_500, deliveryDays: 35 });
  manager.submitBid({ rfpId: rfp.id, supplierId: 'sup-003', supplierName: 'BudgetMed LLC',        amount: 39_000, deliveryDays: 60 });

  const updatedRFP = manager.get(rfp.id)!;
  console.log(`Bids received: ${updatedRFP.bids.length}`);

  // ── 3. AI evaluation ────────────────────────────────────────────────────
  console.log('\n━━━  AI Evaluation  ━━━');

  const result = manager.evaluate(rfp.id, SUPPLIERS);
  console.log(`\nNarrative:\n  ${result.narrative}`);
  console.log('\nRanked results:');
  for (const sb of result.rankedBids) {
    console.log(
      `  #${sb.rank}  ${sb.supplier.name.padEnd(24)}` +
      `  composite=${sb.composite}  VAA=${sb.dimensions.vaa}  ` +
      `price=${sb.dimensions.price.toFixed(0)}  risk=${sb.dimensions.risk.toFixed(0)}`,
    );
  }

  // ── 4. Award (override scenario) ────────────────────────────────────────
  console.log('\n━━━  Override Scenario  ━━━');

  const { rfp: awarded, overrideNarrative } = manager.award(
    rfp.id,
    'sup-003',   // choosing BudgetMed (rank #3) instead of AI winner
    'Budget constraints for this fiscal quarter',
  );
  if (overrideNarrative) {
    console.log('\n⚠ Override Warning:\n');
    console.log(overrideNarrative.split('\n').map((l) => '  ' + l).join('\n'));
  }

  // ── 5. Custom weight profile ────────────────────────────────────────────
  console.log('\n━━━  Custom Weights (price-heavy)  ━━━');

  const priceMatcher = SupplierMatcher.withWeights({ price: 0.50, vaa: 0.05, delivery: 0.15 });
  const priceResult  = priceMatcher.evaluate({ rfp: updatedRFP, bids: updatedRFP.bids, suppliers: SUPPLIERS });
  console.log(`Price-focused winner: ${priceResult.winner.supplier.name} (${priceResult.winner.composite}/100)`);

  // ── 6. Audit trail ──────────────────────────────────────────────────────
  const tx: Transaction = {
    id:           'tx-001',
    rfpId:        rfp.id,
    supplierId:   'sup-003',
    supplierName: 'BudgetMed LLC',
    amount:       39_000,
    method:       'USD',
    status:       'Settled',
    orderId:      'ORD-2025-0001',
    createdAt:    new Date().toISOString(),
    settledAt:    new Date().toISOString(),
  };

  manager.markPaid(rfp.id);

  const events = audit.buildTrail([manager.get(rfp.id)!], [tx]);
  console.log('\n━━━  Audit Trail  ━━━');
  for (const e of events) {
    console.log(`  [${e.type.padEnd(20)}]  ${e.description}`);
  }

  const summary = audit.summarise(events);
  console.log('\nEvent counts:', summary);

  // Export to CSV
  const csv = audit.export(events, 'csv');
  console.log('\nCSV preview (first 2 lines):');
  console.log(csv.split('\n').slice(0, 2).join('\n'));
}

main().catch(console.error);
