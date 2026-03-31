import {
  Bid,
  Supplier,
  RFP,
  DimensionScores,
  ScoredBid,
  ScoringWeights,
  EvaluationResult,
} from '../types';
import { VisaNetworkService } from './VisaNetworkService';

// ─────────────────────────────────────────────────────────────────────────────
// SupplierMatcher — AI-powered supplier scoring and ranking engine
//
// Scores suppliers across six weighted dimensions:
//   price (25%), delivery (20%), reliability (20%), compliance (15%), risk (10%)
//   visaMatchScore (10%) — derived from Visa Supplier Matching Service matchConfidence
//
// visaMatchScore is 0 in a plain evaluate() call (no Visa data).
// Use evaluateWithVisaCheck() to populate it from the live Visa SMS API.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_WEIGHTS: ScoringWeights = {
  price:          0.25,
  delivery:       0.20,
  reliability:    0.20,
  compliance:     0.15,
  risk:           0.10,
  visaMatchScore: 0.10,
};

function computeDimensions(
  bid: Bid,
  supplier: Supplier,
  rfp: RFP,
  visaMatchScore = 0,
): DimensionScores {
  const price = Math.max(0, Math.min(100,
    (1 - bid.amount / rfp.budgetCeiling) * 100,
  ));
  const delivery = Math.max(0, Math.min(100,
    (1 - bid.deliveryDays / 365) * 100,
  ));
  const reliability = supplier.pastPerformance;
  const compliance  =
    (supplier.complianceStatus === 'Compliant'      ? 60 :
     supplier.complianceStatus === 'Pending Review' ? 30 : 0) +
    Math.min(40, supplier.certifications.length * 10);
  const risk = Math.max(0, 100 - supplier.riskScore);

  return { price, delivery, reliability, compliance, risk, visaMatchScore };
}

function computeComposite(dimensions: DimensionScores, weights: ScoringWeights): number {
  return Math.round(
    dimensions.price          * weights.price          +
    dimensions.delivery       * weights.delivery       +
    dimensions.reliability    * weights.reliability    +
    dimensions.compliance     * weights.compliance     +
    dimensions.risk           * weights.risk           +
    dimensions.visaMatchScore * weights.visaMatchScore,
  );
}

/**
 * SupplierMatcher
 *
 * Evaluates and ranks supplier bids for an RFP using a weighted multi-criteria model.
 *
 * @example
 * ```ts
 * const matcher = new SupplierMatcher();
 *
 * const result = matcher.evaluate({ rfp, bids, suppliers });
 * console.log(result.winner.supplier.name, result.winner.composite);
 * console.log(result.narrative);
 *
 * // With custom weights (e.g. price-heavy procurement)
 * const priceFocused = SupplierMatcher.withWeights({ price: 0.50, delivery: 0.15 });
 *
 * // With Visa Supplier Match Score (populates visaMatchScore from Visa SMS API)
 * const matcher = new SupplierMatcher({ visaNetwork: VisaNetworkService.sandbox() });
 * const result = await matcher.evaluateWithVisaCheck({ rfp, bids, suppliers, countryCode: 'US' });
 * console.log(result.rankedBids[0].dimensions.visaMatchScore); // e.g. 95
 * ```
 */
export class SupplierMatcher {
  private readonly weights: ScoringWeights;
  private readonly visaNetwork: VisaNetworkService | null;

  constructor(options: ScoringWeights | { weights?: Partial<ScoringWeights>; visaNetwork?: VisaNetworkService } = DEFAULT_WEIGHTS) {
    // Support both legacy `new SupplierMatcher(weights)` and new options object
    if (this.isWeights(options)) {
      this.weights     = this.normalise(options);
      this.visaNetwork = null;
    } else {
      this.weights     = this.normalise({ ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) });
      this.visaNetwork = options.visaNetwork ?? null;
    }
  }

  /** Create a SupplierMatcher with custom dimension weights (auto-normalised to sum 1.0). */
  static withWeights(partial: Partial<ScoringWeights>): SupplierMatcher {
    return new SupplierMatcher({ weights: partial });
  }

  /** Create a SupplierMatcher backed by the Visa Supplier Match Service for registry verification. */
  static withVisaNetwork(
    visaNetwork: VisaNetworkService,
    weights?: Partial<ScoringWeights>,
  ): SupplierMatcher {
    return new SupplierMatcher({ visaNetwork, weights });
  }

  /** Returns the active scoring weights. */
  getWeights(): ScoringWeights {
    return { ...this.weights };
  }

  /**
   * Evaluate and rank all bids for an RFP.
   * Returns a full EvaluationResult with ranked bids and an AI narrative.
   * `visaMatchScore` dimension will be 0 — use evaluateWithVisaCheck() to populate it.
   */
  evaluate(params: { rfp: RFP; bids: Bid[]; suppliers: Supplier[] }): EvaluationResult {
    const { rfp, bids, suppliers } = params;
    const ranked = this.scoreBids(bids, suppliers, rfp);

    if (ranked.length === 0) {
      throw new Error(`No valid bids found for RFP ${rfp.id}`);
    }

    return {
      rfpId:       rfp.id,
      rankedBids:  ranked,
      winner:      ranked[0],
      evaluatedAt: new Date().toISOString(),
      narrative:   this.generateNarrative(ranked),
    };
  }

  /**
   * Score and rank a list of bids.
   * @param visaScores — optional map of supplierId → visaMatchScore (0-100)
   */
  scoreBids(
    bids: Bid[],
    suppliers: Supplier[],
    rfp: RFP,
    visaScores?: Map<string, number>,
  ): ScoredBid[] {
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
    const scored: ScoredBid[] = [];

    for (const bid of bids) {
      const supplier = supplierMap.get(bid.supplierId);
      if (!supplier) continue;
      const visaMatchScore = visaScores?.get(bid.supplierId) ?? 0;
      const dimensions = computeDimensions(bid, supplier, rfp, visaMatchScore);
      const composite  = computeComposite(dimensions, this.weights);
      scored.push({ bid, supplier, dimensions, composite, rank: 0, isWinner: false });
    }

    scored.sort((a, b) => b.composite - a.composite);
    scored.forEach((s, i) => { s.rank = i + 1; s.isWinner = i === 0; });
    return scored;
  }

  /**
   * Score a single bid/supplier pair against an RFP.
   * @param visaMatchScore — Visa Supplier Match Score for this supplier (0-100, default 0)
   */
  scoreBid(
    bid: Bid,
    supplier: Supplier,
    rfp: RFP,
    visaMatchScore = 0,
  ): Omit<ScoredBid, 'rank' | 'isWinner'> {
    const dimensions = computeDimensions(bid, supplier, rfp, visaMatchScore);
    const composite  = computeComposite(dimensions, this.weights);
    return { bid, supplier, dimensions, composite };
  }

  /**
   * Generate a natural-language AI narrative explaining the top-ranked result.
   */
  generateNarrative(ranked: ScoredBid[]): string {
    if (ranked.length === 0) return 'No bids to evaluate.';
    if (ranked.length === 1) {
      const w = ranked[0];
      return `${w.supplier.name} is the sole bidder with a composite score of ${w.composite}/100.`;
    }
    const winner   = ranked[0];
    const runnerUp = ranked[1];
    const dims = ['price', 'delivery', 'reliability', 'compliance', 'risk', 'visaMatchScore'] as (keyof DimensionScores)[];

    let topDim = dims[0];
    let topVal = winner.dimensions[dims[0]];
    for (const d of dims) if (winner.dimensions[d] > topVal) { topDim = d; topVal = winner.dimensions[d]; }

    let weakDim = dims[0];
    let weakVal = runnerUp.dimensions[dims[0]];
    for (const d of dims) if (runnerUp.dimensions[d] < weakVal) { weakDim = d; weakVal = runnerUp.dimensions[d]; }

    const topLabel  = topDim  === 'visaMatchScore' ? 'Visa Supplier Match Score' : topDim;
    const weakLabel = weakDim === 'visaMatchScore' ? 'Visa Supplier Match Score' : weakDim;
    const gap = winner.composite - runnerUp.composite;
    return `${winner.supplier.name} leads with a composite score of ${winner.composite}/100, reflecting strong overall performance. Their strongest dimension is ${topLabel} (${topVal.toFixed(0)}/100). ${runnerUp.supplier.name} scored ${gap} points lower, primarily due to weak ${weakLabel} (${weakVal.toFixed(0)}/100).`;
  }

  /**
   * Generate a warning narrative when a government official manually overrides
   * the AI recommendation and selects a lower-ranked supplier.
   * The override is flagged for audit and compliance review.
   */
  generateOverrideNarrative(selected: ScoredBid, best: ScoredBid): string {
    const dims = ['price', 'delivery', 'reliability', 'compliance', 'risk', 'visaMatchScore'] as (keyof DimensionScores)[];
    const gap  = best.composite - selected.composite;

    let weakDim  = dims[0];
    let worstGap = -Infinity;
    for (const d of dims) {
      const diff = best.dimensions[d] - selected.dimensions[d];
      if (diff > worstGap) { worstGap = diff; weakDim = d; }
    }

    let edgeDim: string | null = null;
    let edgeGap = 0;
    for (const d of dims) {
      const diff = selected.dimensions[d] - best.dimensions[d];
      if (diff > edgeGap) { edgeGap = diff; edgeDim = d; }
    }

    const weakLabel = weakDim === 'visaMatchScore' ? 'Visa Supplier Match Score' : weakDim;
    const edgeLabel = edgeDim === 'visaMatchScore' ? 'Visa Supplier Match Score' : edgeDim;

    const edgeLine = edgeDim && edgeGap > 2
      ? ` Note: ${selected.supplier.name} does edge ahead on ${edgeLabel} (+${edgeGap.toFixed(0)} pts), but this dimension carries less weight in the composite model.`
      : '';

    return `⚠ Manual override detected. You selected ${selected.supplier.name} (rank #${selected.rank}, ${selected.composite}/100), bypassing the AI recommendation.\n\n${best.supplier.name} scores ${gap} points higher at ${best.composite}/100. The largest gap is in ${weakLabel}: ${best.supplier.name} scores ${best.dimensions[weakDim].toFixed(0)} vs ${selected.dimensions[weakDim].toFixed(0)} for ${selected.supplier.name}.${edgeLine}\n\nThis override will be logged for audit and compliance review.`;
  }

  /**
   * Evaluate bids after automatically checking each supplier against the
   * Visa Supplier Match Service registry.
   *
   * The `matchConfidence` returned by Visa is mapped to a `visaMatchScore`
   * (High=95, Medium=70, Low=45, None=0) and fed into the scoring model as
   * the `visaMatchScore` dimension.
   *
   * Requires a `visaNetwork` service injected at construction time,
   * or passed directly as `options.visaNetwork`.
   *
   * @example
   * ```ts
   * const matcher = SupplierMatcher.withVisaNetwork(VisaNetworkService.sandbox());
   *
   * const result = await matcher.evaluateWithVisaCheck({
   *   rfp,
   *   bids,
   *   suppliers,
   *   countryCode: 'US',
   * });
   *
   * for (const sb of result.rankedBids) {
   *   console.log(
   *     sb.supplier.name,
   *     '| Visa Match Score:', sb.dimensions.visaMatchScore,
   *     '| MCC:', result.visaChecks.get(sb.supplier.id)?.mcc,
   *   );
   * }
   * ```
   */
  async evaluateWithVisaCheck(params: {
    rfp: RFP;
    bids: Bid[];
    suppliers: Supplier[];
    countryCode?: string;
    visaNetwork?: VisaNetworkService;
  }): Promise<EvaluationResult & {
    visaChecks: Map<string, import('../types/visa-api').VisaNetworkCheckResult>;
  }> {
    const network = params.visaNetwork ?? this.visaNetwork;
    if (!network) {
      throw new Error(
        'evaluateWithVisaCheck requires a VisaNetworkService. ' +
        'Use SupplierMatcher.withVisaNetwork(service) or pass visaNetwork in params.',
      );
    }

    // Enrich all suppliers with Visa network data in parallel
    const enriched = await network.enrichSuppliers(
      params.suppliers,
      params.countryCode ?? 'US',
    );

    // Build visaScores map: supplierId → confidenceScore (0-100)
    const visaScores = new Map(
      enriched.map((s) => [s.id, s.visaNetwork.confidenceScore]),
    );

    // Build visaChecks map: supplierId → VisaNetworkCheckResult
    const visaChecks = new Map(
      enriched.map((s) => [s.id, s.visaNetwork]),
    );

    // Score bids with Visa match scores injected into the visaMatchScore dimension
    const ranked = this.scoreBids(params.bids, params.suppliers, params.rfp, visaScores);

    if (ranked.length === 0) {
      throw new Error(`No valid bids found for RFP ${params.rfp.id}`);
    }

    // Annotate ScoredBids with visaAcceptMark
    for (const sb of ranked) {
      const check = visaChecks.get(sb.supplier.id);
      if (check) sb.visaAcceptMark = check.visaAcceptMark;
    }

    const visaAcceptedSupplierIds = enriched
      .filter((s) => s.visaNetwork.visaAcceptMark)
      .map((s) => s.id);

    const result: EvaluationResult = {
      rfpId:                   params.rfp.id,
      rankedBids:              ranked,
      winner:                  ranked[0],
      evaluatedAt:             new Date().toISOString(),
      narrative:               this.generateNarrative(ranked),
      visaAcceptedSupplierIds,
    };

    return { ...result, visaChecks };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private isWeights(v: unknown): v is ScoringWeights {
    return typeof v === 'object' && v !== null && 'price' in v && 'delivery' in v;
  }

  private normalise(weights: ScoringWeights): ScoringWeights {
    const total = Object.values(weights).reduce((s, v) => s + v, 0);
    if (Math.abs(total - 1.0) < 0.001) return weights; // already normalised
    const factor = 1 / total;
    const out = {} as ScoringWeights;
    for (const k of Object.keys(weights) as (keyof ScoringWeights)[]) {
      out[k] = weights[k] * factor;
    }
    return out;
  }
}
