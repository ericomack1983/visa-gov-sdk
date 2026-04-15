<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=1A1F71&height=140&section=header&text=%40visa-gov%2Fsdk&fontSize=48&fontColor=FFFFFF&animation=fadeIn&fontAlignY=42&desc=AI-Powered%20Government%20Procurement%20on%20Visa%20Rails&descAlignY=66&descSize=17&descColor=C8D4FF" width="100%"/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&pause=1200&color=1A1F71&center=true&vCenter=true&width=620&lines=Issue+virtual+cards+with+embedded+rules;Score+suppliers+with+6-dimension+AI;Real-time+payment+controls+on+every+card;Natural+language+%E2%86%92+payment+rules+(IPC+Gen-AI);From+discovery+to+settlement+in+one+SDK;20+tools+via+MCP+%E2%80%94+now+with+dedicated+B2B+AP+server" alt="Typing animation" />

<br/>

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Visa API](https://img.shields.io/badge/Visa%20API-Sandbox%20%2B%20Live-1A1F71?logo=visa&logoColor=white)](https://developer.visa.com)
[![Tests](https://img.shields.io/badge/Tests-100%20passing-22c55e?logo=checkmarx&logoColor=white)](./test-sdk.ts)
[![MCP](https://img.shields.io/badge/MCP-20%20tools-7C3AED?logo=anthropic&logoColor=white)](./mcp/server.ts)
[![B2B AP](https://img.shields.io/badge/B2B%20AP%20Agent-8%20tools%20%2B%202%20resources-0EA5E9?logo=anthropic&logoColor=white)](./mcp/b2b/server.ts)
[![License](https://img.shields.io/badge/License-MIT-f59e0b)](./LICENSE)
[![mTLS](https://img.shields.io/badge/Auth-mTLS%20Two--Way%20SSL-6366f1)](./src/client.ts)

</div>

---

## What is this?

Government procurement is slow, opaque, and expensive. This SDK wires the full Visa B2B payment infrastructure into a single TypeScript package — letting agencies go from **discovering a supplier** to **settling a payment** in one coherent flow, with AI-powered scoring and real-time payment controls at every step.

The SDK ships with a built-in **MCP server** that exposes all 20 capabilities to AI agents (Claude Code, Claude Desktop, Cursor, and any other MCP-compatible client) over natural language, with built-in guardrails on every money-moving operation.

<div align="center">

```
  🏛️ Agency                                              Visa Network
  ────────────────────────────────────────────────────────────────────
  Discover suppliers ──▶ AI score + Visa verification
         │
         ▼
  Issue virtual card ──▶ Embedded spending rules (SPV · MCC · CHN · BHR)
         │
         ▼
  IPC Gen-AI controls ──▶ Natural language → rule set in one call
         │
         ▼
  BIP / SIP payment ──▶ Buyer or supplier initiated flows
         │
         ▼
  Settle on Visa rails ──▶ USD · Card  |  streaming state for UI
         │
         ▼
  🤖 MCP Server ──▶ All of the above via natural language + guardrails
```

</div>

---

## Architecture

```mermaid
graph TB
    classDef visa    fill:#1A1F71,color:#fff,stroke:#1A1F71
    classDef payment fill:#2563EB,color:#fff,stroke:#2563EB
    classDef ai      fill:#7C3AED,color:#fff,stroke:#7C3AED
    classDef controls fill:#059669,color:#fff,stroke:#059669
    classDef settle  fill:#D97706,color:#fff,stroke:#D97706
    classDef mcp     fill:#0F172A,color:#fff,stroke:#0F172A

    GOV["🏛️ Government Agency"]
    AGENT["🤖 AI Agent\nClaude · Cursor · etc."]:::mcp

    subgraph SDK["  @visa-gov/sdk  "]
        direction TB

        MCP["MCP Server\n20 tools · guardrails"]:::mcp

        subgraph Payments["💳 Payments Layer"]
            VCN["VCNService\nVirtual Card Issuance"]:::payment
            VPA["VPAService\nAccount Management"]:::payment
            B2B["B2BPaymentService\nBIP · SIP Flows"]:::payment
            SET["SettlementService\nMulti-rail Settlement"]:::settle
        end

        subgraph Intelligence["🤖 Intelligence Layer"]
            SMS["VisaNetworkService\nSupplier Registry Check"]:::ai
            AI["SupplierMatcher\n6-Dimension AI Scoring"]:::ai
        end

        subgraph Controls["🔒 Controls Layer"]
            VPC["VPCService\nB2B Payment Controls"]:::controls
            IPC["🤖 IPC Gen-AI\nNatural Language → Rules"]:::controls
        end
    end

    VISA["⚡ Visa Network\nSandbox · Live"]:::visa

    GOV --> AI
    GOV --> VCN
    GOV --> B2B
    AGENT --> MCP
    MCP --> AI
    MCP --> VCN
    MCP --> B2B
    MCP --> VPC
    MCP --> SET
    AI  --> SMS
    SMS --> VISA
    VCN --> VISA
    VPA --> VISA
    B2B --> VISA
    VPC --> VISA
```

---

## Installation

```bash
npm install git+https://github.com/ericomack1983/visa-gov-sdk.git
```

```ts
import {
  VCNService,
  VPAService,
  B2BPaymentService,
  VisaNetworkService,
  SupplierMatcher,
  VPCService,
  SettlementService,
} from '@visa-gov/sdk';
```

Run everything with the unified test runner:

```bash
node run-tests.js           # all 8 suites
node run-tests.js --list    # show available suite keys
node run-tests.js --help    # full usage reference
```

---

## Feature Guide

| # | Feature | What it does | Real API |
|:-:|---------|-------------|:-------:|
| [1](#1--b2b-virtual-account-payments) | **B2B Virtual Account Payments** | Issue virtual cards with embedded spending rules | `POST /vpa/v1/cards/provisioning` |
| [2](#2--full-vpa-account-management) | **Full VPA Account Management** | Buyers, funding accounts, proxy pools, suppliers, payments | `/vpa/v1/*` |
| [3](#3--bip--sip-payment-flows) | **BIP & SIP Payment Flows** | Buyer-initiated and supplier-initiated B2B flows | `POST /vpa/v1/paymentService/*` |
| [4](#4--visa-supplier-match-service-sms) | **Visa Supplier Match Service** | Verify suppliers on the Visa network, get confidence score | `POST /visasuppliermatchingservice/v1/search` |
| [5](#5--ai-supplier-evaluation) | **AI Supplier Evaluation** | Score & rank bids across 6 weighted dimensions | SDK-internal |
| [6](#6--visa-b2b-payment-controls-vpc) | **Visa B2B Payment Controls** | Real-time spending rules on every virtual card | `/vpc/v1/*` |
| [7](#7--ipc--intelligent-payment-controls-gen-ai) | **IPC — Gen-AI Rules** | Natural language → payment control rules | `POST /vpc/v1/ipc/suggest` |
| [8](#8--settlement) | **Settlement** | Multi-rail payment settlement with streaming | SDK-internal |
| [9](#9--mcp-server--ai-agent-interface) | **MCP Server** | All 20 capabilities exposed to AI agents via natural language + guardrails | stdio transport |
| [10](#10--b2b-ap-agent-mcp-server) | **B2B AP Agent MCP Server** | Dedicated server for AP workflow agents — BIP, SIP, guardrails, live Resources | stdio transport |

---

## Testing

<div align="center">
  <img src="./demo.gif" alt="SDK test suite demo" width="820" style="border-radius:12px;border:2px solid #1A1F71;box-shadow:0 8px 32px rgba(26,31,113,0.25);" />
</div>

### Unified runner

```
node run-tests.js [suite...] [--list] [--help]
```

| Key | Suite | Real endpoints |
|-----|-------|----------------|
| `vcn` | B2B Virtual Account Payments | `POST /vpa/v1/cards/provisioning` |
| `vpa` | Full VPA Account Management | `/vpa/v1/buyerManagement/*`, `/vpa/v1/accountManagement/*` |
| `bip` / `sip` | BIP & SIP Payment Flows | `POST /vpa/v1/paymentService/processPayments` |
| `sms` | Visa Supplier Match Service | `POST /visasuppliermatchingservice/v1/search` |
| `ai` | AI Supplier Evaluation | SDK-internal |
| `vpc` | Visa B2B Payment Controls | `/vpc/v1/*` |
| `ipc` | IPC — Gen-AI Rules | `POST /vpc/v1/ipc/suggest`, `POST /vpc/v1/ipc/apply` |
| `settlement` | Settlement | SDK-internal |

**Output legend:**

| Colour | Label | Meaning |
|--------|-------|---------|
| Green | `LIVE` | Real Visa sandbox returned 2xx — raw JSON shown |
| Yellow | `WARN` | Reached endpoint; business validation error (400/422) |
| Purple | `MOCK` | Endpoint requires additional provisioning |

---

## 1 · B2B Virtual Account Payments

> Issue a virtual card number (PAN) that only works for a specific supplier, amount range, time window, and merchant category — and expires automatically.

### How it works

```mermaid
sequenceDiagram
    participant Gov as 🏛️ Government Agency
    participant SDK as @visa-gov/sdk
    participant Visa as ⚡ Visa Network

    Gov->>SDK: requestVirtualCard(payload)
    Note over SDK: Validate · Build rules<br/>(SPV, MCC, CHN, BHR…)
    SDK->>Visa: POST /vpa/v1/cards/provisioning
    Visa-->>SDK: { accountNumber, proxyNumber, cvv2 }
    SDK-->>Gov: VCNRequestResponse
    Note over Gov: Share PAN with supplier
    Gov->>Visa: Supplier charges virtual card
    Visa->>Visa: Enforce embedded rules ⚡
    Visa-->>Gov: Approved ✅ or Declined ❌
```

### Code

```ts
import { VCNService, buildSPVRule, buildBlockRule, buildAmountRule } from '@visa-gov/sdk';

const vcn = new VCNService();  // sandbox — no credentials needed

const response = await vcn.requestVirtualCard({
  clientId:      'B2BWS_1_1_9999',
  buyerId:       '9999',
  messageId:     Date.now().toString(),
  action:        'A',
  numberOfCards: '1',
  proxyPoolId:   'Proxy12345',
  requisitionDetails: {
    startDate: '2025-06-01',
    endDate:   '2025-06-30',
    timeZone:  'UTC-5',
    rules: [
      buildSPVRule({ spendLimitAmount: 50_000, maxAuth: 5, currencyCode: '840', rangeType: 'monthly' }),
      buildAmountRule('PUR', 10_000, '840'),   // max $10k per transaction
      buildBlockRule('ECOM'),                   // no online purchases
      buildBlockRule('ATM'),                    // no cash withdrawals
    ],
  },
});

console.log(response.responseCode);              // "00" = success
console.log(response.accounts[0].accountNumber); // Virtual card PAN
console.log(response.accounts[0].expiryDate);    // MM/YYYY
console.log(response.accounts[0].proxyNumber);   // Proxy reference
```

**Connect to the live Visa API:**

```ts
const response = await vcn.requestVirtualCard(payload, {
  baseUrl:     'https://sandbox.api.visa.com',
  credentials: { userId: process.env.VISA_USER_ID!, password: process.env.VISA_PASSWORD! },
  tls: {
    cert: fs.readFileSync('./certs/cert.pem', 'utf-8'),
    key:  fs.readFileSync('./certs/privateKey-....pem', 'utf-8'),
    ca:   caBundle,
  },
});
```

### Rule reference

<details>
<summary>📋 Expand rule code reference</summary>

| Code | Category | Description |
|------|----------|-------------|
| `SPV` | Spending | Spend velocity — rolling period limit + auth count cap |
| `PUR` | Spending | Single-purchase amount cap |
| `EAM` | Spending | Exact amount match |
| `VPAS` | Spending | Virtual payment account specific — exact match with tolerance |
| `TOLRNC` | Spending | Tolerance band — min/max delta around expected amount |
| `XBRA` | Spending | Cross-border amount cap |
| `ATML` | Spending | ATM cash withdrawal limit |
| `CAID` | Merchant | Lock card to a single Card Acceptor ID |
| `HOT` | Merchant | Block hotels / lodging |
| `AUTO` | Merchant | Block auto dealers / rentals |
| `AIR` | Merchant | Block airlines |
| `ECOM` | Channel | Block e-commerce / online |
| `ATM` | Channel | Block ATM cash withdrawals |
| `CNP` | Channel | Block card-not-present |
| `XBR` | Channel | Block cross-border transactions |
| `NOC` | Other | No controls — open card |

</details>

---

## 2 · Full VPA Account Management

> The full B2B Virtual Account Payment lifecycle — from onboarding a buyer to reconciling payments — mapped 1:1 to Visa API endpoints.

### The procurement payment lifecycle

```mermaid
flowchart LR
    A["🏛️ Create Buyer\n/buyerManagement/buyer/create"] -->
    B["🏦 Add Funding Account\n/accountManagement/fundingAccount/add"] -->
    C["🗂️ Create Proxy Pool\n/suaPoolMaintenance/proxyPool/create"] -->
    D["🏢 Onboard Supplier\n/supplierManagement/supplier/create"] -->
    E["💳 Issue Virtual Card\n/accountManagement/VirtualCardRequisition"] -->
    F["💸 Process Payment\n/paymentService/processPayments"] -->
    G["📊 Reconcile\n/paymentService/getPaymentDetails"]
```

```ts
import { VPAService } from '@visa-gov/sdk';

const vpa = new VPAService({ baseUrl, credentials, tls });  // or VPAService.sandbox()

// 1 — Create a buyer (government agency profile)
const buyer = await vpa.Buyer.createBuyer({
  clientId:   'GOV-AGENCY-001',
  buyerName:  'Ministry of Health',
  currencyCode: '840',
});

// 2 — Add the agency's funding bank account
const account = await vpa.FundingAccount.addFundingAccount({
  clientId: buyer.clientId,
  buyerId:  buyer.buyerId,
  accountNumber: '4111111111111111',
});

// 3 — Create a proxy pool (pre-provisioned card numbers)
const pool = await vpa.ProxyPool.createProxyPool({
  clientId:    buyer.clientId,
  proxyPoolId: 'HEALTH-POOL-2025',
  size:        100,
});

// 4 — Onboard a supplier
const supplier = await vpa.Supplier.createSupplier({
  clientId:     buyer.clientId,
  supplierName: 'MedEquip Co.',
  accountNumber: '4222222222222222',
});

// 5 — Issue a virtual card for the purchase
const requisition = await vpa.FundingAccount.requestVirtualAccount({
  clientId:   buyer.clientId,
  buyerId:    buyer.buyerId,
  proxyPoolId: pool.proxyPoolId,
  amount:     48_500,
  currencyCode: '840',
});

// 6 — Process the payment to the supplier
const payment = await vpa.Payment.processPayment({
  clientId:   buyer.clientId,
  buyerId:    buyer.buyerId,
  supplierId: supplier.supplierId,
  amount:     48_500,
  currencyCode: '840',
  paymentMethod: 'SIP',
});
```

---

## 3 · BIP & SIP Payment Flows

> Two opposing directions of B2B payment initiation — both running on Visa VPA rails.

### BIP — Buyer Initiated Payment

The buyer provisions a single-use virtual card locked to the invoice and pushes it to the supplier before any charge happens.

```mermaid
sequenceDiagram
    participant Buyer as 🏛️ Buyer (Gov Agency)
    participant SDK   as B2BPaymentService.BIP
    participant Visa  as ⚡ Visa API
    participant Supp  as 🏢 Supplier

    Buyer->>SDK: BIP.initiate({ supplierId, paymentAmount, invoiceNumber })
    SDK->>Visa: POST /vpa/v1/paymentService/processPayments<br/>(paymentDeliveryMethod: BIP)
    Visa-->>SDK: { paymentId, accountNumber, expiryDate }
    SDK->>Visa: POST /vpa/v1/paymentService/getPaymentDetailURL
    Visa-->>SDK: { url, expiresAt }
    SDK-->>Buyer: BIPPayment { virtualCard, paymentDetailUrl }
    Buyer->>Supp: Share paymentDetailUrl
    Supp->>Visa: Charge virtual card
    Visa-->>Buyer: Settlement notification ✅
```

```ts
import { B2BPaymentService } from '@visa-gov/sdk';

const b2b = B2BPaymentService.sandbox();

// Buyer provisions a locked virtual card for this invoice
const payment = await b2b.BIP.initiate({
  messageId:     crypto.randomUUID(),
  clientId:      'B2BWS_1_1_9999',
  buyerId:       '9999',
  supplierId:    'SUPP-001',
  paymentAmount: 4_750.00,
  currencyCode:  '840',
  invoiceNumber: 'INV-2026-042',
  memo:          'Q2 medical equipment',
});

console.log(payment.virtualCard?.accountNumber);  // 4xxx xxxx xxxx xxxx
console.log(payment.paymentDetailUrl);            // supplier card-entry URL
```

### SIP — Supplier Initiated Payment

The supplier submits an invoice and waits for the buyer to approve.

```mermaid
sequenceDiagram
    participant Supp  as 🏢 Supplier
    participant SDK   as B2BPaymentService.SIP
    participant Visa  as ⚡ Visa API
    participant Buyer as 🏛️ Buyer (Gov Agency)

    Supp->>SDK: SIP.submitRequest({ invoiceNumber, requestedAmount, startDate, endDate })
    SDK->>Visa: POST /vpa/v1/requisitionService<br/>(paymentDeliveryMethod: SIP)
    Visa-->>SDK: { requisitionId, accountNumber, expiryDate }
    SDK-->>Supp: SIPRequisition { status: pending_approval, virtualAccount }
    Visa-->>Buyer: Notification — new payment request
    Buyer->>SDK: SIP.approve({ requisitionId, approvedAmount })
    SDK->>Visa: POST /vpa/v1/paymentService/processPayments<br/>(requisitionId, SIP)
    Visa-->>SDK: { paymentId, status: approved }
    SDK-->>Buyer: SIPApprovalResult ✅
    Visa-->>Supp: Funds on virtual account
```

```ts
// Supplier side
const req = await b2b.SIP.submitRequest({
  messageId:       crypto.randomUUID(),
  clientId:        'B2BWS_1_1_9999',
  supplierId:      'SUPP-001',
  buyerId:         '9999',
  requestedAmount: 2_300.00,
  currencyCode:    '840',
  invoiceNumber:   'INV-SUPP-2026-007',
  startDate:       '2026-04-01',
  endDate:         '2026-04-30',
});

// Buyer side — approve and settle
const result = await b2b.SIP.approve({
  messageId:      crypto.randomUUID(),
  clientId:       'B2BWS_1_1_9999',
  buyerId:        '9999',
  requisitionId:  req.requisitionId,
  approvedAmount: 2_300.00,
  currencyCode:   '840',
});
```

### BIP vs SIP — at a glance

| | BIP (Buyer Initiated) | SIP (Supplier Initiated) |
|---|---|---|
| **Who starts it** | Buyer | Supplier |
| **Card direction** | Buyer provisions → pushed to supplier | VPA provisions → issued to supplier |
| **Use case** | POs, fixed-cost contracts | Invoice-driven, milestone billing |
| **SDK method** | `b2b.BIP.initiate()` | `b2b.SIP.submitRequest()` + `.approve()` |

---

## 4 · Visa Supplier Match Service (SMS)

> One API call returns whether a supplier accepts Visa, at what confidence level, and their MCC code — flowing directly into the AI scoring model.

### How it works

```mermaid
sequenceDiagram
    participant App  as Your App
    participant SDK  as VisaNetworkService
    participant Visa as ⚡ Visa SMS API

    App->>SDK: check({ supplierName, supplierCountryCode })
    SDK->>Visa: POST /visasuppliermatchingservice/v1/search
    Visa-->>SDK: { matchStatus, matchConfidence, matchDetails }
    SDK-->>App: VisaNetworkCheckResult

    Note over App: visaAcceptMark    → true/false<br/>confidenceScore  → 0–100<br/>mcc              → "5047"<br/>supportsL2       → true
```

### Confidence → Score mapping

```
matchConfidence   matchStatus   visaMatchScore   Meaning
──────────────────────────────────────────────────────────────
High              Yes           ████████████ 95  Strongly registered
Medium            Yes           ████████     70  Registered, lower certainty
Low               Yes           █████        45  Possibly registered
None / No         No            ░░░░░░░░░░░░  0  Not found
```

### Code

```ts
import { VisaNetworkService } from '@visa-gov/sdk';

const visa = VisaNetworkService.sandbox();

// Single check
const result = await visa.check({
  supplierName:        'MedEquip Co.',
  supplierCountryCode: 'US',
  supplierCity:        'New York',
});
console.log(result.visaAcceptMark);   // true
console.log(result.confidenceScore);  // 95
console.log(result.mcc);              // "5047"

// Batch check (parallel, ≤10 concurrent)
const batch = await visa.bulkCheck([
  { supplierName: 'MedEquip Co.',        supplierCountryCode: 'US' },
  { supplierName: 'HealthTech Supplies', supplierCountryCode: 'US' },
  { supplierName: 'Budget Supplies Co',  supplierCountryCode: 'US' },
]);
// MedEquip Co.:        score=95  MCC=5047
// HealthTech Supplies: score=95  MCC=5047
// Budget Supplies Co:  score=0   MCC=          ← not registered

// Enrich supplier domain objects in bulk
const enriched = await visa.enrichSuppliers(suppliers, 'US');
```

**Connect to the real Visa SMS API:**

```ts
const visa = new VisaNetworkService({
  baseUrl:  'https://sandbox.api.visa.com',
  userId:   process.env.VISA_USER_ID!,
  password: process.env.VISA_PASSWORD!,
  cert:     fs.readFileSync('./certs/cert.pem', 'utf-8'),
  key:      fs.readFileSync('./certs/privateKey-....pem', 'utf-8'),
  ca:       caBundle,
});
```

---

## 5 · AI Supplier Evaluation

> A transparent, auditable AI scoring engine that evaluates every bid across 6 weighted dimensions — including live Visa network verification — and generates a plain-English narrative.

### Scoring model

```mermaid
graph LR
    subgraph Inputs["📥 Inputs"]
        P["💰 Bid Amount"]
        D["🚚 Delivery Days"]
        R["⭐ Past Performance"]
        C["📋 Compliance\n+ Certifications"]
        K["⚠️ Risk Score"]
        V["🔵 Visa Match Score"]
    end

    subgraph Weights["⚖️ Default Weights"]
        P --> W1["25% Price"]
        D --> W2["20% Delivery"]
        R --> W3["20% Reliability"]
        C --> W4["15% Compliance"]
        K --> W5["10% Risk"]
        V --> W6["10% Visa Match"]
    end

    W1 & W2 & W3 & W4 & W5 & W6 --> COMP["🏆 Composite Score\n0 – 100"]
    COMP --> RANK["📊 Ranked Bids + Narrative"]
```

### Code

```ts
import { SupplierMatcher, VisaNetworkService } from '@visa-gov/sdk';

// Basic evaluation
const matcher = new SupplierMatcher();
const result  = matcher.evaluate({
  rfp: { id: 'rfp-001', budgetCeiling: 50_000 },
  bids,
  suppliers,
});

console.log(result.winner.supplier.name);  // "MedEquip Co."
console.log(result.winner.composite);      // 87
console.log(result.narrative);
// "MedEquip Co. leads with a composite score of 87/100,
//  reflecting strong overall performance…"

// With live Visa registry verification
const matcher = SupplierMatcher.withVisaNetwork(VisaNetworkService.sandbox());
const { rankedBids, winner, visaChecks } = await matcher.evaluateWithVisaCheck({
  rfp: { id: 'rfp-001', budgetCeiling: 50_000 },
  bids,
  suppliers,
  countryCode: 'US',
});

for (const sb of rankedBids) {
  const vc = visaChecks.get(sb.supplier.id);
  console.log(`#${sb.rank}  ${sb.supplier.name}  composite=${sb.composite}  visaScore=${sb.dimensions.visaMatchScore}  MCC=${vc?.mcc}`);
}
// #1  MedEquip Co.             composite=83  visaScore=95  MCC=5047
// #2  HealthTech Supplies      composite=72  visaScore=95  MCC=5047
// #3  BudgetMed LLC            composite=58  visaScore=0   MCC=

// Custom weights (auto-normalised to sum 1.0)
const priceFocused = SupplierMatcher.withWeights({ price: 0.50 });
```

### End-to-end `evaluateWithVisaCheck` flow

```mermaid
sequenceDiagram
    participant App  as Your App
    participant SM   as SupplierMatcher
    participant VNS  as VisaNetworkService
    participant Visa as ⚡ Visa SMS API

    App->>SM: evaluateWithVisaCheck({ rfp, bids, suppliers })
    SM->>VNS: enrichSuppliers(suppliers, 'US')
    VNS->>Visa: bulkCheck (parallel, ≤10/batch)
    Visa-->>VNS: matchConfidence per supplier
    VNS-->>SM: enriched suppliers + confidenceScore
    SM->>SM: scoreBids() with visaMatchScore injected
    SM->>SM: generateNarrative(rankedBids)
    SM-->>App: EvaluationResult + visaChecks Map
```

---

## 6 · Visa B2B Payment Controls (VPC)

> Every transaction against a virtual card is evaluated against your rule set *before* it's approved — spend velocity, merchant category, channel, location, and business hours.

### Account state machine

```mermaid
stateDiagram-v2
    [*]          --> Registered   : createAccount()
    Registered   --> Active       : setRules()
    Active       --> Evaluating   : Transaction attempt
    Evaluating   --> Approved     : All rules pass ✅
    Evaluating   --> Declined     : Rule triggered ❌
    Active       --> Blocked      : blockAccount() [HOT]
    Blocked      --> Active       : enableRules()
    Active       --> Unrestricted : disableRules()
    Unrestricted --> Active       : enableRules()
    Approved     --> Active
    Declined     --> Active
```

### Rule categories

```
┌──────────────────────────────────────────────────────────┐
│                   VPC Rule Engine                        │
├──────────────┬───────────────────────────────────────────┤
│ 💰 Spending  │ SPV  Spend velocity (period + auth count) │
│              │ SPP  Max single-transaction amount        │
│              │ VPAS Exact amount match                   │
├──────────────┼───────────────────────────────────────────┤
│ 🏪 Merchant  │ MCC  Allow/block by category code         │
│              │ MCG  Allow/block by category group        │
├──────────────┼───────────────────────────────────────────┤
│ 📡 Channel   │ CHN  Online / POS / ATM / Contactless     │
├──────────────┼───────────────────────────────────────────┤
│ 🌍 Location  │ LOC  Country allow / block list           │
├──────────────┼───────────────────────────────────────────┤
│ 🕐 Time      │ BHR  Days of week + time range            │
├──────────────┼───────────────────────────────────────────┤
│ 🚫 Emergency │ HOT  Block ALL transactions instantly     │
└──────────────┴───────────────────────────────────────────┘
```

### Code

```ts
import { VPCService } from '@visa-gov/sdk';

const vpc = VPCService.sandbox();

// 1 · Register the virtual card
const account = await vpc.AccountManagement.createAccount({
  accountNumber: '4111111111111111',
  contacts: [{ name: 'Procurement Officer', email: 'proc@agency.gov', notifyOn: ['transaction_declined'] }],
});

// 2 · Set real-time rules
await vpc.Rules.setRules(account.accountId, [
  { ruleCode: 'SPV', spendVelocity: { limitAmount: 50_000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 20 } },
  { ruleCode: 'SPP', spendPolicy:   { maxTransactionAmount: 10_000, currencyCode: '840' } },
  { ruleCode: 'MCC', mcc:           { allowedMCCs: ['5047', '5122', '8099'] } },
  { ruleCode: 'CHN', channel:       { allowOnline: false, allowPOS: true, allowATM: false } },
  { ruleCode: 'BHR', businessHours: { allowedDays: [1,2,3,4,5], startTime: '08:00', endTime: '18:00', timezone: 'America/New_York' } },
]);

// 3 · Emergency block / unblock
await vpc.Rules.blockAccount(account.accountId);   // 🚫 HOT — instant block
await vpc.Rules.enableRules(account.accountId);    // ✅ re-enable

// 4 · Report on declined transactions
const declined = await vpc.Reporting.getTransactionHistory(account.accountId, { outcome: 'declined' });
for (const t of declined) {
  console.log(`❌ $${t.amount} @ ${t.merchantName} — Rule: [${t.declineReason}] ${t.declineMessage}`);
}
```

---

## 7 · IPC — Intelligent Payment Controls (Gen-AI)

> Describe card usage in plain English. Gen-AI translates your intent into a ready-to-apply `VPCRule[]` with a rationale and confidence score.

### How it works

```mermaid
sequenceDiagram
    participant Officer as 👤 Procurement Officer
    participant IPC     as vpc.IPC (Gen-AI)
    participant Visa    as ⚡ Visa VPC API

    Officer->>IPC: getSuggestedRules({ prompt: "Medical procurement, $50k/mo, no ATM" })
    IPC->>Visa: POST /vpc/v1/ipc/suggest
    Visa-->>IPC: [ { ruleSetId, rules[], rationale, confidence } ]
    IPC-->>Officer: IPCRuleSetResponse

    Note over Officer: Review rationale + confidence score<br/>Pick the best suggestion

    Officer->>IPC: setSuggestedRules(ruleSetId, accountId)
    IPC->>Visa: POST /vpc/v1/ipc/apply
    Visa-->>IPC: Updated VPCAccount
    IPC-->>Officer: Rules applied ✅
```

### From prompt to rule set

```
Prompt: "Medical equipment procurement, max $50k/month, domestic, no ATM"
                               │
                   ┌───────────▼──────────┐
                   │   Gen-AI Rule Engine  │
                   │  • Category → Medical │
                   │  • Limit    → $50,000 │
                   │  • Channel  → no ATM  │
                   │  • Geography→ domestic│
                   └───────────┬──────────┘
                               │
          ┌────────────────────▼────────────────────┐
          │         Suggested Rule Set               │
          │  ruleSetId:  ipc-tpl-medical             │
          │  confidence: 94 / 100                    │
          │                                          │
          │  rules:                                  │
          │  • SPV  $50,000/month · max 50 auths     │
          │  • MCC  allow [5047, 5122, 8099, 8049]   │
          │  • CHN  POS=✓  Online=✓  ATM=✗           │
          │                                          │
          │  rationale:                              │
          │  "Medical procurement: healthcare MCCs   │
          │   allowed; $50,000/month; POS and        │
          │   online; ATM blocked."                  │
          └─────────────────────────────────────────┘
```

### Built-in sandbox templates

| Keyword in prompt | Template | Confidence | Monthly limit |
|-------------------|----------|:----------:|:-------------:|
| `medical`, `health`, `pharma` | Medical Procurement | 94% | $50,000 |
| `travel`, `airline`, `hotel` | Travel | 88% | $10,000 |
| `office`, `stationery`, `supplies` | Office Supplies | 91% | $2,000 |
| `IT`, `software`, `cloud`, `tech` | IT Services | 89% | $25,000 |
| *(anything else)* | General Purpose | 75% | $5,000 |

### Code

```ts
// Get AI-generated rule suggestions
const { suggestions } = await vpc.IPC.getSuggestedRules({
  prompt:       'Medical equipment procurement, max $50k per month, no ATM',
  currencyCode: '840',
});

console.log(suggestions[0].confidence);  // 94
console.log(suggestions[0].rationale);
// "Medical procurement: healthcare MCCs allowed; $50,000/month; POS and online; ATM blocked."

// Apply with one call — rules go live in near real-time
await vpc.IPC.setSuggestedRules(suggestions[0].ruleSetId, account.accountId);
```

---

## 8 · Settlement

> After a virtual card purchase, `SettlementService` models the full Visa settlement lifecycle with streaming state for real-time UI updates.

### Settlement flow

```
  Initiated ──────────────────────────────────── Settled
     │                  │                  │         │
     ●──────────────────●──────────────────●─────────●
  [idle]         [authorized]       [processing]  [settled]
    0%               33%                66%          100%
```

```mermaid
sequenceDiagram
    participant App  as Your App
    participant SS   as SettlementService
    participant Rail as 💳 Visa Rail

    App->>SS: settle({ method: 'USD', orderId, amount })
    SS->>Rail: Authorize payment
    Rail-->>SS: authorized (33%)
    SS->>Rail: Process settlement
    Rail-->>SS: processing (66%)
    SS->>Rail: Confirm settlement
    Rail-->>SS: settled (100%)
    SS-->>App: SettlementResult { settledAt, durationMs }
```

### Code

```ts
import { SettlementService } from '@visa-gov/sdk';

const service = new SettlementService();

// Automated (fire-and-forget)
const result = await service.settle({ method: 'USD', orderId: 'ORD-001', amount: 48_500 });
console.log(`Settled in ${result.durationMs}ms at ${result.settledAt}`);

// Streaming (real-time UI updates)
const session = service.initiate({ method: 'Card', orderId: 'ORD-002', amount: 12_000 });

for await (const state of session.stream(1_500)) {  // 1.5s per step
  console.log(`${state.progress}% — ${state.currentStep}`);
  updateProgressBar(state.progress);
}
// 33% — authorized
// 66% — processing
// 100% — settled
```

---

## 9 · MCP Server — AI Agent Interface

> Every SDK capability is available to AI agents as a natural-language tool, with built-in two-phase guardrails on every operation that issues real cards or moves money.

The MCP server is part of the SDK — no separate package. Build it once and wire it into any MCP-compatible client in seconds.

### Quick install

```bash
# Build the MCP server
npm run build:mcp

# Sandbox mode — no credentials needed, uses realistic mock responses
claude mcp add --transport stdio visa-gov \
  -- node /path/to/visa-gov-sdk/mcp/dist/index.js

# Live mode — Visa Sandbox API with mTLS
claude mcp add --transport stdio visa-gov \
  -e VISA_USER_ID=your-user-id \
  -e VISA_PASSWORD=your-password \
  -e VISA_BASE_URL=https://sandbox.api.visa.com \
  -e VISA_CERT_PATH=/path/to/cert.pem \
  -e VISA_KEY_PATH=/path/to/privateKey.pem \
  -e VISA_CA_PATH=/path/to/ca-bundle.pem \
  -e SANDBOX_MODE=false \
  -- node /path/to/visa-gov-sdk/mcp/dist/index.js
```

Use `--scope user` to keep credentials out of the shared `.mcp.json`:

```bash
claude mcp add --transport stdio visa-gov \
  --scope user \
  -e VISA_USER_ID=xxx -e VISA_PASSWORD=yyy \
  -- node /path/to/visa-gov-sdk/mcp/dist/index.js
```

### Available tools

| Tool | Group | Confirmation | Description |
|------|-------|:------------:|-------------|
| `sms_check_supplier` | Supplier Intelligence | — | Check Visa network registration, confidence score, MCC |
| `sms_bulk_check_suppliers` | Supplier Intelligence | — | Batch check up to 10 suppliers in parallel |
| `ai_evaluate_bids` | Supplier Intelligence | — | Score and rank RFP bids with live Visa SMS verification |
| `vpc_suggest_rules` | Payment Controls | — | Gen-AI: translate a description into a VPC rule set |
| `vpc_apply_rules` | Payment Controls | — | Apply a suggested rule set to an account |
| `vpc_set_rules_manual` | Payment Controls | — | Manually set payment control rules |
| `vpc_get_rules` | Payment Controls | — | Get current rules for a VPC account |
| `vpc_block_account` | Payment Controls | — | Emergency HOT block — all transactions suspended instantly |
| `vpc_create_account` | Payment Controls | — | Register a virtual card account with VPC |
| `vpc_get_transaction_history` | Payment Controls | — | Transaction history, optionally filtered by outcome |
| `vcn_issue_virtual_card` | Virtual Card Issuance | **Required** | Issue a Visa virtual card (PAN) with embedded spending rules |
| `bip_initiate_payment` | B2B Payments | **Required** | Initiate a Buyer-Initiated Payment (BIP) |
| `bip_get_status` | B2B Payments | — | Get current status of a BIP payment |
| `bip_cancel_payment` | B2B Payments | — | Cancel a pending BIP payment |
| `sip_submit_request` | B2B Payments | — | Supplier submits a payment requisition |
| `sip_approve_payment` | B2B Payments | **Required** | Buyer approves a SIP requisition — triggers fund movement |
| `sip_reject_payment` | B2B Payments | — | Buyer rejects a supplier payment requisition |
| `settlement_initiate` | Settlement | — | Settle a payment on Visa rails (USD or Card) |
| `vpa_create_buyer` | VPA Management | — | Create a government agency buyer profile |
| `vpa_process_payment` | VPA Management | — | Process a VPA payment from buyer to supplier |

### Guardrail system

Three tools require explicit human confirmation before executing — they issue real payment credentials or move funds:

- **`vcn_issue_virtual_card`** — issues a Visa PAN (real card number + CVV)
- **`bip_initiate_payment`** — provisions a virtual card locked to a specific invoice
- **`sip_approve_payment`** — approves a supplier requisition and triggers fund movement

**Phase 1 — Dry run** (no `confirmationToken`): validates all inputs, returns a full preview and a time-limited `confirmationToken`. No Visa API call is made.

**Phase 2 — Execute** (pass the token back): validates the token is fresh (< 5 min), matches the exact parameters from Phase 1 (SHA-256 hash), and hasn't been used before — then calls the SDK.

```
Token format:  <tool-name>:<sha256(params)>:<unix-timestamp-ms>

Security:
  Expiry            tokens expire after 5 minutes
  Tamper detection  hash of params embedded in token — any change invalidates it
  Replay prevention token consumed on first use, rejected on any re-use
  Cross-tool lock   a BIP token cannot execute a VCN call, and vice versa
```

**Example conversation session:**

<div align="center">
  <img src="./mcp_demo.gif" alt="MCP card issuance demo" width="820" style="border-radius:12px;border:2px solid #7C3AED;box-shadow:0 8px 32px rgba(124,58,237,0.25);" />
</div>

### Live example — card issuance via MCP

A complete card issuance in three natural-language calls. No code required.

**Step 1 — Create a buyer profile**

```
"Create a buyer called Test Agency"
→ vpa_create_buyer({ clientId: "CORP_001", buyerName: "Test Agency", currencyCode: "USD" })
```

```json
{
  "buyerId": "f5f81996-6891-4e65-b046-0a7c685a46e2",
  "buyerName": "Test Agency",
  "billingCurrency": "USD",
  "status": "active",
  "createdAt": "2026-04-15T22:51:56.907Z"
}
```

**Step 2 — Issue virtual card (Phase 1 — preview)**

```
"Issue a virtual card for buyer f5f81996, valid April–July 2026,
 max $5,000 USD, merchant categories 5411 and 5812 only"
→ vcn_issue_virtual_card({ clientId, buyerId, proxyPoolId, startDate, endDate, rules })
```

```json
{
  "requiresConfirmation": true,
  "preview": {
    "period": "2026-04-15 → 2026-07-15",
    "numberOfCards": "1",
    "rulesCount": 2,
    "rules": [
      { "type": "maxAmount", "value": 5000, "currency": "USD" },
      { "type": "merchantCategory", "allowed": ["5411", "5812"] }
    ]
  },
  "confirmationToken": "vcn_issue_virtual_card:<sha256>:<timestamp>"
}
```

> The guardrail returns a full preview and a time-limited token. No card is issued yet.

**Step 3 — Confirm and issue (Phase 2 — execute)**

```
"Confirm"
→ vcn_issue_virtual_card({ ...same params, confirmationToken })
```

```json
{
  "responseCode": "00",
  "responseMessage": "Virtual card(s) issued successfully",
  "accounts": [
    {
      "accountNumber": "4039 •••• •••• 6825",
      "proxyNumber": "PRXEKLOSRSC",
      "expiryDate": "04/2029",
      "cvv2": "•••",
      "status": "active"
    }
  ],
  "sandboxMode": true
}
```

The token is consumed on use — passing it a second time returns an error, preventing accidental double-issuance.

### Environment variables

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `VISA_USER_ID` | Live only | — | Visa API username (Two-Way SSL section) |
| `VISA_PASSWORD` | Live only | — | Visa API password |
| `VISA_BASE_URL` | No | `https://sandbox.api.visa.com` | Visa API base URL |
| `VISA_CERT_PATH` | Live only | — | Path to client certificate PEM |
| `VISA_KEY_PATH` | Live only | — | Path to private key PEM |
| `VISA_CA_PATH` | No | — | Path to CA bundle PEM (optional) |
| `SANDBOX_MODE` | No | `"true"` when certs absent | `"true"` = mock responses, `"false"` = live |

If `VISA_CERT_PATH` or `VISA_KEY_PATH` are absent the server falls back to sandbox mode automatically, regardless of `SANDBOX_MODE`.

### Natural language examples

```
# Supplier verification
"Check if MedEquip Co. is registered in the Visa network"
"Run Visa network checks on all 5 suppliers from this RFP"

# Bid evaluation
"Evaluate these 3 bids for our Q3 medical equipment procurement"
"Who wins the bid? Show scores and reasoning."

# Payment controls
"Set up a medical procurement card — $50k/month limit, no ATM"
"Emergency block account ACC-12345 — suspected fraud"

# Virtual card (guardrail — shows preview before issuing)
"Issue a virtual card for MedEquip Co., $48,500, valid June 2026 only"

# BIP payment (guardrail — shows preview before initiating)
"Initiate a BIP payment of $12,000 to HealthTech for invoice INV-2026-007"

# Full flow
"Evaluate our 3 bidders, issue a card to the winner, and settle payment"
```

### Running the MCP tests

```bash
npm run build:mcp

# All tools smoke test — 20 cases
node mcp/dist/test-tools.js

# Guardrail security tests — 7 adversarial cases
node mcp/dist/test-guardrails.js
```

### Troubleshooting

| Problem | Fix |
|---------|-----|
| "Connection closed" on Windows | Use `cmd /c node ...` instead of `node ...` |
| nvm PATH issues | Use the absolute path: `which node` |
| "mTLS handshake failed" | Verify cert/key match: `openssl x509 -noout -modulus -in cert.pem \| md5` vs `openssl rsa -noout -modulus -in key.pem \| md5` |
| Token expired | Re-run without token to get a fresh one — tokens expire after 5 minutes |
| Server doesn't start | Requires Node.js ≥ 20: `node --version` |

---

## End-to-end: Full Government Procurement Flow

> From supplier discovery to payment settlement in a single script.

```mermaid
graph TD
    A["🤖 AI Evaluation\nSupplierMatcher.evaluateWithVisaCheck()"] -->|Winner selected| B
    B["🔒 IPC Gen-AI\nvpc.IPC.getSuggestedRules()"] -->|Rules generated| C
    C["💳 Issue Virtual Card\nvcn.requestVirtualCard()"] -->|PAN + rules active| D
    D["✅ Settle Payment\nservice.settle()"] -->|Done| E["🏦 Payment Settled\non Visa Rails"]

    style A fill:#7C3AED,color:#fff
    style B fill:#059669,color:#fff
    style C fill:#2563EB,color:#fff
    style D fill:#D97706,color:#fff
    style E fill:#1A1F71,color:#fff
```

```ts
import {
  SupplierMatcher, VisaNetworkService, VCNService,
  VPCService, SettlementService, buildSPVRule,
} from '@visa-gov/sdk';

const rfp = { id: 'rfp-001', budgetCeiling: 50_000 };

// 1 · Score suppliers with live Visa verification
const matcher = SupplierMatcher.withVisaNetwork(VisaNetworkService.sandbox());
const { winner } = await matcher.evaluateWithVisaCheck({ rfp, bids, suppliers });
console.log(`🏆 Winner: ${winner.supplier.name} (${winner.composite}/100)`);

// 2 · Use IPC Gen-AI to configure the card controls
const vpc     = VPCService.sandbox();
const account = await vpc.AccountManagement.createAccount({ accountNumber: '4111...' });
const { suggestions } = await vpc.IPC.getSuggestedRules({ prompt: 'Medical procurement, max $50k' });
await vpc.IPC.setSuggestedRules(suggestions[0].ruleSetId, account.accountId);

// 3 · Issue a virtual card for the winning supplier
const vcn  = new VCNService();
const card = await vcn.requestVirtualCard({
  clientId: 'GOV-001', buyerId: '9999',
  messageId: Date.now().toString(), action: 'A', numberOfCards: '1',
  proxyPoolId: 'POOL-01',
  requisitionDetails: {
    startDate: '2025-06-01', endDate: '2025-06-30', timeZone: 'UTC-5',
    rules: [buildSPVRule({ spendLimitAmount: winner.bid.amount, maxAuth: 3, currencyCode: '840', rangeType: 'monthly' })],
  },
});
console.log(`💳 Card: **** **** **** ${card.accounts[0].accountNumber.slice(-4)}`);

// 4 · Settle the payment
const result = await new SettlementService().settle({
  method: 'USD', orderId: `ORD-${rfp.id}`, amount: winner.bid.amount,
});
console.log(`✅ Settled $${result.amount.toLocaleString()} in ${result.durationMs}ms`);
```

---

## mTLS Connectivity

All Visa B2B APIs require **Two-Way SSL (mutual TLS)**. Use `createMtlsFetch` to build a pre-authenticated fetch function:

```ts
import { createMtlsFetch } from '@visa-gov/sdk';
import fs from 'fs';

const mtlsFetch = createMtlsFetch({
  cert: fs.readFileSync('./certs/cert.pem', 'utf-8'),
  key:  fs.readFileSync('./certs/privateKey-....pem', 'utf-8'),
  ca:   [
    fs.readFileSync('./certs/DigiCertGlobalRootG2.crt.pem', 'utf-8'),
    fs.readFileSync('./certs/SBX-2024-Prod-Root.pem', 'utf-8'),
    fs.readFileSync('./certs/SBX-2024-Prod-Inter.pem', 'utf-8'),
  ].join('\n'),
});

const visa = new VisaNetworkService({ baseUrl, userId, password, fetch: mtlsFetch });
```

Test connectivity:

```bash
node helloworld.js
# Visa Developer Platform — Hello World
# HTTP Status : 200
# { "message": "helloworld" }
# Connectivity test PASSED ✓
```

---

## API Reference

<details>
<summary>📘 VCNService</summary>

| Method | Returns | Description |
|--------|---------|-------------|
| `requestVirtualCard(payload, options?)` | `Promise<VCNRequestResponse>` | Issue virtual card(s) via Visa B2B VPA API |

</details>

<details>
<summary>📘 VPAService</summary>

| Sub-service | Key methods |
|-------------|-------------|
| `vpa.Buyer` | `createBuyer`, `updateBuyer`, `getBuyer`, `createTemplate`, `updateTemplate`, `getTemplate` |
| `vpa.FundingAccount` | `addFundingAccount`, `getFundingAccount`, `getSecurityCode`, `requestVirtualAccount`, `getAccountStatus`, `getPaymentControls`, `managePaymentControls` |
| `vpa.ProxyPool` | `createProxyPool`, `updateProxyPool`, `getProxyPool`, `deleteProxyPool`, `manageProxyPool` |
| `vpa.Supplier` | `createSupplier`, `updateSupplier`, `getSupplier`, `disableSupplier`, `manageSupplierAccount` |
| `vpa.Payment` | `processPayment`, `getPaymentDetails`, `resendPayment`, `cancelPayment`, `getPaymentDetailURL`, `createRequisition` |

</details>

<details>
<summary>📘 B2BPaymentService</summary>

| Sub-service | Key methods |
|-------------|-------------|
| `b2b.BIP` | `initiate`, `resend`, `getStatus`, `cancel` |
| `b2b.SIP` | `submitRequest`, `approve`, `reject` |

</details>

<details>
<summary>📘 VisaNetworkService</summary>

| Method | Returns | Description |
|--------|---------|-------------|
| `VisaNetworkService.sandbox()` | `VisaNetworkService` | Sandbox instance |
| `new VisaNetworkService(config)` | `VisaNetworkService` | Live instance |
| `check(request)` | `Promise<VisaNetworkCheckResult>` | Single supplier check |
| `bulkCheck(requests)` | `Promise<Map<name, result>>` | Parallel batch check |
| `enrichSupplier(supplier)` | `Promise<Supplier & { visaNetwork }>` | Add Visa data to supplier |
| `enrichSuppliers(suppliers, countryCode?)` | `Promise<EnrichedSupplier[]>` | Batch enrich |

</details>

<details>
<summary>📘 SupplierMatcher</summary>

| Method | Returns | Description |
|--------|---------|-------------|
| `evaluate({ rfp, bids, suppliers })` | `EvaluationResult` | Score + rank all bids |
| `evaluateWithVisaCheck(params)` | `Promise<EvaluationResult & { visaChecks }>` | Evaluate with live SMS verification |
| `scoreBids(bids, suppliers, rfp, visaScores?)` | `ScoredBid[]` | Score without wrapper |
| `scoreBid(bid, supplier, rfp, visaMatchScore?)` | `Partial<ScoredBid>` | Score single bid |
| `generateNarrative(ranked)` | `string` | AI explanation of winner |
| `generateOverrideNarrative(selected, best)` | `string` | Override warning |
| `getWeights()` | `ScoringWeights` | Active weight configuration |
| `SupplierMatcher.withWeights(partial)` | `SupplierMatcher` | Custom weights |
| `SupplierMatcher.withVisaNetwork(service)` | `SupplierMatcher` | Backed by Visa SMS |

</details>

<details>
<summary>📘 VPCService</summary>

| Sub-service | Key methods |
|-------------|-------------|
| `vpc.AccountManagement` | `createAccount`, `getAccount`, `updateAccount`, `deleteAccount` |
| `vpc.Rules` | `setRules`, `getRules`, `deleteRules`, `blockAccount`, `disableRules`, `enableRules` |
| `vpc.Reporting` | `getNotificationHistory`, `getTransactionHistory`, `injectTransaction` |
| `vpc.IPC` | `getSuggestedRules(prompt)`, `setSuggestedRules(ruleSetId, accountId)` |
| `vpc.SupplierValidation` | `registerSupplier`, `updateSupplier`, `retrieveSupplier` |

</details>

<details>
<summary>📘 SettlementService</summary>

| Method | Returns | Description |
|--------|---------|-------------|
| `initiate(params)` | `SettlementSession` | Create session |
| `settle(params, delayMs?)` | `Promise<SettlementResult>` | Auto-run full settlement |
| `getStepLabel(step)` | `string` | Human-readable step label |
| `session.advance()` | `SettlementState` | Move to next step |
| `session.stream(delayMs?)` | `AsyncGenerator` | Yield state after each step |
| `session.isSettled()` | `boolean` | True when complete |
| `session.reset()` | `void` | Reset to idle |

</details>

<details>
<summary>📘 MCP Server — tool index</summary>

| Tool | Confirmation | SDK call |
|------|:------------:|---------|
| `sms_check_supplier` | — | `visaNetwork.check()` |
| `sms_bulk_check_suppliers` | — | `visaNetwork.bulkCheck()` |
| `ai_evaluate_bids` | — | `supplierMatcher.evaluateWithVisaCheck()` |
| `vpc_suggest_rules` | — | `vpcService.IPC.getSuggestedRules()` |
| `vpc_apply_rules` | — | `vpcService.IPC.setSuggestedRules()` |
| `vpc_set_rules_manual` | — | `vpcService.Rules.setRules()` |
| `vpc_get_rules` | — | `vpcService.Rules.getRules()` |
| `vpc_block_account` | — | `vpcService.Rules.blockAccount()` |
| `vpc_create_account` | — | `vpcService.AccountManagement.createAccount()` |
| `vpc_get_transaction_history` | — | `vpcService.Reporting.getTransactionHistory()` |
| `vcn_issue_virtual_card` | **Yes** | `vcnService.requestVirtualCard()` |
| `bip_initiate_payment` | **Yes** | `b2bService.BIP.initiate()` |
| `bip_get_status` | — | `b2bService.BIP.getStatus()` |
| `bip_cancel_payment` | — | `b2bService.BIP.cancel()` |
| `sip_submit_request` | — | `b2bService.SIP.submitRequest()` |
| `sip_approve_payment` | **Yes** | `b2bService.SIP.approve()` |
| `sip_reject_payment` | — | `b2bService.SIP.reject()` |
| `settlement_initiate` | — | `settlementService.settle()` |
| `vpa_create_buyer` | — | `vpaService.Buyer.createBuyer()` |
| `vpa_process_payment` | — | `vpaService.Payment.processPayment()` |

</details>

---

## 10 · B2B AP Agent MCP Server

> A standalone MCP server purpose-built for **internal AP workflow agents** — procurement systems that already integrate with AI agents can wire this up independently from the full SDK server to get focused, finance-domain B2B payment tooling with zero noise from card issuance or supplier scoring.

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&pause=1200&color=0EA5E9&center=true&vCenter=true&width=680&lines=Initiate+supplier+payments+via+natural+language;Two-phase+guardrails+on+every+money-moving+action;BIP+%C2%B7+SIP+%C2%B7+Approve+%C2%B7+Reject+%C2%B7+Track;Live+payment+queue+as+MCP+Resources;Wires+into+any+MCP-compatible+procurement+system" alt="B2B AP typing animation" />

</div>

### How it fits

```
  Procurement System (ERP / AP workflow)
  ────────────────────────────────────────────────────────────────────
  AI Agent (Claude, Cursor, or any MCP client)
       │
       │  stdio
       ▼
  ┌─────────────────────────────────────────┐
  │     visa-b2b-ap  MCP Server             │
  │                                         │
  │  Tools (8)                Resources (2) │
  │  ─────────────────────────────────────  │
  │  bip_initiate_payment  ★   b2b://pending-requisitions  │
  │  bip_get_status            b2b://payment-history       │
  │  bip_cancel_payment                     │
  │  bip_resend_payment                     │
  │  sip_submit_request                     │
  │  sip_get_status                         │
  │  sip_approve_payment   ★                │
  │  sip_reject_payment                     │
  │                                         │
  │  ★ two-phase guardrail required         │
  └─────────────────────────────────────────┘
       │
       │  mTLS (live) / sandbox (mock)
       ▼
  ⚡ Visa VPA Network
```

### Quick install

```bash
# Build
npm run build:mcp:b2b

# Sandbox mode — no credentials, realistic mock responses
claude mcp add --transport stdio visa-b2b-ap \
  -- node /path/to/visa-gov-sdk/mcp/b2b/dist/server.js

# Live mode — Visa B2B API with mTLS
claude mcp add --transport stdio visa-b2b-ap \
  -e VISA_USER_ID=your-user-id \
  -e VISA_PASSWORD=your-password \
  -e VISA_BASE_URL=https://sandbox.api.visa.com \
  -e VISA_CERT_PATH=/path/to/cert.pem \
  -e VISA_KEY_PATH=/path/to/privateKey.pem \
  -e VISA_CA_PATH=/path/to/ca-bundle.pem \
  -e SANDBOX_MODE=false \
  -- node /path/to/visa-gov-sdk/mcp/b2b/dist/server.js
```

Use `--scope user` to keep credentials out of shared `.mcp.json`:

```bash
claude mcp add --transport stdio visa-b2b-ap \
  --scope user \
  -e VISA_USER_ID=xxx -e VISA_PASSWORD=yyy \
  -- node /path/to/visa-gov-sdk/mcp/b2b/dist/server.js
```

### Available tools

| Tool | Flow | Confirmation | Description |
|------|------|:------------:|-------------|
| `bip_initiate_payment` | BIP | **Required** | Provision a virtual card locked to an invoice and push it to the supplier |
| `bip_get_status` | BIP | — | Get current status and details of a BIP payment |
| `bip_cancel_payment` | BIP | — | Cancel a pending BIP payment (valid while status is pending or unmatched) |
| `bip_resend_payment` | BIP | — | Resend the card notification to the supplier |
| `sip_submit_request` | SIP | — | Supplier submits a payment requisition — buyer is notified for approval |
| `sip_get_status` | SIP | — | Get current status of a SIP requisition |
| `sip_approve_payment` | SIP | **Required** | Buyer approves a requisition — triggers fund movement on Visa VPA rails |
| `sip_reject_payment` | SIP | — | Buyer rejects a supplier payment requisition |

### MCP Resources

Resources are read-only context an agent can query **at any time** without consuming a tool call. Both resources are backed by the server's in-memory registry, automatically updated as tools execute.

| Resource URI | Description |
|-------------|-------------|
| `b2b://pending-requisitions` | SIP requisitions currently awaiting buyer approval — `{ count, requisitions[], retrievedAt }` |
| `b2b://payment-history` | Full session history — all BIP payments + all SIP requisitions, newest-first, with status breakdown |

**Example: agent reads context before acting**
```
Agent: "How many supplier requests are waiting for my approval?"
→ reads b2b://pending-requisitions
← { count: 3, requisitions: [...] }

Agent: "Show me the full payment history"
→ reads b2b://payment-history
← { bip: { total: 5 }, sip: { total: 4, pending: 1, approved: 2, rejected: 1 } }
```

### Guardrail system

Two tools require explicit confirmation before executing — they move real funds:

- **`bip_initiate_payment`** — provisions a Visa virtual card and pushes it to the supplier
- **`sip_approve_payment`** — approves a supplier requisition and triggers settlement

```
Phase 1 — call without confirmationToken
  → validates inputs
  → returns preview (full payment details) + confirmationToken
  → no Visa API call made

Phase 2 — call again with the same parameters + confirmationToken
  → token is verified: not expired (< 5 min), not reused, params hash matches
  → Visa API called, funds move

Token format:  <tool-name>:<sha256(params)>:<unix-timestamp-ms>
```

**Example AP workflow session:**

```
# Step 1 — check the queue
"What supplier payment requests are waiting for approval?"
→ reads b2b://pending-requisitions
← 2 pending requisitions

# Step 2 — inspect one
"Get the status of requisition SIP-REQ-A1B2C3D4"
→ sip_get_status({ clientId: "...", requisitionId: "SIP-REQ-A1B2C3D4" })

# Step 3 — approve (guardrail — Phase 1)
"Approve SIP-REQ-A1B2C3D4 for $2,300"
→ sip_approve_payment({ ..., approvedAmount: 2300 })
← preview: { action: "Approve SIP", approvedAmount: 2300, ... }
   confirmationToken: "sip_approve_payment:abc123:1744..."

# Step 4 — approve (guardrail — Phase 2)
"Yes, confirm approval"
→ sip_approve_payment({ ..., confirmationToken: "sip_approve_payment:abc123:1744..." })
← { paymentId: "SIP-PAY-XXXXXXXX", status: "approved", approvedAt: "..." }

# Step 5 — initiate a BIP for a different invoice
"Send a $4,750 payment to SUPP-007 for invoice INV-2026-099"
→ bip_initiate_payment({ supplierId: "SUPP-007", paymentAmount: 4750, invoiceNumber: "INV-2026-099", ... })
← preview + confirmationToken

→ bip_initiate_payment({ ..., confirmationToken: "..." })
← { paymentId: "BIP-XXXXXXXX", virtualCard: { accountNumber: "4xxx..." }, paymentDetailUrl: "..." }
```

### BIP vs SIP — AP workflow perspective

```mermaid
sequenceDiagram
    participant AP  as 🤖 AP Agent
    participant MCP as visa-b2b-ap
    participant VPA as ⚡ Visa VPA

    Note over AP,VPA: BIP — buyer drives the payment
    AP->>MCP: bip_initiate_payment (Phase 1)
    MCP-->>AP: preview + confirmationToken
    AP->>MCP: bip_initiate_payment (Phase 2, token)
    MCP->>VPA: POST /paymentService/processPayments (BIP)
    VPA-->>MCP: paymentId + virtualCard
    MCP-->>AP: BIPPayment { virtualCard, paymentDetailUrl }

    Note over AP,VPA: SIP — supplier drives the request
    AP->>MCP: sip_submit_request
    MCP->>VPA: POST /requisitionService (SIP)
    VPA-->>MCP: requisitionId + virtualAccount
    MCP-->>AP: SIPRequisition { status: pending_approval }
    AP->>MCP: sip_approve_payment (Phase 1)
    MCP-->>AP: preview + confirmationToken
    AP->>MCP: sip_approve_payment (Phase 2, token)
    MCP->>VPA: POST /paymentService/processPayments (SIP)
    VPA-->>MCP: paymentId + status: approved
    MCP-->>AP: SIPApprovalResult ✅
```

### Environment variables

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `VISA_USER_ID` | Live only | — | Visa API username |
| `VISA_PASSWORD` | Live only | — | Visa API password |
| `VISA_BASE_URL` | No | `https://sandbox.api.visa.com` | Visa API base URL |
| `VISA_CERT_PATH` | Live only | — | Path to client certificate PEM |
| `VISA_KEY_PATH` | Live only | — | Path to private key PEM |
| `VISA_CA_PATH` | No | — | Path to CA bundle PEM |
| `SANDBOX_MODE` | No | `"true"` when certs absent | Set to `"false"` to connect to live Visa API |

---

<img src="https://capsule-render.vercel.app/api?type=waving&color=1A1F71&height=80&section=footer" width="100%"/>
