// ─────────────────────────────────────────────────────────────────────────────
// Core domain types for the Visa Government SDK
// ─────────────────────────────────────────────────────────────────────────────

// ── Procurement ───────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  rating: number;                                          // 0-5
  complianceStatus: 'Compliant' | 'Pending Review' | 'Non-Compliant';
  certifications: string[];                                // e.g. ['ISO 9001', 'SOC 2']
  pastPerformance: number;                                 // 0-100
  pricingHistory: number[];                                // historical bid amounts
  walletAddress: string;
  deliveryAvgDays: number;
  riskScore: number;                                       // 0-100 (lower = less risk)
  cards?: PaymentCard[];
}

export interface Bid {
  id: string;
  rfpId: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  deliveryDays: number;
  notes: string;
  submittedAt: string;                                     // ISO 8601
}

export interface DimensionScores {
  price: number;           // 0-100
  delivery: number;        // 0-100
  reliability: number;     // 0-100
  compliance: number;      // 0-100
  risk: number;            // 0-100
  /**
   * Visa Supplier Match Score — derived from the Visa Supplier Matching Service
   * `matchConfidence` field (High=95, Medium=70, Low=45, None=0).
   * 0 when no Visa check has been performed (basic evaluate() call).
   */
  visaMatchScore: number;  // 0-100
}

export interface ScoredBid {
  bid: Bid;
  supplier: Supplier;
  dimensions: DimensionScores;
  composite: number;    // 0-100
  rank: number;         // 1 = best
  isWinner: boolean;
  /**
   * Visa Accept Mark — set to true when the Visa Supplier Matching Service
   * confirms this supplier accepts Visa Commercial Payment Products
   * (matchStatus = "Yes"). Only present after evaluateWithVisaCheck().
   */
  visaAcceptMark?: boolean;
}

export interface ScoringWeights {
  price: number;
  delivery: number;
  reliability: number;
  compliance: number;
  risk: number;
  /** Weight for Visa Supplier Match Score dimension (default 0.10). */
  visaMatchScore: number;
}

export interface EvaluationResult {
  rfpId: string;
  rankedBids: ScoredBid[];
  winner: ScoredBid;
  evaluatedAt: string;  // ISO 8601
  narrative: string;
  /**
   * IDs of suppliers confirmed by the Visa Supplier Matching Service as
   * accepting Visa Commercial Payment Products (matchStatus = "Yes").
   * Only present after evaluateWithVisaCheck().
   */
  visaAcceptedSupplierIds?: string[];
}

// ── Payments ──────────────────────────────────────────────────────────────────

export type PaymentMethod = 'USD' | 'Card';
export type TransactionStatus = 'Pending' | 'Authorized' | 'Processing' | 'Settled';
export type PaymentMode = 'cnp' | 'card-present';

export interface PaymentCard {
  id: string;
  type: 'credit' | 'debit';
  brand: 'Visa' | 'Mastercard' | 'Amex';
  last4: string;
  expiry: string;       // MM/YY
  holderName: string;
  status: 'active' | 'inactive';
  usageType?: 'single-use' | 'multi-use';
}

export type USDSettlementStep = 'idle' | 'authorized' | 'processing' | 'settled';

export interface SettlementState {
  method: PaymentMethod;
  currentStep: USDSettlementStep;
  progress: number;     // 0, 33, 66, 100
  txHash?: string;
  orderId: string;
  startedAt?: string;
  paymentMode?: PaymentMode;
}

export interface SettlementParams {
  method: PaymentMethod;
  orderId: string;
  amount: number;
  paymentMode?: PaymentMode;
}

export interface SettlementResult {
  txHash?: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  settledAt: string;
  durationMs: number;
}

export interface Transaction {
  id: string;
  rfpId: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  method: PaymentMethod;
  status: TransactionStatus;
  txHash?: string;
  orderId: string;
  createdAt: string;
  settledAt?: string;
}


