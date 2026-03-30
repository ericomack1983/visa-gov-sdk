import {
  VCNIssueParams,
  VCNIssueResult,
  VCNIssueStep,
  IssuedCard,
  PaymentControls,
} from '../types';
import type {
  VCNRequestPayload,
  VCNRequestResponse,
  VCNIssuedAccount,
} from '../types/vcn-request';

// ─────────────────────────────────────────────────────────────────────────────
// VCNService — Virtual Card Number issuance via Visa VCN API (api.visa.com/vcn/v2/issue)
//
// Simulates the full Visa VCN issuance pipeline:
//   validating → contacting → generating → vpa → vpc → issued
// ─────────────────────────────────────────────────────────────────────────────

const ISSUE_STEPS: VCNIssueStep[] = [
  { key: 'validating',  label: 'Validating VCN request…',                 durationMs: 900  },
  { key: 'contacting',  label: 'Contacting issuer network…',              durationMs: 1400 },
  { key: 'generating',  label: 'Generating virtual card credentials…',    durationMs: 1100 },
  { key: 'vpa',         label: 'Creating VPA (Pseudo Accounts)…',         durationMs: 1200 },
  { key: 'vpc',         label: 'Applying Visa Payment Controls…',         durationMs: 1000 },
  { key: 'issued',      label: 'VCN issued successfully!',                durationMs: 0    },
];

export const MCC_CATEGORIES: { code: string; label: string }[] = [
  { code: '5065', label: 'Electrical Parts & Equipment' },
  { code: '5045', label: 'Computers & Peripherals' },
  { code: '5047', label: 'Medical & Dental Equipment' },
  { code: '5084', label: 'Industrial Machinery' },
  { code: '7389', label: 'Business Services' },
  { code: '7372', label: 'Software & IT Services' },
  { code: '5199', label: 'Raw Materials & Supplies' },
  { code: '5085', label: 'Industrial & Commercial Supplies' },
];

function randomLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateCardId(): string {
  return 'vcn_' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function formatExpiry(monthsFromNow: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsFromNow);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}

/**
 * VCNService
 *
 * Issues Virtual Card Numbers through the Visa VCN pipeline.
 *
 * @example
 * ```ts
 * const vcn = new VCNService();
 *
 * // Instant result (no delays)
 * const result = vcn.issue({ holderName: 'Gov Procurement', mccCode: '5047' });
 *
 * // Step-by-step with async timing (mirrors real API latency)
 * for await (const step of vcn.issueStepByStep({ holderName: 'Gov Procurement' })) {
 *   console.log(`[${step.key}] ${step.label}`);
 * }
 * ```
 */
export class VCNService {
  /**
   * Issue a VCN synchronously (all steps resolved instantly).
   * Use this when you only need the final card details.
   */
  issue(params: VCNIssueParams): VCNIssueResult {
    const controls: PaymentControls = {
      allowOnline:    params.controls?.allowOnline    ?? true,
      allowIntl:      params.controls?.allowIntl      ?? false,
      allowRecurring: params.controls?.allowRecurring ?? false,
    };

    const card: IssuedCard = {
      id:           generateCardId(),
      last4:        randomLast4(),
      expiry:       formatExpiry(params.expiryMonths ?? 36),
      holderName:   params.holderName,
      brand:        params.brand       ?? 'Visa',
      type:         params.type        ?? 'credit',
      usageType:    params.usageType   ?? 'single-use',
      mccCode:      params.mccCode,
      spendLimit:   params.spendLimit,
      status:       'active',
      controls,
      issuedAt:     new Date().toISOString(),
    };

    return { card, steps: ISSUE_STEPS, issuedAt: card.issuedAt };
  }

  /**
   * Issue a VCN asynchronously, yielding each pipeline step as it completes.
   * Use this to drive a progress UI or step-aware logging.
   *
   * @example
   * ```ts
   * for await (const { step, card } of vcn.issueStepByStep(params)) {
   *   if (card) console.log('Card ready:', card.last4);
   *   else console.log('Step:', step.label);
   * }
   * ```
   */
  async *issueStepByStep(
    params: VCNIssueParams,
  ): AsyncGenerator<{ step: VCNIssueStep; card: IssuedCard | null }> {
    for (const step of ISSUE_STEPS) {
      if (step.durationMs > 0) {
        await new Promise((r) => setTimeout(r, step.durationMs));
      }
      const isLast = step.key === 'issued';
      yield {
        step,
        card: isLast ? this.issue(params).card : null,
      };
      if (isLast) break;
    }
  }

  /** Returns the ordered list of VCN pipeline steps (useful for UI scaffolding). */
  getSteps(): VCNIssueStep[] {
    return ISSUE_STEPS;
  }

  /** Returns all supported MCC category codes. */
  getMCCCategories(): { code: string; label: string }[] {
    return MCC_CATEGORIES;
  }

  /**
   * Request one or more virtual cards via the Visa B2B Virtual Account
   * Payment Method API (`POST /vpa/v1/cards/provisioning`).
   *
   * In sandbox mode the call resolves immediately with simulated card data.
   * In live mode it POSTs to `{baseUrl}/vpa/v1/cards/provisioning` with
   * HTTP Basic authentication.
   *
   * @example
   * ```ts
   * import { VCNService, buildSPVRule, buildBlockRule } from '@visa-gov/sdk';
   *
   * const vcn = new VCNService();
   *
   * const response = await vcn.requestVirtualCard({
   *   clientId:    'B2BWS_1_1_9999',
   *   buyerId:     '9999',
   *   messageId:   Date.now().toString(),
   *   action:      'A',
   *   numberOfCards: '1',
   *   proxyPoolId: 'Proxy12345',
   *   requisitionDetails: {
   *     startDate: '2025-05-11',
   *     endDate:   '2025-06-01',
   *     timeZone:  'UTC-8',
   *     rules: [
   *       buildSPVRule({ spendLimitAmount: 5000, maxAuth: 10, currencyCode: '840', rangeType: 'monthly' }),
   *       buildBlockRule('ECOM'),
   *       buildBlockRule('ATM'),
   *     ],
   *   },
   * });
   *
   * console.log(response.accounts[0].accountNumber);
   * ```
   */
  async requestVirtualCard(
    payload: VCNRequestPayload,
    options?: {
      /** Visa API base URL (default: sandbox simulation — no HTTP call). */
      baseUrl?: string;
      /** HTTP Basic auth — required when baseUrl is provided. */
      credentials?: { userId: string; password: string };
      /** Injectable fetch — defaults to global fetch. */
      fetch?: typeof fetch;
    },
  ): Promise<VCNRequestResponse> {
    // ── Live mode ─────────────────────────────────────────────────────────────
    if (options?.baseUrl) {
      const { baseUrl, credentials, fetch: _fetch = fetch } = options;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (credentials) {
        const token = btoa(`${credentials.userId}:${credentials.password}`);
        headers['Authorization'] = `Basic ${token}`;
      }

      const res = await _fetch(`${baseUrl}/vpa/v1/cards/provisioning`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(
          `Visa VPA API error: ${res.status} ${res.statusText}`,
        );
      }

      return res.json() as Promise<VCNRequestResponse>;
    }

    // ── Sandbox simulation ────────────────────────────────────────────────────
    const count = parseInt(payload.numberOfCards, 10) || 1;

    const accounts: VCNIssuedAccount[] = Array.from({ length: count }, () => ({
      accountNumber: '4' + Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join(''),
      proxyNumber:   'PRX' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      expiryDate:    (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 3);
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      })(),
      cvv2:   String(Math.floor(100 + Math.random() * 900)),
      status: 'active' as const,
    }));

    return {
      messageId:       payload.messageId,
      responseCode:    '00',
      responseMessage: 'Virtual card(s) issued successfully',
      accounts,
      requestedAt:     new Date().toISOString(),
    };
  }
}
