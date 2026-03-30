/**
 * Example: Visa Supplier Matching — AI bid evaluation
 *
 * Run:  npx ts-node --esm examples/procurement.ts
 */
import { SupplierMatcher, VisaNetworkService } from '../src';
import type { Supplier, Bid } from '../src';

const SUPPLIERS: Supplier[] = [
  {
    id: 'sup-001', name: 'MedEquip Co.', rating: 4.8,
    complianceStatus: 'Compliant', certifications: ['ISO 9001', 'ISO 13485'],
    pastPerformance: 92, pricingHistory: [44000, 46000],
    walletAddress: '0xABC', deliveryAvgDays: 28, riskScore: 12, vaaScore: 94,
  },
  {
    id: 'sup-002', name: 'HealthTech Supplies', rating: 4.2,
    complianceStatus: 'Compliant', certifications: ['ISO 9001'],
    pastPerformance: 78, pricingHistory: [51000],
    walletAddress: '0xDEF', deliveryAvgDays: 35, riskScore: 28, vaaScore: 71,
  },
  {
    id: 'sup-003', name: 'BudgetMed LLC', rating: 3.5,
    complianceStatus: 'Pending Review', certifications: ['ISO 9001'],
    pastPerformance: 61, pricingHistory: [38000],
    walletAddress: '0xGHI', deliveryAvgDays: 55, riskScore: 44, vaaScore: 55,
  },
];

const RFP = {
  id: 'rfp-001', title: 'Medical Equipment Q2-2025',
  description: 'Surgical instruments for 3 hospitals',
  budgetCeiling: 50_000, deadline: '2025-04-30',
  category: 'Medical Equipment', status: 'Open' as const,
  createdAt: new Date().toISOString(), bids: [],
};

const BIDS: Bid[] = [
  { id: 'bid-001', rfpId: 'rfp-001', supplierId: 'sup-001', supplierName: 'MedEquip Co.',       amount: 45_000, deliveryDays: 30, notes: '', submittedAt: new Date().toISOString() },
  { id: 'bid-002', rfpId: 'rfp-001', supplierId: 'sup-002', supplierName: 'HealthTech Supplies', amount: 48_500, deliveryDays: 35, notes: '', submittedAt: new Date().toISOString() },
  { id: 'bid-003', rfpId: 'rfp-001', supplierId: 'sup-003', supplierName: 'BudgetMed LLC',       amount: 39_000, deliveryDays: 60, notes: '', submittedAt: new Date().toISOString() },
];

async function main() {
  // ── Standard evaluation ───────────────────────────────────────────────────
  console.log('\n━━━  AI Evaluation  ━━━\n');
  const matcher = new SupplierMatcher();
  const result  = matcher.evaluate({ rfp: RFP, bids: BIDS, suppliers: SUPPLIERS });

  for (const sb of result.rankedBids) {
    console.log(`  #${sb.rank}  ${sb.supplier.name.padEnd(24)}  composite=${sb.composite}  VAA=${sb.dimensions.vaa}`);
  }
  console.log(`\nNarrative:\n  ${result.narrative}`);

  // ── Override narrative ────────────────────────────────────────────────────
  console.log('\n━━━  Override Warning  ━━━\n');
  const overrideWarning = matcher.generateOverrideNarrative(result.rankedBids[2], result.rankedBids[0]);
  console.log(overrideWarning);

  // ── Custom weights ────────────────────────────────────────────────────────
  console.log('\n━━━  Custom Weights (price-heavy)  ━━━\n');
  const priceMatcher = SupplierMatcher.withWeights({ price: 0.50, vaa: 0.05 });
  const priceResult  = priceMatcher.evaluate({ rfp: RFP, bids: BIDS, suppliers: SUPPLIERS });
  console.log(`  Winner: ${priceResult.winner.supplier.name} (${priceResult.winner.composite}/100)`);

  // ── With Visa network check ───────────────────────────────────────────────
  console.log('\n━━━  Evaluation with live Visa registry (sandbox)  ━━━\n');
  const visaMatcher = SupplierMatcher.withVisaNetwork(VisaNetworkService.sandbox());
  const { rankedBids, visaChecks } = await visaMatcher.evaluateWithVisaCheck({
    rfp: RFP, bids: BIDS, suppliers: SUPPLIERS, countryCode: 'US',
  });

  for (const sb of rankedBids) {
    const vc = visaChecks.get(sb.supplier.id);
    console.log(`  #${sb.rank}  ${sb.supplier.name.padEnd(24)}  VAA=${sb.dimensions.vaa}  registered=${vc?.isRegistered ? '✓' : '✗'}  MCC=${vc?.mcc || '—'}`);
  }
}

main().catch(console.error);
