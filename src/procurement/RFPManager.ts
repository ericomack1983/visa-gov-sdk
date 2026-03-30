import { RFP, Bid, ScoredBid, RFPStatus } from '../types';
import { SupplierMatcher } from './SupplierMatcher';

// ─────────────────────────────────────────────────────────────────────────────
// RFPManager — RFP lifecycle management
//
// Manages the full procurement lifecycle:
//   Draft → Open → Evaluating → Awarded → Paid
// ─────────────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export interface CreateRFPParams {
  title: string;
  description: string;
  budgetCeiling: number;
  deadline: string;       // ISO 8601
  category: string;
}

export interface SubmitBidParams {
  rfpId: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  deliveryDays: number;
  notes?: string;
}

/**
 * RFPManager
 *
 * In-memory RFP store with full lifecycle management.
 * Integrates with SupplierMatcher for AI-powered bid evaluation.
 *
 * @example
 * ```ts
 * const manager = new RFPManager();
 *
 * const rfp = manager.create({
 *   title: 'IT Infrastructure 2025',
 *   description: 'Servers, networking, and cloud services',
 *   budgetCeiling: 500_000,
 *   deadline: '2025-06-01',
 *   category: 'IT Infrastructure',
 * });
 *
 * manager.publish(rfp.id);
 *
 * manager.submitBid({
 *   rfpId: rfp.id,
 *   supplierId: 'sup-001',
 *   supplierName: 'TechCorp',
 *   amount: 420_000,
 *   deliveryDays: 45,
 * });
 *
 * const { rankedBids, winner } = manager.evaluate(rfp.id, suppliers);
 * manager.award(rfp.id, winner.supplier.id);
 * ```
 */
export class RFPManager {
  private rfps = new Map<string, RFP>();
  private readonly matcher: SupplierMatcher;

  constructor(matcher?: SupplierMatcher) {
    this.matcher = matcher ?? new SupplierMatcher();
  }

  /** Create a new RFP in Draft status. */
  create(params: CreateRFPParams): RFP {
    const rfp: RFP = {
      id:            generateId('RFP'),
      title:         params.title,
      description:   params.description,
      budgetCeiling: params.budgetCeiling,
      deadline:      params.deadline,
      category:      params.category,
      status:        'Draft',
      createdAt:     new Date().toISOString(),
      bids:          [],
    };
    this.rfps.set(rfp.id, rfp);
    return rfp;
  }

  /** Publish an RFP (Draft → Open), making it visible to suppliers. */
  publish(rfpId: string): RFP {
    return this.transition(rfpId, 'Open');
  }

  /**
   * Submit a bid from a supplier.
   * RFP must be in 'Open' status.
   */
  submitBid(params: SubmitBidParams): Bid {
    const rfp = this.getOrThrow(params.rfpId);
    if (rfp.status !== 'Open') {
      throw new Error(`RFP ${params.rfpId} is not open for bids (status: ${rfp.status})`);
    }

    const bid: Bid = {
      id:           generateId('BID'),
      rfpId:        params.rfpId,
      supplierId:   params.supplierId,
      supplierName: params.supplierName,
      amount:       params.amount,
      deliveryDays: params.deliveryDays,
      notes:        params.notes ?? '',
      submittedAt:  new Date().toISOString(),
    };

    rfp.bids.push(bid);
    return bid;
  }

  /**
   * Run AI evaluation on all submitted bids.
   * Transitions RFP to 'Evaluating' status and stores ranked results.
   */
  evaluate(rfpId: string, suppliers: import('../types').Supplier[]): import('../types').EvaluationResult {
    const rfp = this.getOrThrow(rfpId);
    if (rfp.bids.length === 0) {
      throw new Error(`No bids submitted for RFP ${rfpId}`);
    }

    this.transition(rfpId, 'Evaluating');

    const result = this.matcher.evaluate({ rfp, bids: rfp.bids, suppliers });
    rfp.evaluationResults = result.rankedBids;
    return result;
  }

  /**
   * Award the RFP to a supplier (transitions to 'Awarded').
   * If winnerId differs from the AI recommendation, an override warning is generated.
   */
  award(rfpId: string, winnerId: string, justification?: string): { rfp: RFP; overrideNarrative?: string } {
    const rfp = this.getOrThrow(rfpId);
    let overrideNarrative: string | undefined;

    if (rfp.evaluationResults && rfp.evaluationResults.length > 0) {
      const aiWinnerId = rfp.evaluationResults[0].supplier.id;
      if (winnerId !== aiWinnerId) {
        const selected = rfp.evaluationResults.find((r) => r.supplier.id === winnerId);
        const best     = rfp.evaluationResults[0];
        if (selected) {
          overrideNarrative       = this.matcher.generateOverrideNarrative(selected, best);
          rfp.overrideWinnerId    = winnerId;
          rfp.overrideJustification = justification;
        }
      }
    }

    rfp.selectedWinnerId = winnerId;
    this.transition(rfpId, 'Awarded');
    return { rfp, overrideNarrative };
  }

  /** Mark the RFP as Paid after payment is settled. */
  markPaid(rfpId: string): RFP {
    return this.transition(rfpId, 'Paid');
  }

  /** Retrieve an RFP by ID. */
  get(rfpId: string): RFP | undefined {
    return this.rfps.get(rfpId);
  }

  /** List all RFPs, optionally filtered by status. */
  list(status?: RFPStatus): RFP[] {
    const all = Array.from(this.rfps.values());
    return status ? all.filter((r) => r.status === status) : all;
  }

  /** Hydrate the manager with pre-existing RFPs (e.g. from a database). */
  load(rfps: RFP[]): void {
    for (const rfp of rfps) this.rfps.set(rfp.id, rfp);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private getOrThrow(rfpId: string): RFP {
    const rfp = this.rfps.get(rfpId);
    if (!rfp) throw new Error(`RFP not found: ${rfpId}`);
    return rfp;
  }

  private transition(rfpId: string, status: RFPStatus): RFP {
    const rfp  = this.getOrThrow(rfpId);
    rfp.status = status;
    return rfp;
  }
}
