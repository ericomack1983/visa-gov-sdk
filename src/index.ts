/**
 * @visa-gov/sdk
 *
 * TypeScript SDK for Visa Government Procurement platform.
 *
 * Two core capabilities:
 *   1. Visa Payments  — VCN issuance + multi-rail settlement (USD / USDC / Card)
 *   2. Supplier Match — AI-powered bid evaluation using Visa VAA scores
 *
 * @example
 * ```ts
 * import { VCNService, SettlementService, SupplierMatcher, VisaNetworkService } from '@visa-gov/sdk';
 * ```
 */

// ── Payments ──────────────────────────────────────────────────────────────────
export { VCNService, MCC_CATEGORIES }           from './payments/VCNService';
export {
  SettlementService,
  SettlementSession,
  getStepLabel,
  USD_STEP_DELAY_MS,
  USDC_STEP_DELAY_MS,
}                                               from './payments/SettlementService';

// ── Procurement ───────────────────────────────────────────────────────────────
export { SupplierMatcher, DEFAULT_WEIGHTS }     from './procurement/SupplierMatcher';
export { VisaNetworkService }                   from './procurement/VisaNetworkService';
export type {
  VisaSupplierMatchRequest,
  VisaSupplierMatchResponse,
  VisaNetworkCheckResult,
  VisaApiConfig,
  VisaMatchConfidence,
  VisaMatchStatus,
  VisaMatchDetails,
  VisaApiStatus,
}                                               from './types/visa-api';
export { VISA_SMS_STATUS_CODES }                from './types/visa-api';

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  // Procurement
  Supplier,
  Bid,
  DimensionScores,
  ScoredBid,
  ScoringWeights,
  EvaluationResult,
  // Payments
  PaymentCard,
  PaymentControls,
  PaymentMethod,
  PaymentMode,
  VCNIssueParams,
  VCNIssueStep,
  VCNIssueResult,
  IssuedCard,
  SettlementState,
  SettlementParams,
  SettlementResult,
  Transaction,
  TransactionStatus,
}                                               from './types';
