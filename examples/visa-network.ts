/**
 * Example: Visa Supplier Match Service (SMS) — registry checks + enriched evaluation
 *
 * Run:  npx ts-node --esm examples/visa-network.ts
 */
import { VisaNetworkService, SupplierMatcher } from '../src';
import type { Supplier, Bid } from '../src';

// ── Sample suppliers ─────────────────────────────────────────────────────────
const SUPPLIERS: Supplier[] = [
  {
    id:               'sup-001',
    name:             'MedEquip Co.',
    rating:           4.8,
    complianceStatus: 'Compliant',
    certifications:   ['ISO 9001', 'ISO 13485'],
    pastPerformance:  92,
    pricingHistory:   [44000, 46000],
    walletAddress:    '0xABC',
    deliveryAvgDays:  28,
    riskScore:        12,
  },
  {
    id:               'sup-002',
    name:             'HealthTech Supplies',
    rating:           4.2,
    complianceStatus: 'Compliant',
    certifications:   ['ISO 9001'],
    pastPerformance:  78,
    pricingHistory:   [51000],
    walletAddress:    '0xDEF',
    deliveryAvgDays:  35,
    riskScore:        28,
  },
  {
    id:               'sup-003',
    name:             'BudgetMed LLC',    // sandbox: "budget" → Not Registered
    rating:           3.5,
    complianceStatus: 'Pending Review',
    certifications:   ['ISO 9001'],
    pastPerformance:  61,
    pricingHistory:   [38000],
    walletAddress:    '0xGHI',
    deliveryAvgDays:  55,
    riskScore:        44,
  },
];

async function main() {
  // ── 1. Single supplier check ──────────────────────────────────────────────
  console.log('\n━━━  Visa Supplier Match Service — Single Check  ━━━\n');

  const visaNetwork = VisaNetworkService.sandbox();

  const result = await visaNetwork.check({
    supplierName:         'MedEquip Co.',
    supplierCountryCode:  'US',
    supplierCity:         'New York',
    supplierState:        'NY',
    supplierPostalCode:   '10001',
    supplierStreetAddress: '123 Medical Ave',
    supplierPhoneNumber:  '+12125550100',
    supplierTaxId:        '82-1234567',
  });

  console.log('Raw Visa SMS response:');
  console.log(JSON.stringify(result.raw, null, 2));

  console.log('\nParsed result:');
  console.log(`  isRegistered:    ${result.isRegistered}`);
  console.log(`  confidenceScore: ${result.confidenceScore}/100`);
  console.log(`  MCC:             ${result.mcc}`);
  console.log(`  supportsL2:      ${result.supportsL2}`);
  console.log(`  supportsL3:      ${result.supportsL3}`);
  console.log(`  isFleetSupplier: ${result.isFleetSupplier}`);
  console.log(`  checkedAt:       ${result.checkedAt}`);

  // ── 2. Bulk check ─────────────────────────────────────────────────────────
  console.log('\n━━━  Bulk Check (3 suppliers)  ━━━\n');

  const bulkResults = await visaNetwork.bulkCheck([
    { supplierName: 'MedEquip Co.',      supplierCountryCode: 'US' },
    { supplierName: 'HealthTech Supplies', supplierCountryCode: 'US' },
    { supplierName: 'BudgetMed LLC',     supplierCountryCode: 'US' },
  ]);

  for (const [name, res] of bulkResults) {
    const status = res.isRegistered
      ? `✓ Registered  (confidence: ${res.raw.matchConfidence}, score: ${res.confidenceScore}, MCC: ${res.mcc})`
      : `✗ Not found   (confidence: ${res.raw.matchConfidence}, score: ${res.confidenceScore})`;
    console.log(`  ${name.padEnd(24)} ${status}`);
  }

  // ── 3. Enrich suppliers + AI evaluation ───────────────────────────────────
  console.log('\n━━━  Enriched AI Evaluation (Visa registry check)  ━━━\n');

  const rfp = {
    id: 'rfp-001', title: 'Medical Equipment Q2-2025',
    description: 'Surgical instruments for 3 hospitals',
    budgetCeiling: 50_000, deadline: '2025-04-30',
    category: 'Medical Equipment', status: 'Open' as const,
    createdAt: new Date().toISOString(), bids: [],
  };

  const bids: Bid[] = [
    { id: 'b1', rfpId: 'rfp-001', supplierId: 'sup-001', supplierName: 'MedEquip Co.',       amount: 45_000, deliveryDays: 30, notes: '', submittedAt: new Date().toISOString() },
    { id: 'b2', rfpId: 'rfp-001', supplierId: 'sup-002', supplierName: 'HealthTech Supplies', amount: 48_500, deliveryDays: 35, notes: '', submittedAt: new Date().toISOString() },
    { id: 'b3', rfpId: 'rfp-001', supplierId: 'sup-003', supplierName: 'BudgetMed LLC',       amount: 39_000, deliveryDays: 60, notes: '', submittedAt: new Date().toISOString() },
  ];

  const matcher = SupplierMatcher.withVisaNetwork(visaNetwork);

  // evaluateWithVisaCheck: calls Visa SMS API first, then ranks
  const { rankedBids, winner, narrative, visaChecks } = await matcher.evaluateWithVisaCheck({
    rfp, bids, suppliers: SUPPLIERS, countryCode: 'US',
  });

  console.log('Ranked results (Visa registry verified):\n');
  for (const sb of rankedBids) {
    const vc = visaChecks.get(sb.supplier.id);
    console.log(
      `  #${sb.rank}  ${sb.supplier.name.padEnd(24)}` +
      `  composite=${sb.composite.toString().padStart(3)}  ` +
      `registered=${vc?.isRegistered ? '✓' : '✗'}  ` +
      `MCC=${vc?.mcc || '—'}`,
    );
  }

  console.log(`\nWinner: ${winner.supplier.name} (${winner.composite}/100)`);
  console.log(`\nAI Narrative:\n  ${narrative}`);

  // ── 4. Live mode reference (commented out — requires real credentials) ─────
  console.log('\n━━━  Live mode (reference — requires Visa credentials)  ━━━\n');
  console.log(`
  import { VisaNetworkService } from '@visa-gov/sdk';

  const service = new VisaNetworkService({
    baseUrl:  'https://sandbox.api.visa.com',  // or https://api.visa.com for production
    userId:   process.env.VISA_USER_ID,
    password: process.env.VISA_PASSWORD,
  });

  const result = await service.check({
    supplierName:        'Acme Medical Corp',
    supplierCountryCode: 'US',
    supplierCity:        'Chicago',
    supplierState:       'IL',
    supplierPostalCode:  '60601',
    supplierTaxId:       '36-1234567',
  });
  `);
}

main().catch(console.error);
