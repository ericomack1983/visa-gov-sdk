# vGov — Government Procurement Portal

A Next.js demo portal built for the Visa Hackathon, showcasing Visa's B2B payment APIs in a government procurement context.

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in as **Gov**, **Supplier**, or **Auditor**.

---

## Key Features

- **RFP Management** — Create, publish, and evaluate procurement requests with AI-assisted supplier scoring
- **Virtual Card Issuance (VCN)** — Issue single-use or multi-use virtual cards tied to specific suppliers, amounts, and MCC codes
- **Recurring Contracts** — Long-term payment schedules with installment tracking and dashboard visibility
- **Financial Dashboard** — Real-time budget tracker (annual + monthly), recurring contract commitments, and spend analytics
- **Visa Supplier Matching Service (VSMS)** — AI-powered supplier scoring across 6 dimensions

---

## How IPC Works — Intelligent Payment Controls

### The Problem

Configuring payment control rules manually requires knowing all the right rule codes, spending limits, MCC codes, and channel flags. Most procurement officers don't have that expertise.

### The Solution

Describe how the card should be used in plain English. IPC's Gen-AI model translates your intent into a ready-to-apply `VPCRule[]` — with a plain-English rationale and a confidence score so you can decide whether to trust it.

### Behind the Scenes

IPC is a **Visa-hosted Gen-AI service**. From your app's perspective it is a single REST call — you never wire up an LLM yourself.

```ts
// The entire integration
const { suggestions } = await vpcService.IPC.getSuggestedRules({
  prompt: 'government procurement — electrical parts, domestic only, $12,000 cap',
  currencyCode: '840',
});
await vpcService.IPC.setSuggestedRules(suggestions[0].ruleSetId, accountId);
```

### What Happens Inside That API Call

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

**Yes, there is an LLM** — but it is domain-specific, not general-purpose. Visa trained it specifically to understand payment intent and output valid `VPCRule[]` objects.

| General-purpose LLM | Visa IPC Model |
|---|---|
| Free-form text output | Structured `VPCRule[]` — schema-validated |
| You parse/interpret the response | You apply `ruleSetId` directly to a card |
| No payment domain grounding | Trained on VPC rule ontology, MCC taxonomy, Visa policy |
| Hallucinated rule codes are possible | Output is always valid — model only emits known rule types |
| You supply the API key | Visa hosts it — authenticated via your Visa OAuth token |

### What the Model Classifies

Given `"office supplies, domestic only, $5,000 cap"` it extracts:

1. **Intent tokens** → `spend_category`, `geo_restriction`, `amount_limit`
2. **MCC resolution** → `5065`, `5112`, `5044` (office-related codes)
3. **Rule primitives** — maps each token to a `VPCRule` type:
   - `SPV` (Single Payment Value) for the amount cap
   - `MCC_RESTRICT` for the category lock
   - `GEO_BLOCK` for domestic-only enforcement
   - `ATM_BLOCK` by default policy
4. **Confidence score** — based on input specificity. A vague prompt scores ~70%; a precise one hits ~94%
5. **Rationale string** — plain-English explanation of what was translated and why

### What You Don't Need to Build

- No OpenAI / Anthropic API key
- No prompt engineering for rule formatting
- No JSON parsing of free-form text
- No rule validation logic
- No MCC code lookup — IPC resolves these itself

### In This App

The **IPC panel** (left column on the Virtual Card page) animates in real time as you fill in the form — showing the translation from plain-English parameters into a `VPCRule[]` list, confidence score, and AI rationale. This is a client-side simulation for demonstration purposes.

The **real IPC call** fires inside the issuance overlay when you click "Issue Virtual Card Number" — that is the live Visa sandbox call that returns actual `suggestions[]` and applies them to the card via `setSuggestedRules`.

> The panel is the explanation. The overlay is the execution.

---

## Visa APIs Used

| API | Purpose |
|---|---|
| **VCN** — Virtual Card Network | Issue virtual card credentials |
| **VPA** — Virtual Payment Accounts | Buyer onboarding, proxy pools, funding accounts |
| **VPC** — Visa Payment Controls | Enrol cards and apply spending rules |
| **IPC** — Intelligent Payment Controls | Translate plain-English intent into `VPCRule[]` |
| **VSMS** — Visa Supplier Matching Service | Score and rank suppliers across 6 dimensions |
