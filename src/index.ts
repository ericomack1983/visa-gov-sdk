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

// ── Visa Developer Platform — mTLS client ────────────────────────────────────
export { createMtlsFetch }                      from './client';
export type { VisaTLSMaterials }                from './client';

// ── Payments ──────────────────────────────────────────────────────────────────
export { VCNService }                           from './payments/VCNService';
export { VPAService }                           from './payments/VPAService';
export type { VPAApiConfig }                    from './payments/VPAService';
export {
  SettlementService,
  SettlementSession,
  getStepLabel,
  USD_STEP_DELAY_MS,
}                                               from './payments/SettlementService';
export { VPCService }                           from './payments/VPCService';
export type { VPCApiConfig }                    from './payments/VPCService';
export { B2BPaymentService }                    from './payments/B2BPaymentService';

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

// ── VPA (Visa B2B Virtual Account Payment) ────────────────────────────────────
export type {
  VPACurrencyCode,
  VPADateFormat,
  VPALanguageCode,
  VPAApprovalWorkflowCode,
  VPAPaymentNotificationConfig,
  VPAAuthorizationControlConfig,
  VPACreateBuyerParams,
  VPABuyer,
  VPAUpdateBuyerParams,
  VPACreateBuyerTemplateParams,
  VPABuyerTemplate,
  VPAUpdateBuyerTemplateParams,
  VPAAddFundingAccountParams,
  VPAFundingAccount,
  VPASecurityCode,
  VPAPaymentControlRule,
  VPARequisitionDetails,
  VPARequestVirtualAccountParams,
  VPAVirtualAccount,
  VPAAccountStatus,
  VPAManagePaymentControlsParams,
  VPAPaymentControls,
  VPACreateProxyPoolParams,
  VPAUpdateProxyPoolParams,
  VPAProxyPool,
  VPAManageProxyPoolParams,
  VPAPaymentDeliveryMethod,
  VPASupplierAccountModel,
  VPACreateSupplierParams,
  VPAUpdateSupplierParams,
  VPASupplier,
  VPAManageSupplierAccountParams,
  VPAProcessPaymentParams,
  VPAPaymentStatus,
  VPAPayment,
  VPAPaymentUrl,
  VPAPaymentRequisitionParams,
  VPARequisitionResponse,
  // BIP
  BIPInitiateParams,
  BIPVirtualCard,
  BIPPayment,
  // SIP
  SIPSubmitParams,
  SIPRequisition,
  SIPApproveParams,
  SIPApprovalResult,
}                                               from './types/vpa';

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
  PaymentMethod,
  PaymentMode,
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
