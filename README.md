# @visa-gov/sdk

TypeScript SDK for Visa Government Procurement — two capabilities in one package:

| Capability | What it does |
|---|---|
| **Visa Payments** | Virtual Card Number (VCN) issuance + multi-rail settlement (USD / USDC / Card) |
| **Supplier Matching** | AI-powered bid evaluation with live Visa registry verification via the Visa Supplier Match Service (SMS) API |

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
//  Supplier Matching Service (VSMS) Score of 94, reflecting high payment
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
| **vsms** | **10%** | **supplier.vsmsScore — sourced from Visa SMS API or manual input** |

**Custom weights:**

```ts
// Price-focused procurement
const matcher = SupplierMatcher.withWeights({ price: 0.50, vsms: 0.05 });
```

---

### Visa Supplier Match Service — registry verification

Before scoring, verify each supplier is registered in the Visa network.
The match confidence (`High` / `Medium` / `Low` / `None`) is automatically
mapped to the **VSMS dimension** (0–100) in the AI scoring model.

**Request fields** (`POST /suppliermatching/v1/supplierregistry/search`):

| Field | Required | Description |
|-------|----------|-------------|
| `supplierName` | ✓ | Name of the supplier |
| `supplierCountryCode` | ✓ | ISO 3166-1 alpha-2 country code (e.g. `"US"`, `"BR"`) |
| `supplierCity` | — | City |
| `supplierState` | — | State / province |
| `supplierPostalCode` | — | Postal code |
| `supplierStreetAddress` | — | Street address |
| `supplierPhoneNumber` | — | Phone number |
| `supplierTaxId` | — | Tax ID / EIN |

**Response** (Visa SMS API):

```json
{
  "matchConfidence": "High",
  "matchStatus": "Yes",
  "matchDetails": {
    "mcc": "3501",
    "l2": "",
    "l3s": "",
    "l3li": "",
    "fleetInd": ""
  },
  "status": {
    "statusCode": "SMSAPI000",
    "statusDescription": "Request successfully received"
  }
}
```

**Confidence → VSMS score mapping:**

| matchConfidence | matchStatus | VSMS score |
|-----------------|-------------|------------|
| High | Yes | 95 |
| Medium | Yes | 70 |
| Low | Yes | 45 |
| None / No | No | 0 |

**Single check:**

```ts
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

console.log(result.isRegistered);    // true
console.log(result.confidenceScore); // 95
console.log(result.mcc);             // "5047"
console.log(result.supportsL2);      // true
console.log(result.raw);             // full Visa API response
```

**Bulk check (parallel):**

```ts
const results = await visaNetwork.bulkCheck([
  { supplierName: 'MedEquip Co.',       supplierCountryCode: 'US' },
  { supplierName: 'HealthTech Supplies', supplierCountryCode: 'US' },
]);

for (const [name, res] of results) {
  console.log(name, res.isRegistered, res.confidenceScore);
}
```

**Evaluate with live Visa registry checks:**

```ts
const matcher = SupplierMatcher.withVisaNetwork(VisaNetworkService.sandbox());

const { rankedBids, winner, visaChecks } = await matcher.evaluateWithVisaCheck({
  rfp,
  bids,
  suppliers,
  countryCode: 'US',
});

for (const sb of rankedBids) {
  const vc = visaChecks.get(sb.supplier.id);
  console.log(sb.supplier.name, '| VSMS:', sb.dimensions.vsms, '| MCC:', vc?.mcc);
}
```

**Connect to the real Visa API:**

```ts
const service = new VisaNetworkService({
  baseUrl:  'https://sandbox.api.visa.com',
  userId:   process.env.VISA_USER_ID!,
  password: process.env.VISA_PASSWORD!,
});
```

---

### Full RFP lifecycle

```ts
const manager = new RFPManager();

const rfp = manager.create({
  title:         'Medical Equipment Q2-2025',
  budgetCeiling: 50_000,
  deadline:      '2025-04-30',
  category:      'Medical Equipment',
  description:   '...',
});
manager.publish(rfp.id);

manager.submitBid({
  rfpId:        rfp.id,
  supplierId:   'sup-001',
  supplierName: 'MedEquip Co.',
  amount:       45_000,
  deliveryDays: 30,
});

const { winner, rankedBids, narrative } = manager.evaluate(rfp.id, suppliers);

const { rfp: awarded, overrideNarrative } = manager.award(rfp.id, winner.supplier.id);
if (overrideNarrative) {
  console.warn(overrideNarrative);
}

manager.markPaid(rfp.id);
```

---

### Override detection

```ts
const { overrideNarrative } = manager.award(rfp.id, 'sup-003'); // rank #3

// ⚠ Manual override detected. You selected BudgetMed LLC (rank #3, 61/100),
//   bypassing the AI recommendation.
//   MedEquip Co. scores 26 points higher at 87/100. The largest gap is in
//   reliability: MedEquip Co. scores 92 vs 61 for BudgetMed LLC.
//   Visa VSMS score confirms MedEquip Co. carries lower payment risk (94 vs 55).
//   This override will be logged for audit and compliance review.
```

---

## 3 · Audit Trail

```ts
const audit = new AuditService();

const events = audit.buildTrail(rfps, transactions);

const overrides = audit.filterByType(events, 'override_applied');
const byRFP     = audit.filterByRFP(events, rfp.id);

const summary = audit.summarise(events);

const csv  = audit.export(events, 'csv');
const json = audit.export(events, 'json');
```

---

## 4 · Intelligent Payment Controls (IPC)

### The Problem

Configuring payment control rules manually requires knowing all the right rule codes, spending limits, MCC codes, and channel flags. Most procurement officers don't have that expertise.

### The Solution

Describe how the card should be used in plain English. IPC's Gen-AI model translates your intent into a ready-to-apply `VPCRule[]` — with a plain-English rationale and a confidence score so you can decide whether to trust it.

### Usage

```ts
const { suggestions } = await vpcService.IPC.getSuggestedRules({
  prompt: 'government procurement — electrical parts, domestic only, $12,000 cap',
  currencyCode: '840',
});

// suggestions[0].ruleSetId  — apply directly to a card
// suggestions[0].confidence — 0–100 score
// suggestions[0].rationale  — plain-English explanation

await vpcService.IPC.setSuggestedRules(suggestions[0].ruleSetId, accountId);
```

### How It Works Behind the Scenes

IPC is a **Visa-hosted Gen-AI service**. You send a string, you get back a validated `VPCRule[]`. No LLM API key required on your side.

```
Your app                    Visa API Gateway              IPC Model
   │                              │                           │
   │── POST /ipc/v1/suggest ─────▶│                           │
   │   { prompt, currencyCode }   │── tokenise + embed ──────▶│
   │                              │                           │ classify intent
   │                              │                           │ resolve MCC codes
   │                              │                           │ map → VPC rule schema
   │                              │                           │ score confidence
   │                              │◀── VPCRule[] + score ─────│
   │◀── suggestions[] ────────────│                           │
```

**Yes, there is an LLM** — but it is domain-specific, not general-purpose. Visa trained it to understand payment intent and emit only valid `VPCRule[]` objects.

| General-purpose LLM | Visa IPC Model |
|---|---|
| Free-form text output | Structured `VPCRule[]` — schema-validated |
| You parse / interpret the response | You apply `ruleSetId` directly to a card |
| No payment domain grounding | Trained on VPC rule ontology, MCC taxonomy, Visa policy |
| Hallucinated rule codes are possible | Output is always valid — model only emits known rule types |
| You supply the API key | Visa hosts it — authenticated via your Visa OAuth token |

### What the Model Classifies

Given `"office supplies, domestic only, $5,000 cap"` it extracts:

1. **Intent tokens** → `spend_category`, `geo_restriction`, `amount_limit`
2. **MCC resolution** → `5065`, `5112`, `5044` (office-related codes)
3. **Rule primitives** — each token maps to a `VPCRule` type:

| Rule type | Description |
|---|---|
| `SPV` | Single Payment Value — spend cap with max-auth count |
| `MCC_RESTRICT` | Lock card to specific Merchant Category Codes |
| `GEO_BLOCK` | Domestic-only or region-level geo fence |
| `ATM_BLOCK` | Block ATM withdrawals (applied by default) |
| `ECOM_BLOCK` | Block online / card-not-present transactions |
| `RECUR_BLOCK` | Block recurring / subscription charges |

4. **Confidence score** — based on input specificity. A vague prompt scores ~70%; a precise one hits ~94%.
5. **Rationale string** — plain-English explanation of what was translated and why.

### What You Don't Need to Build

- No OpenAI / Anthropic API key
- No prompt engineering for rule formatting
- No JSON parsing of free-form text
- No rule validation logic
- No MCC code lookup — IPC resolves these itself

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
| `advance()` | `SettlementState` | Move to next step |
| `run(delayMs?)` | `Promise<SettlementResult>` | Auto-run with delays |
| `stream(delayMs?)` | `AsyncGenerator` | Yield state after each step |
| `isSettled()` | `boolean` | True when complete |
| `reset()` | `void` | Reset to idle |

### `SupplierMatcher`

| Method | Returns | Description |
|--------|---------|-------------|
| `evaluate({ rfp, bids, suppliers })` | `EvaluationResult` | Score + rank all bids |
| `generateNarrative(ranked)` | `string` | AI explanation of winner |
| `generateOverrideNarrative(selected, best)` | `string` | Compliance warning text |
| `SupplierMatcher.withWeights(partial)` | `SupplierMatcher` | Custom weight instance |
| `SupplierMatcher.withVisaNetwork(service)` | `SupplierMatcher` | Instance backed by Visa SMS API |
| `evaluateWithVisaCheck({ rfp, bids, suppliers })` | `Promise<EvaluationResult>` | Evaluate after live Visa registry check |

### `VisaNetworkService`

| Method | Returns | Description |
|--------|---------|-------------|
| `VisaNetworkService.sandbox()` | `VisaNetworkService` | Sandbox instance (no credentials needed) |
| `check(request)` | `Promise<VisaNetworkCheckResult>` | Check one supplier against Visa registry |
| `bulkCheck(requests)` | `Promise<Map<name, result>>` | Check multiple suppliers in parallel |
| `enrichSuppliers(suppliers)` | `Promise<EnrichedSupplier[]>` | Enrich with Visa data + `vsmsScore` |

### `RFPManager`

| Method | Returns | Description |
|--------|---------|-------------|
| `create(params)` | `RFP` | Create RFP (Draft) |
| `publish(rfpId)` | `RFP` | Publish RFP (Open) |
| `submitBid(params)` | `Bid` | Add supplier bid |
| `evaluate(rfpId, suppliers)` | `EvaluationResult` | Run AI evaluation |
| `award(rfpId, winnerId)` | `{ rfp, overrideNarrative? }` | Award RFP |
| `markPaid(rfpId)` | `RFP` | Mark as paid |
| `list(status?)` | `RFP[]` | List all (optionally filtered) |

### `AuditService`

| Method | Returns | Description |
|--------|---------|-------------|
| `buildTrail(rfps, transactions)` | `AuditEvent[]` | Build full audit trail |
| `filterByType(events, type)` | `AuditEvent[]` | Filter by event type |
| `export(events, format)` | `string` | Export as JSON or CSV |
| `summarise(events)` | `Record<type, number>` | Count by event type |

---

## License

MIT
