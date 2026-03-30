# @visa-gov/sdk

TypeScript SDK for Visa Government Procurement — two capabilities in one package:

| Capability | What it does |
|---|---|
| **Visa Payments** | Virtual Card Number (VCN) issuance + multi-rail settlement (USD / USDC / Card) |
| **Supplier Matching** | AI-powered bid evaluation using Visa Advanced Authorization (VAA) scores |

---

## Installation

```bash
npm install @visa-gov/sdk
# or
pnpm add @visa-gov/sdk
```

---

## Quick start

```ts
import {
  VCNService,
  SettlementService,
  SupplierMatcher,
  RFPManager,
  AuditService,
} from '@visa-gov/sdk';
```

---

## 1 · Visa Payments

### Issue a Virtual Card Number

```ts
const vcn = new VCNService();

// Instant — returns the final card immediately
const { card } = vcn.issue({
  holderName:  'Ministry of Health',
  brand:       'Visa',
  type:        'credit',
  usageType:   'single-use',
  mccCode:     '5047',          // Medical & Dental Equipment
  spendLimit:  48_500,
  controls:    {
    allowOnline:    true,
    allowIntl:      false,
    allowRecurring: false,
  },
});
console.log(card.last4, card.expiry);
```

**Step-by-step** (mirrors real Visa VCN API pipeline — great for progress UIs):

```ts
// validating → contacting → generating → vpa → vpc → issued
for await (const { step, card } of vcn.issueStepByStep({ holderName: 'Gov Procurement' })) {
  console.log(`[${step.key}] ${step.label}`);
  if (card) console.log('Card ready:', card.id, '····', card.last4);
}
```

VCN pipeline steps:

| Step | Label | Delay |
|------|-------|-------|
| `validating` | Validating VCN request… | 900 ms |
| `contacting` | Contacting issuer network… | 1,400 ms |
| `generating` | Generating virtual card credentials… | 1,100 ms |
| `vpa` | Creating VPA (Pseudo Accounts)… | 1,200 ms |
| `vpc` | Applying Visa Payment Controls… | 1,000 ms |
| `issued` | VCN issued successfully! | — |

---

### Settle a payment

Three settlement rails are supported:

| Rail | Steps | Default timing |
|------|-------|---------------|
| `USD` | authorized → processing → settled | 2 s/step (~6 s total) |
| `Card` | authorized → processing → settled | 2 s/step (~6 s total) |
| `USDC` | submitted → confirmed → settled | 1.5 s/step (~4.5 s total) |

**Automated (recommended):**

```ts
const service = new SettlementService();

const result = await service.settle({
  method:  'USD',
  orderId: 'ORD-2025-0001',
  amount:  48_500,
});
console.log(result.settledAt, result.durationMs);
```

**Manual step control:**

```ts
const session = service.initiate({ method: 'USDC', orderId: 'ORD-002', amount: 12_000 });

// Drive each step yourself
session.advance(); // submitted → confirmed
session.advance(); // confirmed → settled

console.log(session.getState());  // { currentStep: 'settled', progress: 100 }
```

**Streaming (for real-time UIs):**

```ts
for await (const state of session.stream()) {
  console.log(`${state.progress}% — ${state.currentStep}`);
}
// 33% — authorized
// 66% — processing
// 100% — settled
```

---

## 2 · Visa Supplier Matching

### Evaluate bids for an RFP

```ts
const matcher = new SupplierMatcher();

const result = matcher.evaluate({ rfp, bids, suppliers });

console.log(result.winner.supplier.name, result.winner.composite);
console.log(result.narrative);
// "MedEquip Co. leads with a composite score of 87/100 and a Visa
//  Advanced Authorization (VAA) Score of 94, reflecting high payment
//  reliability. Their strongest dimension is reliability (92/100)..."
```

**Scoring dimensions** (default weights):

| Dimension | Weight | Source |
|-----------|--------|--------|
| price | 25% | bid.amount vs rfp.budgetCeiling |
| delivery | 20% | bid.deliveryDays |
| reliability | 20% | supplier.pastPerformance |
| compliance | 15% | complianceStatus + certifications |
| risk | 10% | supplier.riskScore |
| **vaa** | **10%** | **supplier.vaaScore (Visa Advanced Authorization)** |

**Custom weights:**

```ts
// Price-focused procurement
const matcher = SupplierMatcher.withWeights({ price: 0.50, vaa: 0.05 });
```

---

### Full RFP lifecycle

```ts
const manager = new RFPManager();

// 1. Create & publish
const rfp = manager.create({
  title:         'Medical Equipment Q2-2025',
  budgetCeiling: 50_000,
  deadline:      '2025-04-30',
  category:      'Medical Equipment',
  description:   '...',
});
manager.publish(rfp.id);

// 2. Suppliers submit bids
manager.submitBid({
  rfpId:        rfp.id,
  supplierId:   'sup-001',
  supplierName: 'MedEquip Co.',
  amount:       45_000,
  deliveryDays: 30,
});

// 3. Run AI evaluation
const { winner, rankedBids, narrative } = manager.evaluate(rfp.id, suppliers);

// 4. Award (with override detection)
const { rfp: awarded, overrideNarrative } = manager.award(rfp.id, winner.supplier.id);
if (overrideNarrative) {
  // Gov user overrode the AI — compliance warning generated
  console.warn(overrideNarrative);
}

// 5. Mark paid
manager.markPaid(rfp.id);
```

---

### Override detection

If a government official manually selects a lower-ranked supplier, the SDK automatically generates a compliance warning that will be logged for audit:

```ts
const { overrideNarrative } = manager.award(rfp.id, 'sup-003'); // rank #3

// ⚠ Manual override detected. You selected BudgetMed LLC (rank #3, 61/100),
//   bypassing the AI recommendation.
//   MedEquip Co. scores 26 points higher at 87/100. The largest gap is in
//   reliability: MedEquip Co. scores 92 vs 61 for BudgetMed LLC.
//   Visa VAA score confirms MedEquip Co. carries lower payment risk (94 vs 55).
//   This override will be logged for audit and compliance review.
```

---

## 3 · Audit Trail

```ts
const audit = new AuditService();

const events = audit.buildTrail(rfps, transactions);

// Filter
const overrides = audit.filterByType(events, 'override_applied');
const byRFP     = audit.filterByRFP(events, rfp.id);

// Summary counts
const summary = audit.summarise(events);
// { rfp_created: 3, bid_submitted: 7, evaluation_run: 3, ... }

// Export
const csv  = audit.export(events, 'csv');
const json = audit.export(events, 'json');
```

---

## API Reference

### `VCNService`

| Method | Returns | Description |
|--------|---------|-------------|
| `issue(params)` | `VCNIssueResult` | Issue a VCN synchronously |
| `issueStepByStep(params)` | `AsyncGenerator` | Issue with real-time step events |
| `getSteps()` | `VCNIssueStep[]` | Pipeline step definitions |
| `getMCCCategories()` | `{ code, label }[]` | Supported MCC codes |

### `SettlementService`

| Method | Returns | Description |
|--------|---------|-------------|
| `initiate(params)` | `SettlementSession` | Create a new settlement session |
| `settle(params, delayMs?)` | `Promise<SettlementResult>` | Run full settlement automatically |
| `getStepLabel(step, mode?)` | `string` | Human-readable step label |

### `SettlementSession`

| Method | Returns | Description |
|--------|---------|-------------|
| `getState()` | `SettlementState` | Current state snapshot |
| `getStepLabel()` | `string` | Label for current step |
| `advance()` | `SettlementState` | Move to next step |
| `run(delayMs?)` | `Promise<SettlementResult>` | Auto-run with delays |
| `stream(delayMs?)` | `AsyncGenerator` | Yield state after each step |
| `isSettled()` | `boolean` | True when complete |
| `reset()` | `void` | Reset to idle |

### `SupplierMatcher`

| Method | Returns | Description |
|--------|---------|-------------|
| `evaluate({ rfp, bids, suppliers })` | `EvaluationResult` | Score + rank all bids |
| `scoreBids(bids, suppliers, rfp)` | `ScoredBid[]` | Score without RFP wrapper |
| `scoreBid(bid, supplier, rfp)` | `Partial<ScoredBid>` | Score single bid |
| `generateNarrative(ranked)` | `string` | AI explanation of winner |
| `generateOverrideNarrative(selected, best)` | `string` | Compliance warning text |
| `getWeights()` | `ScoringWeights` | Active weight configuration |
| `SupplierMatcher.withWeights(partial)` | `SupplierMatcher` | Custom weight instance |

### `RFPManager`

| Method | Returns | Description |
|--------|---------|-------------|
| `create(params)` | `RFP` | Create RFP (Draft) |
| `publish(rfpId)` | `RFP` | Publish RFP (Open) |
| `submitBid(params)` | `Bid` | Add supplier bid |
| `evaluate(rfpId, suppliers)` | `EvaluationResult` | Run AI evaluation |
| `award(rfpId, winnerId, justification?)` | `{ rfp, overrideNarrative? }` | Award RFP |
| `markPaid(rfpId)` | `RFP` | Mark as paid |
| `get(rfpId)` | `RFP \| undefined` | Retrieve by ID |
| `list(status?)` | `RFP[]` | List all (optionally filtered) |
| `load(rfps)` | `void` | Hydrate from external source |

### `AuditService`

| Method | Returns | Description |
|--------|---------|-------------|
| `buildTrail(rfps, transactions)` | `AuditEvent[]` | Build full audit trail |
| `filterByType(events, type)` | `AuditEvent[]` | Filter by event type |
| `filterByRFP(events, rfpId)` | `AuditEvent[]` | Filter by RFP |
| `filterByActor(events, actor)` | `AuditEvent[]` | Filter by actor name |
| `export(events, format)` | `string` | Export as JSON or CSV |
| `summarise(events)` | `Record<type, number>` | Count by event type |

---

## License

MIT
