import {
  VCNIssueParams,
  VCNIssueResult,
  VCNIssueStep,
  IssuedCard,
  PaymentControls,
} from '../types';

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
}
