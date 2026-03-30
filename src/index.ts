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
 * import { VCNService, SettlementService, SupplierMatcher, RFPManager, AuditService } from '@visa-gov/sdk';
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
export { RFPManager }                           from './procurement/RFPManager';
export { VisaNetworkService }                   from './procurement/VisaNetworkService';
export type { CreateRFPParams, SubmitBidParams } from './procurement/RFPManager';
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

// ── Audit ─────────────────────────────────────────────────────────────────────
export { AuditService }                         from './audit/AuditService';

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  // Procurement
  Supplier,
  Bid,
  RFP,
  RFPStatus,
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
  // Audit
  AuditEvent,
  AuditEventType,
}                                               from './types';
