# @visa-gov/sdk

TypeScript SDK for Visa Government Procurement — two capabilities in one package:

| Capability | What it does |
|---|---|
| **Visa Payments** | Virtual Card Number (VCN) issuance + multi-rail settlement (USD / Card) |
| **Supplier Matching** | AI-powered bid evaluation with live Visa registry verification via the Visa Supplier Match Service (SMS) API |

---

## Installation

```bash
npm install git+https://github.com/ericomack1983/visa-gov-sdk.git
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
  VPCService,
} from ‘@visa-gov/sdk’;
```

Run the full test suite (116 assertions across all services):

```bash
npx tsx test-sdk.ts
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

### Request a Virtual Card (B2B Virtual Account API)

Issue virtual cards with embedded payment controls via `POST /vpa/v1/cards/provisioning`.
Use the typed rule-builder helpers to compose any combination of spending limits, channel blocks,
merchant locks, and tolerance bands.

```ts
import {
  VCNService,
  buildSPVRule,
  buildAmountRule,
  buildToleranceRule,
  buildCAIDRule,
  buildBlockRule,
} from '@visa-gov/sdk';

const vcn = new VCNService();

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
      // $5,000 monthly spend cap, max 10 auths
      buildSPVRule({ spendLimitAmount: 5000, maxAuth: 10, currencyCode: '840', rangeType: 'monthly' }),
      // Single-purchase limit: $1,000
      buildAmountRule('PUR', 1000, '840'),
      // Block e-commerce and ATM withdrawals
      buildBlockRule('ECOM'),
      buildBlockRule('ATM'),
    ],
  },
});

console.log(response.responseCode);              // "00" = success
console.log(response.accounts[0].accountNumber); // Virtual card PAN
console.log(response.accounts[0].expiryDate);    // MM/YYYY
```

**Connect to the real Visa VPA API:**

```ts
const response = await vcn.requestVirtualCard(payload, {
  baseUrl:     'https://sandbox.api.visa.com',  // or https://api.visa.com
  credentials: {
    userId:   process.env.VISA_USER_ID!,
    password: process.env.VISA_PASSWORD!,
  },
});
```

**Rule code reference:**

| Code | Category | Description |
|------|----------|-------------|
| `SPV` | Spending | Spend velocity — rolling period limit + auth count cap |
| `PUR` | Spending | Single-purchase amount cap |
| `EAM` | Spending | Exact amount match — card authorised only for this amount |
| `VPAS` | Spending | Virtual payment account specific — exact match with tolerance |
| `TOLRNC` | Spending | Tolerance band — min/max delta around expected amount |
| `XBRA` | Spending | Cross-border amount cap |
| `ATML` | Spending | ATM cash withdrawal limit |
| `CAID` | Merchant | Lock card to a single Card Acceptor ID |
| `HOT` | Merchant | Block hotels / lodging |
| `AUTO` | Merchant | Block auto dealers / rentals |
| `AIR` | Merchant | Block airlines |
| `REST` | Merchant | Block restaurants |
| `FUEL` | Merchant | Block fuel / petrol |
| `JEWL` | Merchant | Block jewelry |
| `ELEC` | Merchant | Block electronics |
| `ALC` | Merchant | Block alcohol / liquor stores |
| `GTM` | Merchant | Block government / tax payments |
| `OSS` | Merchant | Block other services |
| `GROC` | Merchant | Block grocery |
| `ENT` | Merchant | Block entertainment |
| `UTIL` | Merchant | Block utilities |
| `CLOTH` | Merchant | Block clothing / apparel |
| `MED` | Merchant | Block medical / healthcare |
| `ADT` | Merchant | Block adult content |
| `ATM` | Channel | Block ATM cash withdrawals |
| `ECOM` | Channel | Block e-commerce / online |
| `CNP` | Channel | Block card-not-present |
| `XBR` | Channel | Block cross-border transactions |
| `NOC` | Other | No controls — open card |

**Rule builders:**

| Helper | Description |
|--------|-------------|
| `buildSPVRule(params)` | Spend velocity with amount + auth count + period |
| `buildAmountRule(code, amount, currency)` | Amount-based rule (PUR, EAM, XBRA, ATML, VPAS) |
| `buildToleranceRule(params)` | Tolerance band with min/max values |
| `buildCAIDRule(caidValue)` | Lock card to a single merchant CAID |
| `buildBlockRule(ruleCode)` | Simple on/off block for any channel or merchant category |

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
| **vaa** | **10%** | **supplier.vaaScore — sourced from Visa SMS API or manual input** |

**Custom weights:**

```ts
// Price-focused procurement
const matcher = SupplierMatcher.withWeights({ price: 0.50, vaa: 0.05 });
```

---

### Visa Supplier Match Service — registry verification

Before scoring, verify each supplier is registered in the Visa network.
The match confidence (`High` / `Medium` / `Low` / `None`) is automatically
mapped to the **VAA dimension** (0–100) in the AI scoring model.

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

**Confidence → VAA score mapping:**

| matchConfidence | matchStatus | VAA score |
|-----------------|-------------|-----------|
| High | Yes | 95 |
| Medium | Yes | 70 |
| Low | Yes | 45 |
| None / No | No | 0 |

**Single check:**

```ts
const visaNetwork = VisaNetworkService.sandbox(); // or pass real VisaApiConfig

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
// VAA scores are fetched live from Visa before scoring
const matcher = SupplierMatcher.withVisaNetwork(VisaNetworkService.sandbox());

const { rankedBids, winner, visaChecks } = await matcher.evaluateWithVisaCheck({
  rfp,
  bids,
  suppliers,
  countryCode: 'US',
});

for (const sb of rankedBids) {
  const vc = visaChecks.get(sb.supplier.id);
  console.log(sb.supplier.name, '| VAA:', sb.dimensions.vaa, '| MCC:', vc?.mcc);
}
```

**Connect to the real Visa API:**

```ts
const service = new VisaNetworkService({
  baseUrl:  'https://sandbox.api.visa.com',  // prod: 'https://api.visa.com'
  userId:   process.env.VISA_USER_ID!,
  password: process.env.VISA_PASSWORD!,
});
```

---

## 3 · Visa B2B Payment Controls (VPC)

Enrol virtual cards in the Visa B2B Payment Controls system and apply real-time
spending rules, merchant category filters, channel restrictions, location controls,
and business-hour windows — all updateable in near real-time.

```ts
import { VPCService } from '@visa-gov/sdk';

const vpc = VPCService.sandbox();  // or VPCService.live({ baseUrl, credentials })
```

### Onboarding flow

```
1. Register account  →  2. Set rules  →  3. (optional) IPC suggestion  →  4. Monitor reports
```

```ts
// 1 — Register the virtual card with VPC
const account = await vpc.AccountManagement.createAccount({
  accountNumber: '4111111111111111',
  contacts: [{ name: 'Procurement Officer', email: 'proc@gov.example', notifyOn: ['transaction_declined'] }],
});

// 2 — Set payment control rules (full replacement, near real-time)
await vpc.Rules.setRules(account.accountId, [
  { ruleCode: 'SPV', spendVelocity: { limitAmount: 10_000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 30 } },
  { ruleCode: 'SPP', spendPolicy:   { maxTransactionAmount: 2_000, currencyCode: '840' } },
  { ruleCode: 'MCC', mcc:           { allowedMCCs: ['5047', '5122'] } },
  { ruleCode: 'CHN', channel:       { allowOnline: true, allowPOS: true, allowATM: false } },
]);

// 3 — Block or disable rules at any time
await vpc.Rules.blockAccount(account.accountId);   // HOT — all txns blocked
await vpc.Rules.disableRules(account.accountId);   // temporarily bypass rules
await vpc.Rules.enableRules(account.accountId);    // re-enable
```

### IPC — Intelligent Payment Controls (Gen-AI)

Describe card usage in plain language and receive AI-generated rule suggestions.

```ts
const { suggestions } = await vpc.IPC.getSuggestedRules({
  prompt: 'Medical equipment procurement, max $50k per month, domestic only, no ATM',
  currencyCode: '840',
});

console.log(suggestions[0].rationale);
// "Medical procurement: healthcare MCCs allowed; $50,000/month; POS and online; cross-border allowed."

// Apply the top suggestion to the account
await vpc.IPC.setSuggestedRules(suggestions[0].ruleSetId, account.accountId);
```

### VPC rule codes

| Code | Category | Description |
|------|----------|-------------|
| `HOT` | Block | Block all transactions |
| `SPV` | Spending | Spend velocity — rolling period limit + auth count cap |
| `SPP` | Spending | Spend policy — max single-transaction amount |
| `VPAS` | Spending | Exact amount match — authorised only for specified amount |
| `MCC` | Merchant | Merchant Category Code allow / block list |
| `MCG` | Merchant | Merchant Category Group allow / block list |
| `BHR` | Time | Business hours — restrict by day of week + time range |
| `CHN` | Channel | Channel restriction (online / POS / ATM / contactless) |
| `LOC` | Location | Country allow / block list |

### Reporting

```ts
// Declined transactions with VPC rule codes
const declined = await vpc.Reporting.getTransactionHistory(accountId, {
  outcome:  'declined',
  fromDate: '2025-05-01',
});

for (const t of declined) {
  console.log(`$${t.amount} @ ${t.merchantName} — [${t.declineReason}] ${t.declineMessage}`);
}

// Notification history (email / SMS)
const notifications = await vpc.Reporting.getNotificationHistory(accountId, {
  event: 'transaction_declined',
});
```

### Supplier Validation

```ts
// Register supplier for CAID validation
const validation = await vpc.SupplierValidation.registerSupplier({
  supplierName: 'MedEquip Co.',
  acquirerBin:  '411111',
  caid:         'MEDSUPPLY_001',
  countryCode:  'US',
  mcc:          '5047',
});

// Retrieve by Acquirer BIN + CAID
const record = await vpc.SupplierValidation.retrieveSupplier('411111', 'MEDSUPPLY_001');
console.log(record.status);  // 'validated'
```

### Connect to the real Visa VPC API

```ts
const vpc = VPCService.live({
  baseUrl:     'https://sandbox.api.visa.com',  // or https://api.visa.com
  credentials: {
    userId:   process.env.VISA_USER_ID!,
    password: process.env.VISA_PASSWORD!,
  },
});
```

---

## 4 · API Reference

### `VCNService`

| Method | Returns | Description |
|--------|---------|-------------|
| `issue(params)` | `VCNIssueResult` | Issue a VCN synchronously |
| `issueStepByStep(params)` | `AsyncGenerator` | Issue with real-time step events |
| `getSteps()` | `VCNIssueStep[]` | Pipeline step definitions |
| `getMCCCategories()` | `{ code, label }[]` | Supported MCC codes |
| `requestVirtualCard(payload, options?)` | `Promise<VCNRequestResponse>` | Issue virtual card(s) via Visa B2B VPA API with embedded payment control rules |

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
| `SupplierMatcher.withVisaNetwork(service, weights?)` | `SupplierMatcher` | Instance backed by Visa SMS API |
| `evaluateWithVisaCheck({ rfp, bids, suppliers, countryCode? })` | `Promise<EvaluationResult & { visaChecks }>` | Evaluate after live Visa registry verification |

### `VisaNetworkService`

| Method | Returns | Description |
|--------|---------|-------------|
| `VisaNetworkService.sandbox()` | `VisaNetworkService` | Create sandbox instance (no credentials) |
| `new VisaNetworkService(config)` | `VisaNetworkService` | Create live instance with Visa API credentials |
| `check(request)` | `Promise<VisaNetworkCheckResult>` | Check one supplier against Visa registry |
| `bulkCheck(requests)` | `Promise<Map<name, result>>` | Check multiple suppliers in parallel |
| `checkSupplier(supplier)` | `Promise<VisaNetworkCheckResult>` | Check a Supplier domain object directly |
| `enrichSupplier(supplier)` | `Promise<Supplier & { visaNetwork }>` | Enrich supplier with Visa data + `vaaScore` |
| `enrichSuppliers(suppliers, countryCode?)` | `Promise<EnrichedSupplier[]>` | Enrich multiple suppliers in parallel |

### `VPCService`

| Factory | Returns | Description |
|---------|---------|-------------|
| `VPCService.sandbox()` | `VPCService` | Create sandbox instance (no credentials) |
| `VPCService.live(config)` | `VPCService` | Create live instance with Visa VPC API credentials |

**`vpc.AccountManagement`**

| Method | Returns | Description |
|--------|---------|-------------|
| `createAccount(params)` | `Promise<VPCAccount>` | Register a virtual card with VPC |
| `getAccount(accountId)` | `Promise<VPCAccount>` | Retrieve account + contacts + current rules |
| `updateAccount(accountId, params)` | `Promise<VPCAccount>` | Update contacts |
| `deleteAccount(accountId)` | `Promise<void>` | Remove account + all rules + notifications |

**`vpc.Rules`**

| Method | Returns | Description |
|--------|---------|-------------|
| `setRules(accountId, rules[])` | `Promise<VPCAccount>` | Full replacement of all rules (near real-time) |
| `getRules(accountId)` | `Promise<{ rules, status }>` | Fetch all rules + account status |
| `deleteRules(accountId)` | `Promise<void>` | Clear all rules (card becomes unrestricted) |
| `blockAccount(accountId)` | `Promise<VPCAccount>` | Apply HOT rule — block all transactions |
| `disableRules(accountId)` | `Promise<VPCAccount>` | Temporarily bypass all rules |
| `enableRules(accountId)` | `Promise<VPCAccount>` | Re-enable previously disabled rules |

**`vpc.Reporting`**

| Method | Returns | Description |
|--------|---------|-------------|
| `getNotificationHistory(accountId, params?)` | `Promise<VPCNotification[]>` | Email / SMS notification records |
| `getTransactionHistory(accountId, params?)` | `Promise<VPCTransaction[]>` | Transaction records with VPC decline reason |

**`vpc.IPC`**

| Method | Returns | Description |
|--------|---------|-------------|
| `getSuggestedRules(request)` | `Promise<IPCRuleSetResponse>` | Gen-AI rule suggestions from natural language prompt |
| `setSuggestedRules(ruleSetId, accountId, overrides?)` | `Promise<VPCAccount>` | Apply a suggested rule set |

**`vpc.SupplierValidation`**

| Method | Returns | Description |
|--------|---------|-------------|
| `registerSupplier(params)` | `Promise<VPCSupplierValidation>` | Submit supplier for CAID validation |
| `updateSupplier(supplierId, params)` | `Promise<VPCSupplierValidation>` | Update validation status |
| `retrieveSupplier(acquirerBin, caid)` | `Promise<VPCSupplierValidation>` | Get validation record by BIN + CAID |

---

## License

MIT
