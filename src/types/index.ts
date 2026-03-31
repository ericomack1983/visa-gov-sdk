// ─────────────────────────────────────────────────────────────────────────────
// Core domain types for the Visa Government SDK
// ─────────────────────────────────────────────────────────────────────────────

// ── Procurement ───────────────────────────────────────────────────────────────

export type RFPStatus = 'Draft' | 'Open' | 'Evaluating' | 'Awarded' | 'Paid';

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

export interface RFP {
  id: string;
  title: string;
  description: string;
  budgetCeiling: number;
  deadline: string;                                        // ISO 8601
  category: string;
  status: RFPStatus;
  createdAt: string;                                       // ISO 8601
  bids: Bid[];
  selectedWinnerId?: string;
  evaluationResults?: ScoredBid[];
  overrideWinnerId?: string;
  overrideJustification?: string;
}

export interface DimensionScores {
  price: number;        // 0-100
  delivery: number;     // 0-100
  reliability: number;  // 0-100
  compliance: number;   // 0-100
  risk: number;         // 0-100
}

export interface ScoredBid {
  bid: Bid;
  supplier: Supplier;
  dimensions: DimensionScores;
  composite: number;    // 0-100
  rank: number;         // 1 = best
  isWinner: boolean;
}

export interface ScoringWeights {
  price: number;
  delivery: number;
  reliability: number;
  compliance: number;
  risk: number;
}

export interface EvaluationResult {
  rfpId: string;
  rankedBids: ScoredBid[];
  winner: ScoredBid;
  evaluatedAt: string;  // ISO 8601
  narrative: string;
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

export interface PaymentControls {
  allowOnline: boolean;
  allowIntl: boolean;
  allowRecurring: boolean;
}

export interface VCNIssueParams {
  holderName: string;
  brand?: 'Visa' | 'Mastercard' | 'Amex';
  type?: 'credit' | 'debit';
  usageType?: 'single-use' | 'multi-use';
  mccCode?: string;
  spendLimit?: number;
  expiryMonths?: number;
  supplierId?: string;
  cardAcceptorId?: string;
  controls?: Partial<PaymentControls>;
}

export interface IssuedCard {
  id: string;
  last4: string;
  expiry: string;       // MM/YY
  holderName: string;
  brand: 'Visa' | 'Mastercard' | 'Amex';
  type: 'credit' | 'debit';
  usageType: 'single-use' | 'multi-use';
  mccCode?: string;
  spendLimit?: number;
  status: 'active';
  controls: PaymentControls;
  issuedAt: string;     // ISO 8601
}

export interface VCNIssueStep {
  key: 'validating' | 'contacting' | 'generating' | 'vpa' | 'vpc' | 'issued';
  label: string;
  durationMs: number;
}

export interface VCNIssueResult {
  card: IssuedCard;
  steps: VCNIssueStep[];
  issuedAt: string;
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

// ── Audit ─────────────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'rfp_created'
  | 'rfp_published'
  | 'bid_submitted'
  | 'evaluation_run'
  | 'supplier_awarded'
  | 'override_applied'
  | 'payment_initiated'
  | 'payment_settled';

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: AuditEventType;
  description: string;
  rfpId: string;
  rfpTitle: string;
  actor: string;
  metadata?: Record<string, string>;
}
