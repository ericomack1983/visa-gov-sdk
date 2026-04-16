// ─────────────────────────────────────────────────────────────────────────────
// MCP Server — Visa Government SDK
//
// Exposes all SDK capabilities as MCP tools for AI agents.
// All output goes to stdout as JSON-RPC; all debug/logging goes to stderr.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import crypto from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  VCNService,
  VPAService,
  B2BPaymentService,
  VPCService,
  SettlementService,
  VisaNetworkService,
  SupplierMatcher,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Environment configuration
// ─────────────────────────────────────────────────────────────────────────────

const isSandbox =
  process.env.SANDBOX_MODE !== 'false' ||
  !process.env.VISA_CERT_PATH ||
  !process.env.VISA_KEY_PATH;

function readFileEnv(envVar: string | undefined): string | undefined {
  if (!envVar) return undefined;
  try { return fs.readFileSync(envVar, 'utf-8'); } catch { return undefined; }
}

const apiConfig = isSandbox ? undefined : {
  baseUrl:     process.env.VISA_BASE_URL ?? 'https://sandbox.api.visa.com',
  credentials: {
    userId:   process.env.VISA_USER_ID!,
    password: process.env.VISA_PASSWORD!,
  },
  cert: readFileEnv(process.env.VISA_CERT_PATH),
  key:  readFileEnv(process.env.VISA_KEY_PATH),
  ca:   readFileEnv(process.env.VISA_CA_PATH),
};

// VisaApiConfig (for VisaNetworkService) uses flat userId/password
const visaApiConfig = isSandbox ? null : {
  baseUrl:  process.env.VISA_BASE_URL ?? 'https://sandbox.api.visa.com',
  userId:   process.env.VISA_USER_ID!,
  password: process.env.VISA_PASSWORD!,
  cert:     readFileEnv(process.env.VISA_CERT_PATH),
  key:      readFileEnv(process.env.VISA_KEY_PATH),
  ca:       readFileEnv(process.env.VISA_CA_PATH),
};

process.stderr.write(
  `[visa-gov-mcp] Starting in ${isSandbox ? 'SANDBOX' : 'LIVE'} mode\n`,
);

// ─────────────────────────────────────────────────────────────────────────────
// Service instantiation
// ─────────────────────────────────────────────────────────────────────────────

const vcnService        = new VCNService();
const vpaService        = apiConfig ? VPAService.live(apiConfig) : VPAService.sandbox();
const b2bService        = apiConfig ? B2BPaymentService.live(apiConfig) : B2BPaymentService.sandbox();
const vpcService        = apiConfig ? VPCService.live(apiConfig) : VPCService.sandbox();
const settlementService = new SettlementService();
const visaNetwork       = visaApiConfig
  ? new VisaNetworkService(visaApiConfig)
  : VisaNetworkService.sandbox();
const supplierMatcher   = SupplierMatcher.withVisaNetwork(visaNetwork);

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation token system
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 300_000; // 5 minutes
const usedTokens   = new Set<string>();

function createConfirmationToken(toolName: string, params: unknown): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex');
  const ts = Date.now();
  return `${toolName}:${hash}:${ts}`;
}

function validateConfirmationToken(
  token: string,
  toolName: string,
  currentParams?: unknown,
): { valid: boolean; error?: string } {
  const parts = token.split(':');
  if (parts.length !== 3) return { valid: false, error: 'Invalid token format' };
  const [tName, storedHash, tsStr] = parts;
  if (tName !== toolName) {
    return { valid: false, error: `Token is for tool "${tName}", not "${toolName}"` };
  }
  // Verify hash matches current params (prevents tampering)
  if (currentParams !== undefined) {
    const expectedHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(currentParams))
      .digest('hex');
    if (storedHash !== expectedHash) {
      return { valid: false, error: 'Token hash mismatch — parameters may have been modified or token is invalid.' };
    }
  }
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return { valid: false, error: 'Invalid token timestamp' };
  if (Date.now() - ts > TOKEN_TTL_MS) {
    return { valid: false, error: 'Token has expired (> 5 minutes). Re-run Phase 1 to get a fresh token.' };
  }
  if (usedTokens.has(token)) {
    return { valid: false, error: 'Token has already been used (replay attack prevention).' };
  }
  return { valid: true };
}

function consumeToken(token: string): void {
  usedTokens.add(token);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Server
// ─────────────────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'visa-gov-sdk',
  version: '0.1.0',
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — Supplier Intelligence
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  'sms_check_supplier',
  'Check whether a supplier is registered in the Visa network and retrieve their confidence score (0-100), MCC code, and L2/L3 data support.',
  {
    supplierName:        z.string(),
    supplierCountryCode: z.string(),
    supplierCity:        z.string().optional(),
    supplierState:       z.string().optional(),
    supplierTaxId:       z.string().optional(),
  },
  async (input) => {
    try {
      const result = await visaNetwork.check(input);
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'sms_bulk_check_suppliers',
  'Check multiple suppliers against the Visa network in parallel (max 10 concurrent). Returns a map of supplier name → confidence score.',
  {
    suppliers: z.array(z.object({
      supplierName:        z.string(),
      supplierCountryCode: z.string(),
    })),
  },
  async (input) => {
    try {
      const map = await visaNetwork.bulkCheck(input.suppliers);
      const plain: Record<string, unknown> = {};
      for (const [k, v] of map.entries()) plain[k] = v;
      return ok(plain);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'ai_evaluate_bids',
  'Score and rank all bids for an RFP across 6 weighted dimensions (price 25%, delivery 20%, reliability 20%, compliance 15%, risk 10%, Visa match 10%). Runs live Visa SMS verification on each supplier.',
  {
    rfp: z.object({
      id:            z.string(),
      budgetCeiling: z.number(),
    }),
    bids: z.array(z.object({
      id:           z.string(),
      supplierId:   z.string(),
      amount:       z.number(),
      deliveryDays: z.number(),
    })),
    suppliers: z.array(z.object({
      id:               z.string(),
      name:             z.string(),
      pastPerformance:  z.number(),
      complianceStatus: z.enum(['Compliant', 'Pending Review', 'Non-Compliant']),
      certifications:   z.array(z.string()),
      riskScore:        z.number(),
    })),
    countryCode: z.string().optional(),
  },
  async (input) => {
    try {
      // Augment bids and suppliers to satisfy the full interface
      const bids = input.bids.map((b) => ({
        ...b,
        rfpId:        input.rfp.id,
        supplierName: input.suppliers.find((s) => s.id === b.supplierId)?.name ?? '',
        notes:        '',
        submittedAt:  new Date().toISOString(),
      }));
      const suppliers = input.suppliers.map((s) => ({
        ...s,
        rating:         3,
        pricingHistory: [],
        walletAddress:  '',
        deliveryAvgDays: 30,
      }));

      const result = await supplierMatcher.evaluateWithVisaCheck({
        rfp:         input.rfp,
        bids,
        suppliers,
        countryCode: input.countryCode ?? 'US',
      });

      // visaChecks is a Map — convert to plain object
      const { visaChecks, ...rest } = result;
      const visaChecksPlain: Record<string, unknown> = {};
      for (const [k, v] of visaChecks.entries()) visaChecksPlain[k] = v;

      return ok({ ...rest, visaChecks: visaChecksPlain });
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — Payment Controls
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  'vpc_suggest_rules',
  'Use Gen-AI (IPC) to translate a plain-English procurement description into a ready-to-apply VPC rule set. Returns rules, rationale, and confidence score. Does NOT apply the rules — call vpc_apply_rules next.',
  {
    prompt:       z.string(),
    currencyCode: z.string().optional(),
  },
  async (input) => {
    try {
      const result = await vpcService.IPC.getSuggestedRules({
        prompt:       input.prompt,
        currencyCode: input.currencyCode ?? '840',
      });
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'vpc_apply_rules',
  'Apply a previously suggested VPC rule set to an account. Use the ruleSetId from vpc_suggest_rules output.',
  {
    ruleSetId: z.string(),
    accountId: z.string(),
  },
  async (input) => {
    try {
      const result = await vpcService.IPC.setSuggestedRules(input.ruleSetId, input.accountId);
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'vpc_set_rules_manual',
  'Manually set VPC payment control rules on an account (spend velocity, merchant categories, channels, business hours, location).',
  {
    accountId: z.string(),
    rules:     z.array(z.any()),
  },
  async (input) => {
    try {
      const result = await vpcService.Rules.setRules(input.accountId, input.rules);
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'vpc_get_rules',
  'Get the current VPC payment control rules for an account.',
  { accountId: z.string() },
  async (input) => {
    try {
      const result = await vpcService.Rules.getRules(input.accountId);
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'vpc_block_account',
  'Emergency HOT block — immediately block ALL transactions on a VPC account.',
  {
    accountId: z.string(),
    reason:    z.string(),
  },
  async (input) => {
    try {
      const result = await vpcService.Rules.blockAccount(input.accountId);
      return ok({ ...result, reason: input.reason, blockedAt: new Date().toISOString() });
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'vpc_create_account',
  'Register a virtual card account with the Visa B2B Payment Controls system.',
  {
    accountNumber: z.string(),
    contacts:      z.array(z.any()).optional(),
  },
  async (input) => {
    try {
      const result = await vpcService.AccountManagement.createAccount({
        accountNumber: input.accountNumber,
        contacts:      input.contacts,
      });
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'vpc_get_transaction_history',
  'Get transaction history for a VPC account, optionally filtered by outcome (approved/declined) and date range.',
  {
    accountId: z.string(),
    outcome:   z.enum(['approved', 'declined']).optional(),
    fromDate:  z.string().optional(),
    toDate:    z.string().optional(),
  },
  async (input) => {
    try {
      const result = await vpcService.Reporting.getTransactionHistory(input.accountId, {
        outcome:  input.outcome,
        fromDate: input.fromDate,
        toDate:   input.toDate,
      });
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Virtual Card Issuance (GUARDRAIL)
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  'vcn_issue_virtual_card',
  '⚠️ REQUIRES CONFIRMATION. Issue a Visa virtual card (PAN) with embedded spending rules. First call returns a preview and confirmationToken. Pass the token back in a second call to actually issue the card.',
  {
    confirmationToken: z.string().optional(),
    clientId:          z.string(),
    buyerId:           z.string(),
    proxyPoolId:       z.string(),
    numberOfCards:     z.string().optional(),
    startDate:         z.string(),
    endDate:           z.string(),
    timeZone:          z.string().optional(),
    rules:             z.array(z.any()),
    memo:              z.string().optional(),
  },
  async (input) => {
    try {
      const { confirmationToken, ...params } = input;

      // Phase 1 — dry run
      if (!confirmationToken || confirmationToken === 'dry-run') {
        const token = createConfirmationToken('vcn_issue_virtual_card', params);
        return ok({
          requiresConfirmation: true,
          confirmationToken:    token,
          preview: {
            clientId:      params.clientId,
            buyerId:       params.buyerId,
            proxyPoolId:   params.proxyPoolId,
            numberOfCards: params.numberOfCards ?? '1',
            period:        `${params.startDate} → ${params.endDate}`,
            timeZone:      params.timeZone ?? 'UTC',
            rulesCount:    params.rules.length,
            rules:         params.rules,
            memo:          params.memo ?? '',
          },
          instructions: 'Review the preview above. To issue the card, call vcn_issue_virtual_card again with the same parameters plus confirmationToken.',
        });
      }

      // Phase 2 — execute
      const validation = validateConfirmationToken(confirmationToken, 'vcn_issue_virtual_card', params);
      if (!validation.valid) return err(validation.error!);
      consumeToken(confirmationToken);

      const payload = {
        clientId:    params.clientId,
        buyerId:     params.buyerId,
        messageId:   Date.now().toString(),
        action:      'A' as const,
        numberOfCards: params.numberOfCards ?? '1',
        proxyPoolId: params.proxyPoolId,
        requisitionDetails: {
          startDate: params.startDate,
          endDate:   params.endDate,
          timeZone:  params.timeZone,
          rules:     params.rules,
        },
      };

      const options = apiConfig
        ? {
            baseUrl:     apiConfig.baseUrl,
            credentials: apiConfig.credentials,
            tls:         {
              cert: apiConfig.cert ?? '',
              key:  apiConfig.key  ?? '',
              ...(apiConfig.ca ? { ca: apiConfig.ca } : {}),
            },
          }
        : undefined;

      const result = await vcnService.requestVirtualCard(payload, options);
      return ok({ ...result, requiresConfirmation: false, sandboxMode: isSandbox });
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — B2B Payments (mixed)
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  'bip_initiate_payment',
  '⚠️ REQUIRES CONFIRMATION. Initiate a Buyer-Initiated Payment (BIP) — provision a single-use virtual card locked to a specific invoice and push it to the supplier. First call returns a preview. Pass confirmationToken to execute.',
  {
    confirmationToken: z.string().optional(),
    clientId:          z.string(),
    buyerId:           z.string(),
    supplierId:        z.string(),
    paymentAmount:     z.number(),
    currencyCode:      z.string().optional(),
    invoiceNumber:     z.string(),
    memo:              z.string().optional(),
  },
  async (input) => {
    try {
      const { confirmationToken, ...params } = input;

      // Phase 1 — dry run
      if (!confirmationToken || confirmationToken === 'dry-run') {
        const token = createConfirmationToken('bip_initiate_payment', params);
        return ok({
          requiresConfirmation: true,
          confirmationToken:    token,
          preview: {
            clientId:      params.clientId,
            buyerId:       params.buyerId,
            supplierId:    params.supplierId,
            paymentAmount: params.paymentAmount,
            currencyCode:  params.currencyCode ?? '840',
            invoiceNumber: params.invoiceNumber,
            memo:          params.memo ?? '',
          },
          instructions: 'Review the preview above. To initiate the payment, call bip_initiate_payment again with the same parameters plus confirmationToken.',
        });
      }

      // Phase 2 — execute
      const validation = validateConfirmationToken(confirmationToken, 'bip_initiate_payment', params);
      if (!validation.valid) return err(validation.error!);
      consumeToken(confirmationToken);

      const result = await b2bService.BIP.initiate({
        messageId:     crypto.randomUUID(),
        clientId:      params.clientId,
        buyerId:       params.buyerId,
        supplierId:    params.supplierId,
        paymentAmount: params.paymentAmount,
        currencyCode:  params.currencyCode ?? '840',
        invoiceNumber: params.invoiceNumber,
        memo:          params.memo,
      });
      return ok({ ...result, requiresConfirmation: false });
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'bip_get_status',
  'Get the current status of a BIP payment.',
  {
    clientId:  z.string(),
    paymentId: z.string(),
  },
  async (input) => {
    try {
      const result = await b2bService.BIP.getStatus({
        messageId: crypto.randomUUID(),
        clientId:  input.clientId,
        paymentId: input.paymentId,
      });
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'bip_cancel_payment',
  'Cancel a pending BIP payment (only valid while status is pending or unmatched).',
  {
    clientId:  z.string(),
    paymentId: z.string(),
  },
  async (input) => {
    try {
      const result = await b2bService.BIP.cancel({
        messageId: crypto.randomUUID(),
        clientId:  input.clientId,
        paymentId: input.paymentId,
      });
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'sip_submit_request',
  'Supplier submits a payment requisition (SIP flow). Returns a requisitionId that the buyer must approve.',
  {
    clientId:        z.string(),
    supplierId:      z.string(),
    buyerId:         z.string(),
    requestedAmount: z.number(),
    currencyCode:    z.string().optional(),
    invoiceNumber:   z.string(),
    startDate:       z.string(),
    endDate:         z.string(),
  },
  async (input) => {
    try {
      const result = await b2bService.SIP.submitRequest({
        messageId:       crypto.randomUUID(),
        clientId:        input.clientId,
        supplierId:      input.supplierId,
        buyerId:         input.buyerId,
        requestedAmount: input.requestedAmount,
        currencyCode:    input.currencyCode ?? '840',
        invoiceNumber:   input.invoiceNumber,
        startDate:       input.startDate,
        endDate:         input.endDate,
      });
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'sip_approve_payment',
  '⚠️ REQUIRES CONFIRMATION. Buyer approves a supplier payment requisition (SIP flow) — this triggers actual fund movement. First call returns a preview. Pass confirmationToken to execute.',
  {
    confirmationToken: z.string().optional(),
    clientId:          z.string(),
    buyerId:           z.string(),
    requisitionId:     z.string(),
    approvedAmount:    z.number(),
    currencyCode:      z.string().optional(),
  },
  async (input) => {
    try {
      const { confirmationToken, ...params } = input;

      // Phase 1 — dry run
      if (!confirmationToken || confirmationToken === 'dry-run') {
        const token = createConfirmationToken('sip_approve_payment', params);
        return ok({
          requiresConfirmation: true,
          confirmationToken:    token,
          preview: {
            clientId:       params.clientId,
            buyerId:        params.buyerId,
            requisitionId:  params.requisitionId,
            approvedAmount: params.approvedAmount,
            currencyCode:   params.currencyCode ?? '840',
          },
          instructions: 'Review the preview above. To approve the payment, call sip_approve_payment again with the same parameters plus confirmationToken.',
        });
      }

      // Phase 2 — execute
      const validation = validateConfirmationToken(confirmationToken, 'sip_approve_payment', params);
      if (!validation.valid) return err(validation.error!);
      consumeToken(confirmationToken);

      const result = await b2bService.SIP.approve({
        messageId:      crypto.randomUUID(),
        clientId:       params.clientId,
        buyerId:        params.buyerId,
        requisitionId:  params.requisitionId,
        approvedAmount: params.approvedAmount,
        currencyCode:   params.currencyCode ?? '840',
      });
      return ok({ ...result, requiresConfirmation: false });
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'sip_reject_payment',
  'Buyer rejects a supplier payment requisition.',
  {
    clientId:      z.string(),
    requisitionId: z.string(),
  },
  async (input) => {
    try {
      const result = await b2bService.SIP.reject({
        messageId:     crypto.randomUUID(),
        clientId:      input.clientId,
        requisitionId: input.requisitionId,
      });
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 5 — Settlement
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  'settlement_initiate',
  'Settle a payment on the Visa rails (USD or Card method). Returns the final settlement result after completing all stages.',
  {
    method:  z.enum(['USD', 'Card']),
    orderId: z.string(),
    amount:  z.number(),
  },
  async (input) => {
    try {
      const result = await settlementService.settle({
        method:  input.method,
        orderId: input.orderId,
        amount:  input.amount,
      });
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 6 — VPA Account Management
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  'vpa_create_buyer',
  'Create a government agency buyer profile in the VPA system.',
  {
    clientId: z.string().describe('Visa-assigned client ID, e.g. "B2BWS_1_2_3029"'),
  },
  async (input) => {
    try {
      const messageId = Date.now().toString();
      const result = await vpaService.Buyer.createBuyer({
        messageId,
        clientId: input.clientId,
        proxyConfig: {
          holdDays:             3,
          bucketedProxyEnabled: false,
          autoRefreshEnabled:   false,
        },
        boostPaymentConfig: {
          boostPaymentEnabled: false,
        },
        contactInfo: {
          zipCode:             '78759',
          phoneExt3:           '',
          city:                'Austin',
          contactName:         'VisaCompany',
          phone2:              '',
          phone3:              '',
          defaultCurrencyCode: 'USD',
          buyerId:             '8887773',
          buyerName:           'TestPaymentFileLijie14',
          phone1:              '8888888888',
          companyId:           '8887773',
          emailAddress:        'visab2bvpaqa1@visa.com',
          countryCode:         'USA',
          addressLine1:        '12301 ResearchBlvd23',
          phoneExt1:           '',
          addressLine2:        'Build#33',
          state:               'TX',
          phoneExt2:           '',
          addressLine3:        '4th floor',
        },
        buyerFeatureConfig: {
          fullAccountViewEnabled:              false,
          cardMaskingDigitsOnline:             12,
          onlinePaymentInstructionEnabled:     false,
          onlinePaymentRequisitionEnabled:     false,
          cardMaskingDigits:                   12,
          pseudoAccountsEnabled:               false,
        },
        paymentFileConfig: {
          inboundFileId: '700147',
        },
        stripePaymentConfig: {
          remittanceNotificationEnabled: false,
          stripePaymentEnabled:          false,
        },
        stpPaymentConfig: {
          accountHolderFirstName:        'Visa',
          remittanceNotificationEnabled: false,
          stpPaymentEnabled:             false,
          accountHolderLastName:         'Card',
        },
        webServicesConfig: {
          apiCodes:          ['SMGS'],
          webServicesEnabled: true,
          clientId:          input.clientId,
          vbdsDataSubscription: [
            {
              dataSubscriptionType: 5001,
              dataSubscriptionAccountType: [
                { subscribed: true, accountType: 'MEMO' },
                { subscribed: true, accountType: 'NVPA' },
              ],
            },
          ],
          suppressSupplierNotification: false,
          vbdsClientId:                 '12345',
        },
        paymentConfig: {
          securityCodeRequired: false,
          allowableCurrencies:  ['USD'],
          expirationDays:       30,
          billingCurrency:      'USD',
          expirationBufferDays: 5,
          paymentAdviceOption:  'C',
        },
        paymentSecurityConfig: {
          defaultSecurityFieldCode:       1,
          customSecurityQuestions:        ['birthday'],
          customSecurityQuestionsEnabled: true,
        },
        approvalWorkflowConfig: {
          workflowFunctionCodes: ['AUCL'],
          workflowConfigEnabled: true,
        },
        authorizationControlConfig: {
          issuerHoldingBID:   '12345678',
          authControlEnabled: true,
          alertsEnabled:      false,
        },
        paymentNotificationConfig: {
          supplierReminderNotificationDays:    2,
          dateFormat:                          'DDMMYYYY',
          attachRemittanceDetails:             false,
          supplierReminderNotificationEnabled: true,
          defaultLanguageCode:                 'en_us',
        },
        reconciliationFileConfig: {
          fileLevel:  'B',
          commFileId: '700144',
        },
        processorConfig: {
          processorFields: {
            aceOptionSet:              '34d2',
            subProductCode:            'REG',
            corporationId:             '2r',
            cycleFrequencyCode:        '5',
            bin:                       'sd2',
            hierarchyLevel:            '2',
            cmidDefaultValue:          '245d3534',
            agentNumber:               '3453',
            principalNumber:           '66',
            productCode:               'VPU',
            accountIDOptionSet:        '3482',
            companyNumber:             '12344',
            cycleFrequency:            'Bi-weekly',
            authorizationStrategyCode: 'hh66',
            pricingStrategy:           '66hh',
            unitId:                    'prop1',
            mapId:                     '66hh',
            processType:               '09',
            user4Code:                 '345u',
            hierarchyNode:             's3',
            plasticCode:               '9866',
          },
        },
      } as any);
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'vpa_process_payment',
  'Process a VPA payment from buyer to supplier.',
  {
    clientId:      z.string(),
    buyerId:       z.string(),
    supplierId:    z.string(),
    amount:        z.number(),
    currencyCode:  z.string().optional(),
    paymentMethod: z.string().optional(),
  },
  async (input) => {
    try {
      const result = await vpaService.Payment.processPayment({
        messageId:     crypto.randomUUID(),
        buyerId:       input.buyerId,
        supplierId:    input.supplierId,
        paymentAmount: input.amount,
        currencyCode:  input.currencyCode ?? '840',
      });
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('[visa-gov-mcp] Server ready. Listening on stdio.\n');
