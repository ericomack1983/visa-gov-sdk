# `@visa-gov/sdk` — MCP Server

AI agents can now issue virtual cards, evaluate supplier bids, manage payment controls,
and settle government payments — all through natural language, with built-in guardrails
on every money-moving operation.

---

## Quick install (Claude Code)

```bash
# Sandbox mode (no credentials needed — uses mock Visa responses)
claude mcp add --transport stdio visa-gov \
  -- node /path/to/visa-gov-sdk/mcp/dist/index.js

# Live mode (Visa Sandbox API with mTLS)
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

---

## Build from source

```bash
git clone https://github.com/ericomack1983/visa-gov-sdk.git
cd visa-gov-sdk
npm install
npm run build:mcp
```

The compiled server will be at `mcp/dist/index.js`.

---

## All available tools

| Tool | Group | Requires Confirmation | Description |
|------|-------|-----------------------|-------------|
| `sms_check_supplier` | Supplier Intelligence | No | Check supplier Visa network registration, confidence score, MCC |
| `sms_bulk_check_suppliers` | Supplier Intelligence | No | Batch check up to 10 suppliers in parallel |
| `ai_evaluate_bids` | Supplier Intelligence | No | Score and rank RFP bids across 6 weighted dimensions with Visa SMS verification |
| `vpc_suggest_rules` | Payment Controls | No | Gen-AI: translate plain-English description into VPC rule set |
| `vpc_apply_rules` | Payment Controls | No | Apply a suggested rule set to an account |
| `vpc_set_rules_manual` | Payment Controls | No | Manually set payment control rules on an account |
| `vpc_get_rules` | Payment Controls | No | Get current rules for a VPC account |
| `vpc_block_account` | Payment Controls | No | Emergency HOT block — immediately block all transactions |
| `vpc_create_account` | Payment Controls | No | Register a virtual card account with VPC |
| `vpc_get_transaction_history` | Payment Controls | No | Get transaction history, optionally filtered by outcome |
| `vcn_issue_virtual_card` | Virtual Card Issuance | **Yes** | Issue a Visa virtual card (PAN) with embedded spending rules |
| `bip_initiate_payment` | B2B Payments | **Yes** | Initiate a Buyer-Initiated Payment (BIP) |
| `bip_get_status` | B2B Payments | No | Get current status of a BIP payment |
| `bip_cancel_payment` | B2B Payments | No | Cancel a pending BIP payment |
| `sip_submit_request` | B2B Payments | No | Supplier submits a payment requisition |
| `sip_approve_payment` | B2B Payments | **Yes** | Buyer approves a SIP requisition (triggers fund movement) |
| `sip_reject_payment` | B2B Payments | No | Buyer rejects a supplier payment requisition |
| `settlement_initiate` | Settlement | No | Settle a payment on Visa rails (USD or Card) |
| `vpa_create_buyer` | VPA Management | No | Create a government agency buyer profile |
| `vpa_process_payment` | VPA Management | No | Process a VPA payment from buyer to supplier |

---

## Guardrail system — how it works

Three tools require explicit human confirmation before executing because they move money
or issue real payment credentials:

- **`vcn_issue_virtual_card`** — issues a real Visa virtual card (PAN + CVV)
- **`bip_initiate_payment`** — provisions a single-use virtual card locked to a specific invoice
- **`sip_approve_payment`** — approves a supplier payment requisition (triggers fund movement)

### Two-phase confirmation flow

**Phase 1 — Dry run** (call without `confirmationToken`, or with `"dry-run"`)

- Validates all inputs
- Returns a full preview of what will happen (amounts, parties, rules, etc.)
- Returns a `confirmationToken` tied to these exact parameters
- Returns `requiresConfirmation: true`
- **Does NOT call the Visa API or move any money**

**Phase 2 — Execute** (call with the `confirmationToken` from Phase 1)

- Validates that the token is present, non-expired (< 5 minutes), and hasn't been used before
- Validates that the parameters haven't changed (hash verification)
- Calls the real SDK
- Returns the result with `requiresConfirmation: false`

### Token format

```
<tool-name>:<sha256(params)>:<unix-timestamp-ms>
```

### Security properties

| Property | Behaviour |
|----------|-----------|
| **Expiry** | Tokens expire after 5 minutes |
| **Tampering** | Token encodes a SHA-256 hash of the parameters; any change invalidates it |
| **Replay prevention** | Each token can only be consumed once (tracked in memory) |
| **Cross-tool isolation** | A BIP token cannot be used to issue a VCN, and vice versa |

### Example conversation — Phase 1 → Phase 2

```
User: Issue a virtual card for MedEquip Co., $48,500, valid June 2026

Agent (Phase 1):
  ⚠️ Confirmation required before issuing card.

  Preview:
    • Client: B2BWS_1_1_9999
    • Buyer: 9999
    • Proxy pool: Proxy12345
    • Period: 06/01/2026 → 06/30/2026
    • Spend limit: $48,500 (lifetime)
    • Rules: SPV (lifetime $48,500), ATM blocked

  To issue this card, call vcn_issue_virtual_card again with:
    confirmationToken: "vcn_issue_virtual_card:a3f2c8...:1712500000000"

User: Confirmed, proceed.

Agent (Phase 2):
  ✅ Card issued successfully.
    PAN: 4xxx xxxx xxxx 1234
    CVV2: 847
    Expiry: 06/2029
    responseCode: "00"
```

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VISA_USER_ID` | Live mode only | — | Visa API username (Two-Way SSL section in Visa Developer Center) |
| `VISA_PASSWORD` | Live mode only | — | Visa API password |
| `VISA_BASE_URL` | No | `https://sandbox.api.visa.com` | Visa API base URL |
| `VISA_CERT_PATH` | Live mode only | — | Path to client certificate PEM (mTLS) |
| `VISA_KEY_PATH` | Live mode only | — | Path to private key PEM (mTLS) |
| `VISA_CA_PATH` | No | — | Path to CA bundle PEM (optional) |
| `SANDBOX_MODE` | No | `"true"` when certs absent | Force sandbox mode (`"true"`) or live mode (`"false"`) |

If `VISA_CERT_PATH` or `VISA_KEY_PATH` are absent, the server automatically falls back
to sandbox mode regardless of `SANDBOX_MODE`.

---

## Natural language usage examples

### Supplier verification

```
"Check if MedEquip Co. is registered in the Visa network"
→ Returns confidence score, MCC code, L2/L3 data support

"Run Visa network checks on all 5 suppliers from this RFP"
→ Runs bulk check in parallel, returns a map of supplier → score
```

### Bid evaluation

```
"Evaluate these 3 bids for our Q3 medical equipment procurement"
→ Scores all bids across 6 dimensions, runs live Visa SMS on each supplier

"Who wins the bid? Show me the scores and reasoning"
→ Returns ranked bids, composite scores, and an AI-generated narrative
```

### Payment controls

```
"Set up payment controls for a medical card, $50k/month limit, no ATM access"
→ Calls vpc_suggest_rules, then vpc_apply_rules

"Emergency block card account ACC-12345 — suspected fraud"
→ Calls vpc_block_account immediately (no confirmation required)
```

### Virtual card issuance (guardrail)

```
"Issue a virtual card for MedEquip Co., $48,500, valid June 2026 only"
→ Phase 1: Claude returns preview and asks you to confirm
→ Phase 2: After confirmation, issues the real Visa PAN
```

### BIP payment (guardrail)

```
"Initiate a BIP payment of $12,000 to HealthTech for invoice INV-2026-007"
→ Phase 1: Claude returns preview and asks you to confirm
→ Phase 2: After confirmation, provisions the virtual card and pushes to supplier
```

### SIP flow (partial guardrail)

```
"Submit a payment request from SUPP-001 to buyer 9999 for $2,300 invoice INV-007"
→ Calls sip_submit_request immediately (supplier is requesting, not moving money)

"Approve the $2,300 requisition REQ-12345"
→ Phase 1: Preview + confirmation token
→ Phase 2: Calls sip_approve_payment, triggers fund movement
```

### Full procurement flow

```
"Run a complete procurement flow: evaluate our 3 bidders for the Q2 medical RFP,
issue a virtual card to the winner, and initiate settlement"

→ Step 1: ai_evaluate_bids (with live Visa SMS)
→ Step 2: vcn_issue_virtual_card (guardrail — Phase 1 preview, Phase 2 execute)
→ Step 3: settlement_initiate (no confirmation — settlement is the final step
          of an already-confirmed card issuance)
```

---

## Modes — sandbox vs live

| Mode | When | Credentials | API calls |
|------|------|-------------|-----------|
| **Sandbox** | Default; when cert/key env vars are absent | None required | Returns realistic mock data instantly |
| **Live** | `SANDBOX_MODE=false` AND cert/key provided | Visa Developer Center credentials + mTLS certs | Calls real Visa sandbox/production API |

Use **sandbox mode** for:
- Development and testing
- Demonstrating workflows
- CI/CD pipelines

Use **live mode** for:
- Acceptance testing against the Visa sandbox API
- Production deployments

---

## Security considerations

### mTLS requirement

Visa's developer platform requires Two-Way SSL (mutual TLS) for all API calls. In live
mode, both the client certificate and private key are required. The server reads these
files at startup — they are never logged or included in tool responses.

### Storing credentials

Prefer `--env` flags over environment variables in shell profiles:

```bash
# Scoped to this MCP server only — not leaked to other processes
claude mcp add --transport stdio visa-gov \
  -e VISA_USER_ID=xxx \
  -e VISA_PASSWORD=yyy \
  --scope user \          # credentials stored per-user, not in shared .mcp.json
  -- node /path/to/mcp/dist/index.js
```

Use `--scope user` to keep credentials out of the shared `.mcp.json` file in your
repository, preventing accidental commits.

### The guardrail system

The two-phase confirmation system is designed to prevent AI agents from accidentally
(or maliciously) issuing cards or moving money without explicit human review. Even if
an agent is compromised or misbehaves, it cannot execute a financial operation without
the user reviewing a full preview and explicitly providing the `confirmationToken`.

### Audit trail

Every confirmed action returns:
- A full timestamp (`requestedAt`, `createdAt`, `approvedAt`)
- All parameters used in the transaction
- A transaction ID for reconciliation

---

## mTLS setup

1. Log in to [Visa Developer Center](https://developer.visa.com)
2. Open your project → **Credentials** → **Two-Way SSL**
3. Generate a CSR (or upload an existing one)
4. Download the issued certificate → save as `cert.pem`
5. Keep the private key from your CSR generation → save as `privateKey.pem`
6. Download **Common Certificates** (at the bottom of the Two-Way SSL section) → save as `ca-bundle.pem`
7. Note your **Username** and **Password** from the same page

```bash
# Verify your certificate
openssl verify -CAfile ca-bundle.pem cert.pem

# Test mTLS handshake
curl --cert cert.pem --key privateKey.pem --cacert ca-bundle.pem \
  -u "your-user-id:your-password" \
  https://sandbox.api.visa.com/
```

---

## Troubleshooting

### "Connection closed" on Windows

Use `cmd /c node ...` instead of `node ...` directly:

```bash
claude mcp add --transport stdio visa-gov \
  -- cmd /c node C:\path\to\visa-gov-sdk\mcp\dist\index.js
```

### nvm PATH issues

If the `node` binary isn't found, use the absolute path:

```bash
which node   # e.g. /Users/you/.nvm/versions/node/v20.0.0/bin/node

claude mcp add --transport stdio visa-gov \
  -- /Users/you/.nvm/versions/node/v20.0.0/bin/node /path/to/mcp/dist/index.js
```

### "mTLS handshake failed"

- Verify that `VISA_CERT_PATH` and `VISA_KEY_PATH` point to the correct files
- Check that the certificate was issued for your project (not a different one)
- Confirm the private key matches the certificate: `openssl x509 -noout -modulus -in cert.pem | md5` should match `openssl rsa -noout -modulus -in privateKey.pem | md5`

### Token expired

Re-run Phase 1 to get a fresh token — tokens expire after 5 minutes:

```
"Issue a virtual card for MedEquip Co., $48,500, valid June 2026 only"
→ Claude returns a new preview and new confirmationToken
```

### Server doesn't start

Check Node.js version (requires ≥ 20):

```bash
node --version   # should be v20.x or higher
```

If lower, upgrade Node.js or specify the full path to a v20+ binary.
