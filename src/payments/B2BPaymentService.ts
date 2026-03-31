// ─────────────────────────────────────────────────────────────────────────────
// B2BPaymentService — Buyer Initiated Payment (BIP) & Supplier Initiated Payment (SIP)
//
// Two distinct payment initiation flows built on top of the Visa B2B VPA API:
//
//   BIP (Buyer Initiated Payment)
//     Buyer provisions a single-use virtual card for a specific invoice amount
//     and pushes card details to the supplier through the VPA network.
//     Endpoints:
//       POST /vpa/v1/paymentService/processPayments   (paymentDeliveryMethod: 'BIP')
//       POST /vpa/v1/paymentService/getPaymentDetailURL
//       POST /vpa/v1/paymentService/getPaymentDetails
//       POST /vpa/v1/paymentService/cancelPayment
//       POST /vpa/v1/paymentService/resendPayment
//
//   SIP (Supplier Initiated Payment)
//     Supplier submits a payment requisition; VPA pre-provisions a virtual
//     account for the supplier and notifies the buyer for approval.
//     Buyer then calls processPayments with the requisitionId to authorise.
//     Endpoints:
//       POST /vpa/v1/requisitionService               (supplier submits)
//       POST /vpa/v1/paymentService/processPayments   (buyer approves)
//       POST /vpa/v1/paymentService/cancelPayment     (buyer rejects)
//       POST /vpa/v1/paymentService/getPaymentDetails (status check)
// ─────────────────────────────────────────────────────────────────────────────

import { resolveFetch } from '../client';
import type {
  VPAApiConfig,
  VPAPaymentStatus,
  BIPInitiateParams,
  BIPPayment,
  SIPSubmitParams,
  SIPRequisition,
  SIPApproveParams,
  SIPApprovalResult,
} from '../types/vpa';

export type { VPAApiConfig } from '../types/vpa';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function isoNow(): string {
  return new Date().toISOString();
}

function genVAN(): string {
  return '4' + Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('');
}

function genExpiry(yearsAhead = 1): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + yearsAhead);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ── In-memory sandbox store ───────────────────────────────────────────────────

interface BIPSIPStore {
  bipPayments:      Map<string, BIPPayment>;
  sipRequisitions:  Map<string, SIPRequisition>;
}

function createStore(): BIPSIPStore {
  return {
    bipPayments:     new Map(),
    sipRequisitions: new Map(),
  };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function apiRequest<T>(
  config: VPAApiConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (config.credentials) {
    const token = Buffer.from(
      `${config.credentials.userId}:${config.credentials.password}`,
    ).toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  }

  const _fetch = resolveFetch({
    fetch: config.fetch as ((url: string, init: RequestInit) => Promise<Response>) | undefined,
    cert: config.cert,
    key:  config.key,
    ca:   config.ca,
  });

  const res = await _fetch(`${config.baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`B2B API error [${method} ${path}]: ${res.status} ${res.statusText} — ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

// ─────────────────────────────────────────────────────────────────────────────
// BIPService — Buyer Initiated Payment
// ─────────────────────────────────────────────────────────────────────────────

class BIPService {
  constructor(
    private readonly store: BIPSIPStore,
    private readonly api: VPAApiConfig | null,
  ) {}

  /**
   * Initiate a Buyer-Initiated Payment (BIP).
   *
   * Provisions a single-use virtual card locked to the exact invoice amount
   * and pushes it to the supplier through the Visa VPA network.
   *
   * Endpoints:
   *   POST /vpa/v1/paymentService/processPayments     → creates payment + card
   *   POST /vpa/v1/paymentService/getPaymentDetailURL → retrieves supplier link
   *
   * @example
   * ```ts
   * const b2b = B2BPaymentService.live(apiConfig);
   *
   * const payment = await b2b.BIP.initiate({
   *   messageId: crypto.randomUUID(),
   *   clientId:  'B2BWS_1_1_9999',
   *   buyerId:   '9999',
   *   supplierId: 'SUPP-001',
   *   paymentAmount: 4750.00,
   *   currencyCode: '840',
   *   invoiceNumber: 'INV-2026-042',
   * });
   *
   * console.log(payment.virtualCard?.accountNumber);  // 4xxx xxxx xxxx xxxx
   * console.log(payment.paymentDetailUrl);            // supplier card-entry URL
   * ```
   */
  async initiate(params: BIPInitiateParams): Promise<BIPPayment> {
    if (this.api) {
      // Step 1 — create the payment instruction with BIP delivery method
      const payment = await apiRequest<Record<string, unknown>>(
        this.api, 'POST', '/vpa/v1/paymentService/processPayments',
        {
          messageId:             params.messageId,
          clientId:              params.clientId,
          buyerId:               params.buyerId,
          supplierId:            params.supplierId,
          paymentAmount:         params.paymentAmount,
          currencyCode:          params.currencyCode,
          paymentDeliveryMethod: 'BIP',
          invoiceNumber:         params.invoiceNumber,
          memo:                  params.memo,
          paymentDate:           params.paymentDate ?? isoNow().split('T')[0],
        },
      );

      const paymentId = (payment.paymentId as string) ?? uuid();

      // Step 2 — retrieve the time-limited supplier card-entry URL
      let paymentDetailUrl: string | undefined;
      try {
        const urlRes = await apiRequest<Record<string, unknown>>(
          this.api, 'POST', '/vpa/v1/paymentService/getPaymentDetailURL',
          { messageId: params.messageId, clientId: params.clientId, paymentId },
        );
        paymentDetailUrl = urlRes.url as string | undefined;
      } catch {
        // URL endpoint may require additional permissions; non-fatal
      }

      return {
        paymentId,
        buyerId:          params.buyerId,
        supplierId:       params.supplierId,
        paymentAmount:    params.paymentAmount,
        currencyCode:     params.currencyCode,
        deliveryMethod:   'BIP',
        status:           (payment.status as VPAPaymentStatus) ?? 'pending',
        virtualCard:      payment.accountNumber
          ? { accountNumber: payment.accountNumber as string, expiryDate: (payment.expiryDate as string) ?? '' }
          : undefined,
        paymentDetailUrl,
        invoiceNumber:    params.invoiceNumber,
        createdAt:        (payment.createdAt as string) ?? isoNow(),
        updatedAt:        (payment.updatedAt as string) ?? isoNow(),
      };
    }

    // ── Sandbox simulation ────────────────────────────────────────────────────
    const paymentId   = 'BIP-' + uuid().slice(0, 8).toUpperCase();
    const van         = genVAN();
    const expiryDate  = genExpiry(params.validDays ? Math.ceil(params.validDays / 365) : 1);
    const cvv2        = String(100 + Math.floor(Math.random() * 900));

    const bipPayment: BIPPayment = {
      paymentId,
      buyerId:         params.buyerId,
      supplierId:      params.supplierId,
      paymentAmount:   params.paymentAmount,
      currencyCode:    params.currencyCode,
      deliveryMethod:  'BIP',
      status:          'pending',
      virtualCard:     { accountNumber: van, expiryDate, cvv2 },
      paymentDetailUrl: `https://sandbox.api.visa.com/vpa/v1/payment/${paymentId}/entry`,
      invoiceNumber:   params.invoiceNumber,
      createdAt:       isoNow(),
      updatedAt:       isoNow(),
    };
    this.store.bipPayments.set(paymentId, bipPayment);
    return bipPayment;
  }

  /**
   * Retrieve the current status of a BIP payment.
   * Endpoint: POST /vpa/v1/paymentService/getPaymentDetails
   */
  async getStatus(
    params: { clientId: string; messageId: string; paymentId: string },
  ): Promise<BIPPayment> {
    if (this.api) {
      const res = await apiRequest<Record<string, unknown>>(
        this.api, 'POST', '/vpa/v1/paymentService/getPaymentDetails', params,
      );
      return {
        paymentId:      params.paymentId,
        buyerId:        res.buyerId as string,
        supplierId:     res.supplierId as string,
        paymentAmount:  res.paymentAmount as number,
        currencyCode:   res.currencyCode as string,
        deliveryMethod: 'BIP',
        status:         res.status as VPAPaymentStatus,
        invoiceNumber:  res.invoiceNumber as string | undefined,
        createdAt:      res.createdAt as string,
        updatedAt:      res.updatedAt as string | undefined,
      };
    }
    const p = this.store.bipPayments.get(params.paymentId);
    if (!p) throw new Error(`BIP payment not found: ${params.paymentId}`);
    return p;
  }

  /**
   * Cancel a BIP payment (only valid while status is 'pending' or 'unmatched').
   * Endpoint: POST /vpa/v1/paymentService/cancelPayment
   */
  async cancel(
    params: { clientId: string; messageId: string; paymentId: string },
  ): Promise<BIPPayment> {
    if (this.api) {
      await apiRequest<unknown>(
        this.api, 'POST', '/vpa/v1/paymentService/cancelPayment', params,
      );
      return { ...(await this.getStatus(params)), status: 'cancelled' };
    }
    const p = this.store.bipPayments.get(params.paymentId);
    if (!p) throw new Error(`BIP payment not found: ${params.paymentId}`);
    if (p.status !== 'pending' && p.status !== 'unmatched') {
      throw new Error(`Cannot cancel BIP payment in status: ${p.status}`);
    }
    p.status    = 'cancelled';
    p.updatedAt = isoNow();
    return p;
  }

  /**
   * Resend the card notification to the supplier.
   * Endpoint: POST /vpa/v1/paymentService/resendPayment
   */
  async resend(
    params: { clientId: string; messageId: string; paymentId: string },
  ): Promise<BIPPayment> {
    if (this.api) {
      await apiRequest<unknown>(
        this.api, 'POST', '/vpa/v1/paymentService/resendPayment', params,
      );
      return this.getStatus(params);
    }
    const p = this.store.bipPayments.get(params.paymentId);
    if (!p) throw new Error(`BIP payment not found: ${params.paymentId}`);
    p.updatedAt = isoNow();
    return p;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIPService — Supplier Initiated Payment
// ─────────────────────────────────────────────────────────────────────────────

class SIPService {
  constructor(
    private readonly store: BIPSIPStore,
    private readonly api: VPAApiConfig | null,
  ) {}

  /**
   * Supplier submits a payment request (requisition).
   *
   * The VPA network provisions a virtual account for the supplier and
   * notifies the buyer. The requisition stays in 'pending_approval' until
   * the buyer calls approve().
   *
   * Endpoint: POST /vpa/v1/requisitionService
   *
   * @example
   * ```ts
   * const b2b = B2BPaymentService.live(apiConfig);
   *
   * const req = await b2b.SIP.submitRequest({
   *   messageId:       crypto.randomUUID(),
   *   clientId:        'B2BWS_1_1_9999',
   *   supplierId:      'SUPP-001',
   *   buyerId:         '9999',
   *   requestedAmount: 2300.00,
   *   currencyCode:    '840',
   *   invoiceNumber:   'INV-SUPP-2026-007',
   *   startDate:       '2026-04-01',
   *   endDate:         '2026-04-30',
   * });
   *
   * console.log(req.requisitionId);              // SIP-REQ-XXXXXXXX
   * console.log(req.virtualAccount?.accountNumber); // virtual card issued to supplier
   * ```
   */
  async submitRequest(params: SIPSubmitParams): Promise<SIPRequisition> {
    if (this.api) {
      const res = await apiRequest<Record<string, unknown>>(
        this.api, 'POST', '/vpa/v1/requisitionService',
        {
          messageId:             params.messageId,
          clientId:              params.clientId,
          buyerId:               params.buyerId,
          supplierId:            params.supplierId,
          action:                'A',
          paymentDeliveryMethod: 'SIP',
          paymentAmount:         params.requestedAmount,
          currencyCode:          params.currencyCode,
          invoiceNumber:         params.invoiceNumber,
          startDate:             params.startDate,
          endDate:               params.endDate,
          timeZone:              params.timeZone ?? 'UTC',
        },
      );

      return {
        requisitionId:   (res.requisitionId as string) ?? uuid(),
        supplierId:      params.supplierId,
        buyerId:         params.buyerId,
        requestedAmount: params.requestedAmount,
        currencyCode:    params.currencyCode,
        status:          'pending_approval',
        virtualAccount:  res.accountNumber
          ? { accountNumber: res.accountNumber as string, expiryDate: (res.expiryDate as string) ?? '' }
          : undefined,
        invoiceNumber:   params.invoiceNumber,
        createdAt:       (res.createdAt as string) ?? isoNow(),
      };
    }

    // ── Sandbox simulation ────────────────────────────────────────────────────
    const requisitionId = 'SIP-REQ-' + uuid().slice(0, 8).toUpperCase();
    const van           = genVAN();

    const requisition: SIPRequisition = {
      requisitionId,
      supplierId:      params.supplierId,
      buyerId:         params.buyerId,
      requestedAmount: params.requestedAmount,
      currencyCode:    params.currencyCode,
      status:          'pending_approval',
      virtualAccount:  { accountNumber: van, expiryDate: genExpiry(1) },
      invoiceNumber:   params.invoiceNumber,
      createdAt:       isoNow(),
    };
    this.store.sipRequisitions.set(requisitionId, requisition);
    return requisition;
  }

  /**
   * Buyer approves a pending SIP requisition and triggers settlement.
   *
   * Endpoint: POST /vpa/v1/paymentService/processPayments
   *
   * @example
   * ```ts
   * const result = await b2b.SIP.approve({
   *   messageId:      crypto.randomUUID(),
   *   clientId:       'B2BWS_1_1_9999',
   *   buyerId:        '9999',
   *   requisitionId:  req.requisitionId,
   *   approvedAmount: 2300.00,
   *   currencyCode:   '840',
   * });
   *
   * console.log(result.paymentId);  // PAY-XXXXXXXX (new payment record)
   * console.log(result.status);     // 'approved'
   * ```
   */
  async approve(params: SIPApproveParams): Promise<SIPApprovalResult> {
    if (this.api) {
      const res = await apiRequest<Record<string, unknown>>(
        this.api, 'POST', '/vpa/v1/paymentService/processPayments',
        {
          messageId:             params.messageId,
          clientId:              params.clientId,
          buyerId:               params.buyerId,
          paymentDeliveryMethod: 'SIP',
          requisitionId:         params.requisitionId,
          paymentAmount:         params.approvedAmount,
          currencyCode:          params.currencyCode,
          memo:                  params.memo,
        },
      );

      return {
        requisitionId:  params.requisitionId,
        paymentId:      (res.paymentId as string) ?? uuid(),
        status:         'approved',
        approvedAmount: params.approvedAmount ?? (res.paymentAmount as number),
        currencyCode:   (params.currencyCode ?? res.currencyCode) as string,
        approvedAt:     isoNow(),
      };
    }

    // ── Sandbox simulation ────────────────────────────────────────────────────
    const req = this.store.sipRequisitions.get(params.requisitionId);
    if (!req) throw new Error(`SIP requisition not found: ${params.requisitionId}`);
    if (req.status !== 'pending_approval') {
      throw new Error(`Cannot approve SIP requisition in status: ${req.status}`);
    }

    req.status    = 'approved';
    req.updatedAt = isoNow();

    return {
      requisitionId:  params.requisitionId,
      paymentId:      'SIP-PAY-' + uuid().slice(0, 8).toUpperCase(),
      status:         'approved',
      approvedAmount: params.approvedAmount ?? req.requestedAmount,
      currencyCode:   params.currencyCode   ?? req.currencyCode,
      approvedAt:     isoNow(),
    };
  }

  /**
   * Buyer rejects a supplier's payment request.
   *
   * Endpoint: POST /vpa/v1/paymentService/cancelPayment
   */
  async reject(
    params: { clientId: string; messageId: string; requisitionId: string; reason?: string },
  ): Promise<SIPRequisition> {
    if (this.api) {
      await apiRequest<unknown>(
        this.api, 'POST', '/vpa/v1/paymentService/cancelPayment',
        { clientId: params.clientId, messageId: params.messageId, paymentId: params.requisitionId },
      );
      // Return a minimal rejected record since cancelPayment only returns a status
      return {
        requisitionId:   params.requisitionId,
        supplierId:      '',
        buyerId:         '',
        requestedAmount: 0,
        currencyCode:    '840',
        status:          'rejected',
        createdAt:       isoNow(),
        updatedAt:       isoNow(),
      };
    }

    const req = this.store.sipRequisitions.get(params.requisitionId);
    if (!req) throw new Error(`SIP requisition not found: ${params.requisitionId}`);
    if (req.status !== 'pending_approval') {
      throw new Error(`Cannot reject SIP requisition in status: ${req.status}`);
    }
    req.status    = 'rejected';
    req.updatedAt = isoNow();
    return req;
  }

  /**
   * Get the current status of a SIP requisition.
   *
   * Endpoint: POST /vpa/v1/paymentService/getPaymentDetails
   */
  async getStatus(
    params: { clientId: string; messageId: string; requisitionId: string },
  ): Promise<SIPRequisition> {
    if (this.api) {
      const res = await apiRequest<Record<string, unknown>>(
        this.api, 'POST', '/vpa/v1/paymentService/getPaymentDetails',
        { clientId: params.clientId, messageId: params.messageId, paymentId: params.requisitionId },
      );
      return {
        requisitionId:   params.requisitionId,
        supplierId:      (res.supplierId as string) ?? '',
        buyerId:         (res.buyerId   as string) ?? '',
        requestedAmount: (res.paymentAmount as number) ?? 0,
        currencyCode:    (res.currencyCode  as string) ?? '840',
        status:          res.status === 'cancelled' ? 'rejected' : (res.status as SIPRequisition['status']),
        invoiceNumber:   res.invoiceNumber as string | undefined,
        createdAt:       (res.createdAt as string) ?? isoNow(),
        updatedAt:       res.updatedAt  as string | undefined,
      };
    }
    const req = this.store.sipRequisitions.get(params.requisitionId);
    if (!req) throw new Error(`SIP requisition not found: ${params.requisitionId}`);
    return req;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// B2BPaymentService — main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * B2BPaymentService — Visa B2B BIP and SIP payment flows
 *
 * Exposes two sub-services:
 *   `.BIP` — Buyer Initiated Payment (buyer provisions card, pushes to supplier)
 *   `.SIP` — Supplier Initiated Payment (supplier submits request, buyer approves)
 *
 * @example
 * ```ts
 * import { B2BPaymentService } from '@visa-gov/sdk';
 * import fs from 'fs';
 *
 * // Sandbox (no credentials required)
 * const b2b = B2BPaymentService.sandbox();
 *
 * // Live — Visa B2B sandbox / certification
 * const b2b = B2BPaymentService.live({
 *   baseUrl: 'https://sandbox.api.visa.com',
 *   credentials: { userId: process.env.VISA_USER!, password: process.env.VISA_PWD! },
 *   cert: fs.readFileSync('./certs/cert.pem',           'utf-8'),
 *   key:  fs.readFileSync('./certs/privateKey-....pem', 'utf-8'),
 *   ca:   caBundle,
 * });
 *
 * // ── BIP flow ──────────────────────────────────────────────────────────────
 * const payment = await b2b.BIP.initiate({
 *   messageId: crypto.randomUUID(), clientId: 'B2BWS_1_1_9999',
 *   buyerId: '9999', supplierId: 'SUPP-001',
 *   paymentAmount: 4750.00, currencyCode: '840',
 *   invoiceNumber: 'INV-2026-042',
 * });
 * console.log(payment.virtualCard?.accountNumber); // 4xxx xxxx xxxx xxxx
 *
 * // ── SIP flow ──────────────────────────────────────────────────────────────
 * const req = await b2b.SIP.submitRequest({
 *   messageId: crypto.randomUUID(), clientId: 'B2BWS_1_1_9999',
 *   supplierId: 'SUPP-001', buyerId: '9999',
 *   requestedAmount: 2300.00, currencyCode: '840',
 *   invoiceNumber: 'INV-SUPP-2026-007',
 *   startDate: '2026-04-01', endDate: '2026-04-30',
 * });
 *
 * const result = await b2b.SIP.approve({
 *   messageId: crypto.randomUUID(), clientId: 'B2BWS_1_1_9999',
 *   buyerId: '9999', requisitionId: req.requisitionId,
 *   approvedAmount: 2300.00, currencyCode: '840',
 * });
 * console.log(result.paymentId);  // SIP-PAY-XXXXXXXX
 * ```
 */
export class B2BPaymentService {
  /** Buyer Initiated Payment — provisions virtual card and pushes to supplier. */
  readonly BIP: BIPService;
  /** Supplier Initiated Payment — supplier submits request, buyer approves. */
  readonly SIP: SIPService;

  private readonly store: BIPSIPStore;

  constructor(apiConfig?: VPAApiConfig) {
    this.store = createStore();
    const api  = apiConfig ?? null;
    this.BIP   = new BIPService(this.store, api);
    this.SIP   = new SIPService(this.store, api);
  }

  /** Create an in-memory sandbox instance (no credentials required). */
  static sandbox(): B2BPaymentService {
    return new B2BPaymentService();
  }

  /** Create a live instance connected to the Visa B2B API. */
  static live(config: VPAApiConfig): B2BPaymentService {
    return new B2BPaymentService(config);
  }
}
