/**
 * @visa-gov/sdk
 *
 * TypeScript SDK for Visa Government Procurement platform.
 *
 * Two core capabilities:
 *   1. Visa Payments  — VCN issuance + multi-rail settlement (USD / USDC / Card)
 *   2. Supplier Match — AI-powered bid evaluation with Visa registry verification
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
}                                               from './payments/SettlementService';
export { VPCService }                           from './payments/VPCService';

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

// ── VPC (Visa B2B Payment Controls) ──────────────────────────────────────────
export type {
  VPCRuleCode,
  VPCRule,
  VPCAccount,
  VPCAccountStatus,
  VPCContact,
  VPCSpendVelocity,
  VPCSpendPolicy,
  VPCExactAmountMatch,
  VPCBusinessHours,
  VPCChannelRestriction,
  VPCLocationRestriction,
  VPCMCCRestriction,
  VPCMCGRestriction,
  VPCNotification,
  VPCNotificationEvent,
  VPCTransaction,
  VPCSupplierRegistration,
  VPCSupplierValidation,
  VPCValidationStatus,
  VPCCreateAccountParams,
  VPCUpdateAccountParams,
  VPCGetNotificationHistoryParams,
  VPCGetTransactionHistoryParams,
  IPCPromptRequest,
  IPCRuleSetResponse,
  IPCSuggestedRuleSet,
}                                               from './types/vpc';

// ── VCN Request (Visa B2B Virtual Account API) ────────────────────────────────
export type {
  VCNRuleCode,
  VCNRuleOverride,
  VCNRule,
  VCNOptionalInfo,
  VCNRequisitionDetails,
  VCNRequestPayload,
  VCNIssuedAccount,
  VCNRequestResponse,
  SPVOverrideCode,
  AmountOverrideCode,
  TOLRNCOverrideCode,
  CAIDOverrideCode,
}                                               from './types/vcn-request';
export {
  buildSPVRule,
  buildAmountRule,
  buildToleranceRule,
  buildCAIDRule,
  buildBlockRule,
}                                               from './types/vcn-request';
