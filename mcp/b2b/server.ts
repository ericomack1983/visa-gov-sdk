#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// B2B AP Agent MCP Server — Visa Government SDK
//
// Dedicated MCP server for internal AP workflow agents.
// Exposes BIP and SIP payment flows with two-phase guardrails on every
// money-moving operation, plus MCP Resources for live payment context.
//
// Transport : stdio (standard)
// Tools     : 8  (4 BIP + 4 SIP)
// Resources : 2  (pending-requisitions, payment-history)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import crypto from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { B2BPaymentService } from '../../src/index.js';
import type { BIPPayment, SIPRequisition } from '../../src/types/vpa.js';

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

process.stderr.write(
  `[visa-b2b-ap] Starting in ${isSandbox ? 'SANDBOX' : 'LIVE'} mode\n`,
);

// ─────────────────────────────────────────────────────────────────────────────
// Service instantiation
// ─────────────────────────────────────────────────────────────────────────────

const b2b = apiConfig ? B2BPaymentService.live(apiConfig) : B2BPaymentService.sandbox();

// ─────────────────────────────────────────────────────────────────────────────
// In-memory registry — feeds MCP Resources
// Populated by tools as payments and requisitions are created or updated.
// ─────────────────────────────────────────────────────────────────────────────

const bipRegistry = new Map<string, BIPPayment>();
const sipRegistry = new Map<string, SIPRequisition>();

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation token system (two-phase guardrails)
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 300_000; // 5 minutes
const usedTokens   = new Set<string>();

function createConfirmationToken(toolName: string, params: unknown): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex');
  return `${toolName}:${hash}:${Date.now()}`;
}

function validateConfirmationToken(
  token: string,
  toolName: string,
  currentParams?: unknown,
): { valid: boolean; error?: string } {
  const parts = token.split(':');
  if (parts.length !== 3) return { valid: false, error: 'Invalid token format.' };

  const [tName, storedHash, tsStr] = parts;
  const ts = parseInt(tsStr, 10);

  if (tName !== toolName)
    return { valid: false, error: `Token was issued for '${tName}', not '${toolName}'.` };

  if (Date.now() - ts > TOKEN_TTL_MS)
    return { valid: false, error: 'Token has expired (5-minute window). Request a fresh token.' };

  if (usedTokens.has(token))
    return { valid: false, error: 'Token has already been used (replay prevention).' };

  if (currentParams !== undefined) {
    const currentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(currentParams))
      .digest('hex');
    if (currentHash !== storedHash)
      return { valid: false, error: 'Parameters do not match token (tamper detection).' };
  }

  return { valid: true };
}

function consumeToken(token: string): void {
  usedTokens.add(token);
}

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Server
// ─────────────────────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    'visa-b2b-ap',
  version: '1.0.0',
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — BIP (Buyer Initiated Payment)
//
// Buyer provisions a single-use virtual card locked to the invoice amount
// and pushes the card details to the supplier through the Visa VPA network.
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  'bip_initiate_payment',
  '⚠️ REQUIRES CONFIRMATION. Initiate a Buyer-Initiated Payment (BIP) — provision a single-use virtual card locked to a specific invoice and push it to the supplier via the Visa VPA network. Phase 1 (no token): validates inputs and returns a full preview plus a confirmationToken. Phase 2 (pass token): executes and returns the BIPPayment with virtual card details and supplier URL.',
  {
    confirmationToken: z.string().optional().describe('Omit on first call (Phase 1). Pass the token returned by Phase 1 to execute (Phase 2).'),
    clientId:          z.string().describe('Visa B2B client identifier (e.g. B2BWS_1_1_9999).'),
    buyerId:           z.string().describe('Buyer organisation ID.'),
    supplierId:        z.string().describe('Supplier ID on the Visa network.'),
    paymentAmount:     z.number().describe('Invoice amount (e.g. 4750.00).'),
    currencyCode:      z.string().optional().describe('ISO 4217 numeric currency code. Defaults to 840 (USD).'),
    invoiceNumber:     z.string().describe('Invoice reference number.'),
    memo:              z.string().optional().describe('Optional payment memo visible to the supplier.'),
  },
  async (input) => {
    try {
      const { confirmationToken, ...params } = input;

      // Phase 1 — dry run, return preview + token
      if (!confirmationToken || confirmationToken === 'dry-run') {
        const token = createConfirmationToken('bip_initiate_payment', params);
        return ok({
          requiresConfirmation: true,
          confirmationToken:    token,
          preview: {
            action:        'Initiate BIP — provision virtual card + push to supplier',
            clientId:      params.clientId,
            buyerId:       params.buyerId,
            supplierId:    params.supplierId,
            paymentAmount: params.paymentAmount,
            currencyCode:  params.currencyCode ?? '840',
            invoiceNumber: params.invoiceNumber,
            memo:          params.memo ?? '',
          },
          instructions: 'Review the payment details above. To initiate, call bip_initiate_payment again with the same parameters plus confirmationToken.',
          tokenExpiresIn: '5 minutes',
        });
      }

      // Phase 2 — validate token, execute
      const validation = validateConfirmationToken(confirmationToken, 'bip_initiate_payment', params);
      if (!validation.valid) return err(validation.error!);
      consumeToken(confirmationToken);

      const result = await b2b.BIP.initiate({
        messageId:     crypto.randomUUID(),
        clientId:      params.clientId,
        buyerId:       params.buyerId,
        supplierId:    params.supplierId,
        paymentAmount: params.paymentAmount,
        currencyCode:  params.currencyCode ?? '840',
        invoiceNumber: params.invoiceNumber,
        memo:          params.memo,
      });

      bipRegistry.set(result.paymentId, result);
      return ok({ ...result, requiresConfirmation: false });
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'bip_get_status',
  'Get the current status and details of a BIP payment by its paymentId. Returns the full BIPPayment record including virtual card details and current status.',
  {
    clientId:  z.string().describe('Visa B2B client identifier.'),
    paymentId: z.string().describe('Payment ID returned by bip_initiate_payment.'),
  },
  async (input) => {
    try {
      const result = await b2b.BIP.getStatus({
        messageId: crypto.randomUUID(),
        clientId:  input.clientId,
        paymentId: input.paymentId,
      });
      bipRegistry.set(result.paymentId, result);
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'bip_cancel_payment',
  'Cancel a pending BIP payment. Only valid while the payment status is pending or unmatched — cannot cancel a payment that has already been matched or settled.',
  {
    clientId:  z.string().describe('Visa B2B client identifier.'),
    paymentId: z.string().describe('Payment ID to cancel.'),
  },
  async (input) => {
    try {
      const result = await b2b.BIP.cancel({
        messageId: crypto.randomUUID(),
        clientId:  input.clientId,
        paymentId: input.paymentId,
      });
      bipRegistry.set(result.paymentId, result);
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'bip_resend_payment',
  'Resend the virtual card notification to the supplier for an existing BIP payment. Use this when a supplier reports they did not receive the card details or the delivery URL has expired.',
  {
    clientId:  z.string().describe('Visa B2B client identifier.'),
    paymentId: z.string().describe('Payment ID whose notification should be resent.'),
  },
  async (input) => {
    try {
      const result = await b2b.BIP.resend({
        messageId: crypto.randomUUID(),
        clientId:  input.clientId,
        paymentId: input.paymentId,
      });
      bipRegistry.set(result.paymentId, result);
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — SIP (Supplier Initiated Payment)
//
// Supplier submits a payment requisition; the Visa VPA network pre-provisions
// a virtual account for the supplier and notifies the buyer for approval.
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  'sip_submit_request',
  'Supplier submits a payment requisition (SIP flow). The Visa VPA network pre-provisions a virtual account for the supplier and notifies the buyer. Returns a requisitionId that the buyer must approve or reject.',
  {
    clientId:        z.string().describe('Visa B2B client identifier.'),
    supplierId:      z.string().describe('Supplier ID submitting the request.'),
    buyerId:         z.string().describe('Buyer organisation ID to notify.'),
    requestedAmount: z.number().describe('Invoice amount being requested.'),
    currencyCode:    z.string().optional().describe('ISO 4217 numeric currency code. Defaults to 840 (USD).'),
    invoiceNumber:   z.string().describe('Invoice reference number.'),
    startDate:       z.string().describe('Payment period start date (YYYY-MM-DD).'),
    endDate:         z.string().describe('Payment period end date (YYYY-MM-DD).'),
  },
  async (input) => {
    try {
      const result = await b2b.SIP.submitRequest({
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
      sipRegistry.set(result.requisitionId, result);
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'sip_get_status',
  'Get the current status of a SIP requisition by its requisitionId. Returns the full SIPRequisition record including virtual account details and approval status.',
  {
    clientId:      z.string().describe('Visa B2B client identifier.'),
    requisitionId: z.string().describe('Requisition ID returned by sip_submit_request.'),
  },
  async (input) => {
    try {
      const result = await b2b.SIP.getStatus({
        messageId:     crypto.randomUUID(),
        clientId:      input.clientId,
        requisitionId: input.requisitionId,
      });
      sipRegistry.set(result.requisitionId, result);
      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'sip_approve_payment',
  '⚠️ REQUIRES CONFIRMATION. Buyer approves a supplier payment requisition (SIP flow) — this triggers actual fund movement on the Visa VPA network. Phase 1 (no token): validates inputs and returns a full preview plus a confirmationToken. Phase 2 (pass token): executes approval and returns the SIPApprovalResult with the new paymentId.',
  {
    confirmationToken: z.string().optional().describe('Omit on first call (Phase 1). Pass the token returned by Phase 1 to execute (Phase 2).'),
    clientId:          z.string().describe('Visa B2B client identifier.'),
    buyerId:           z.string().describe('Buyer organisation ID approving the request.'),
    requisitionId:     z.string().describe('Requisition ID to approve.'),
    approvedAmount:    z.number().describe('Amount to approve (may differ from requested amount for partial approvals).'),
    currencyCode:      z.string().optional().describe('ISO 4217 numeric currency code. Defaults to 840 (USD).'),
    memo:              z.string().optional().describe('Optional approval memo.'),
  },
  async (input) => {
    try {
      const { confirmationToken, ...params } = input;

      // Phase 1 — dry run, return preview + token
      if (!confirmationToken || confirmationToken === 'dry-run') {
        const token = createConfirmationToken('sip_approve_payment', params);
        return ok({
          requiresConfirmation: true,
          confirmationToken:    token,
          preview: {
            action:         'Approve SIP requisition — trigger fund movement',
            clientId:       params.clientId,
            buyerId:        params.buyerId,
            requisitionId:  params.requisitionId,
            approvedAmount: params.approvedAmount,
            currencyCode:   params.currencyCode ?? '840',
            memo:           params.memo ?? '',
          },
          instructions: 'Review the approval details above. To approve and move funds, call sip_approve_payment again with the same parameters plus confirmationToken.',
          tokenExpiresIn: '5 minutes',
        });
      }

      // Phase 2 — validate token, execute
      const validation = validateConfirmationToken(confirmationToken, 'sip_approve_payment', params);
      if (!validation.valid) return err(validation.error!);
      consumeToken(confirmationToken);

      const result = await b2b.SIP.approve({
        messageId:      crypto.randomUUID(),
        clientId:       params.clientId,
        buyerId:        params.buyerId,
        requisitionId:  params.requisitionId,
        approvedAmount: params.approvedAmount,
        currencyCode:   params.currencyCode ?? '840',
        memo:           params.memo,
      });

      // Update requisition status in registry
      const existing = sipRegistry.get(params.requisitionId);
      if (existing) sipRegistry.set(params.requisitionId, { ...existing, status: 'approved' });

      return ok({ ...result, requiresConfirmation: false });
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

server.tool(
  'sip_reject_payment',
  'Buyer rejects a supplier payment requisition. The requisition must be in pending_approval status. Returns the updated SIPRequisition with status set to rejected.',
  {
    clientId:      z.string().describe('Visa B2B client identifier.'),
    requisitionId: z.string().describe('Requisition ID to reject.'),
    reason:        z.string().optional().describe('Optional rejection reason communicated to the supplier.'),
  },
  async (input) => {
    try {
      const result = await b2b.SIP.reject({
        messageId:     crypto.randomUUID(),
        clientId:      input.clientId,
        requisitionId: input.requisitionId,
        reason:        input.reason,
      });

      // Update status in registry
      const existing = sipRegistry.get(input.requisitionId);
      if (existing) sipRegistry.set(input.requisitionId, { ...existing, status: 'rejected' });

      return ok(result);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// MCP Resources
//
// Read-only context that agents can query at any time without consuming a tool
// call. Both resources are backed by the in-memory registry populated above.
// ─────────────────────────────────────────────────────────────────────────────

server.resource(
  'pending-requisitions',
  'b2b://pending-requisitions',
  {
    description: 'Live list of SIP requisitions currently awaiting buyer approval. Updated automatically as sip_submit_request and sip_approve/reject_payment tools execute.',
    mimeType:    'application/json',
  },
  async (_uri) => {
    const pending = [...sipRegistry.values()].filter(
      (r) => r.status === 'pending_approval',
    );

    return {
      contents: [{
        uri:      'b2b://pending-requisitions',
        mimeType: 'application/json',
        text:     JSON.stringify({
          count:         pending.length,
          requisitions:  pending,
          retrievedAt:   new Date().toISOString(),
        }, null, 2),
      }],
    };
  },
);

server.resource(
  'payment-history',
  'b2b://payment-history',
  {
    description: 'Full payment history for this session — all BIP payments and all SIP requisitions in any status (pending, approved, rejected). Sorted newest-first.',
    mimeType:    'application/json',
  },
  async (_uri) => {
    const bipPayments = [...bipRegistry.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const sipRequisitions = [...sipRegistry.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      contents: [{
        uri:      'b2b://payment-history',
        mimeType: 'application/json',
        text:     JSON.stringify({
          bip: {
            total:    bipPayments.length,
            payments: bipPayments,
          },
          sip: {
            total:         sipRequisitions.length,
            pending:       sipRequisitions.filter((r) => r.status === 'pending_approval').length,
            approved:      sipRequisitions.filter((r) => r.status === 'approved').length,
            rejected:      sipRequisitions.filter((r) => r.status === 'rejected').length,
            requisitions:  sipRequisitions,
          },
          retrievedAt: new Date().toISOString(),
        }, null, 2),
      }],
    };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
