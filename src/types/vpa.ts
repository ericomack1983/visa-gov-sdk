// ─────────────────────────────────────────────────────────────────────────────
// Visa B2B Virtual Account Payment (VPA) — Type Definitions
//
// Five service areas:
//   Buyer          — buyer profile + templates
//   FundingAccount — primary PAN, security code, virtual accounts
//   ProxyPool      — pre-provisioned virtual account pools
//   Supplier       — supplier registry + account models
//   Payment        — payment instructions + requisitions
// ─────────────────────────────────────────────────────────────────────────────

// ── Config ───────────────────────────────────────────────────────────────────

/**
 * Configuration for connecting to the Visa VPA API.
 *
 * Visa Developer Platform requires Two-Way SSL (mutual TLS) in Sandbox and
 * Certification environments.
 *
 * Credential sources in Visa Developer Center:
 *   baseUrl  — https://sandbox.api.visa.com  (Sandbox/Certification)
 *   userId   — Project → Credentials → Two-Way SSL → Username
 *   password — Project → Credentials → Two-Way SSL → Password
 *   cert     — Project → Credentials → Two-Way SSL → Download Certificate (PEM)
 *   key      — private key generated when submitting your CSR
 *   ca       — Common Certificates bundle (PEM)
 */
export interface VPAApiConfig {
  /** Visa API base URL. Sandbox: https://sandbox.api.visa.com */
  baseUrl: string;
  /** HTTP Basic auth credentials (Username + Password). */
  credentials?: { userId: string; password: string };
  /** Client certificate PEM for Two-Way SSL. */
  cert?: string;
  /** Private key PEM. */
  key?: string;
  /** CA / Common Certificates PEM bundle (optional). */
  ca?: string;
  /** Custom fetch override — useful for tests or custom middleware. */
  fetch?: typeof fetch;
}

// ── Shared / Primitives ───────────────────────────────────────────────────────

/** ISO 4217 3-digit numeric currency code, e.g. "840" for USD. */
export type VPACurrencyCode = string;

/** Visa-defined date format codes, e.g. "YYYY-MM-DD". */
export type VPADateFormat =
  | 'MMDDYYYY' | 'DDMMYYYY' | 'YYYYMMDD'
  | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY/MM/DD'
  | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM-DD'
  | (string & {});

export type VPALanguageCode =
  | 'en_US' | 'en_GB' | 'fr_FR' | 'es_ES'
  | 'pt_BR' | 'de_DE' | 'it_IT'
  | (string & {});

export type VPAApprovalWorkflowCode = 'PYIN' | 'PYRN' | 'LCRC' | 'AUCL';

// ── Buyer ─────────────────────────────────────────────────────────────────────

/** Buyer contact / address info required by buyer/create. */
export interface VPABuyerContactInfo {
  /** Buyer name as it appears in the system */
  buyerName: string;
  /** Primary email address for payment notifications */
  emailAddress: string;
  /** Primary phone number (digits only) */
  phone1: string;
  /** ISO alpha-3 country code, e.g. "USA" */
  countryCode: string;
  /** Street address line 1 */
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  /**
   * Buyer ID to assign — Visa uses this as the buyer identifier.
   * Provide the same value you intend to use as buyerId in all subsequent calls.
   */
  buyerId?: string;
  /** Usually the same value as buyerId */
  companyId?: string;
  contactName?: string;
  addressLine2?: string;
  addressLine3?: string;
  phone2?: string;
  phone3?: string;
  phoneExt1?: string;
  phoneExt2?: string;
  phoneExt3?: string;
  defaultCurrencyCode?: string;
}

/** Payment configuration for buyer/create. */
export interface VPABuyerPaymentConfig {
  /** ISO 4217 alpha currency code, e.g. "USD" */
  billingCurrency: string;
  expirationDays?: number;
  expirationBufferDays?: number;
  allowableCurrencies?: string[];
  securityCodeRequired?: boolean;
  paymentAdviceOption?: string;
}

export interface VPAAuthorizationControlConfig {
  /** Must be true for buyers with VPC/auth controls enabled */
  authControlEnabled: boolean;
  issuerHoldingBID?: string;
  alertsEnabled?: boolean;
}

export interface VPAPaymentNotificationConfig {
  dateFormat?: VPADateFormat;
  defaultLanguageCode?: VPALanguageCode;
  /** Visa API field name */
  defaultBuyerLanguageCode?: string;
  attachRemittanceDetails?: boolean;
  /** Visa API field name */
  attachRemittanceFileDetails?: boolean;
  supplierReminderNotificationEnabled?: boolean;
  supplierReminderNotificationDays?: number;
}

export interface VPAPaymentSecurityConfig {
  defaultSecurityFieldCode?: number;
  defaultSecurityQuestion?: string;
  customSecurityQuestions?: null;
  customSecurityQuestionsEnabled?: boolean;
}

export interface VPAApprovalWorkflowConfig {
  workflowFunctionCodes?: string[];
  workflowConfigEnabled?: boolean;
}

export interface VPAStripePaymentConfig {
  remittanceNotificationEnabled?: boolean | null;
  stripePaymentEnabled?: boolean;
}

export interface VPAStpPaymentConfig {
  remittanceNotificationEnabled?: boolean;
  stpPaymentEnabled?: boolean;
}

export interface VPACreateBuyerParams {
  messageId: string;
  clientId: string;
  templateName?: string;
  templateDescription?: string;
  contactInfo?: VPABuyerContactInfo | null;
  paymentConfig: VPABuyerPaymentConfig;
  authorizationControlConfig: VPAAuthorizationControlConfig;
  paymentNotificationConfig?: VPAPaymentNotificationConfig;
  paymentSecurityConfig?: VPAPaymentSecurityConfig;
  approvalWorkflowConfig?: VPAApprovalWorkflowConfig;
  boostPaymentConfig?: { boostPaymentEnabled?: boolean } | null;
  stripePaymentConfig?: VPAStripePaymentConfig | null;
  stpPaymentConfig?: VPAStpPaymentConfig | null;
  proxyConfig?: {
    holdDays?: number;
    bucketedProxyEnabled?: boolean;
    autoRefreshEnabled?: boolean;
  } | null;
  webServicesConfig?: {
    webServicesEnabled?: boolean;
    apiCodes?: string[];
    suppressSupplierNotification?: boolean;
  } | null;
  responseFileConfig?: null;
  buyerFeatureConfig?: null;
  rvaReconciliationFileConfig?: null;
  vanConfig?: null;
  paymentFileCommConfig?: null;
  reconciliationFileConfig?: null;
  processorConfig?: { closeAccount?: null } | null;
}

export interface VPABuyer {
  buyerId: string;
  clientId: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type VPAUpdateBuyerParams = Partial<Omit<VPACreateBuyerParams, 'clientId'>> & {
  messageId: string;
  buyerId: string;
};

// ── Buyer Template ────────────────────────────────────────────────────────────

export interface VPACreateBuyerTemplateParams {
  messageId: string;
  clientId: string;
  templateName: string;
  billingCurrency: VPACurrencyCode;
  paymentNotificationConfig?: VPAPaymentNotificationConfig;
  dateFormat?: VPADateFormat;
  authorizationControlConfig?: VPAAuthorizationControlConfig;
  expirationDays?: number;
  expirationBufferDays?: number;
}

export interface VPABuyerTemplate {
  templateId: string;
  clientId: string;
  templateName: string;
  billingCurrency: VPACurrencyCode;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type VPAUpdateBuyerTemplateParams = Partial<Omit<VPACreateBuyerTemplateParams, 'clientId'>> & {
  messageId: string;
};

// ── Funding Account ───────────────────────────────────────────────────────────

export interface VPAAddFundingAccountParams {
  messageId: string;
  /** 16-digit primary account number (PAN). */
  accountNumber: string;
}

export interface VPAFundingAccount {
  accountNumber: string;
  creditLimit?: number;
  expirationDate?: string;
  activeVirtualAccounts?: number;
  status?: string;
  [key: string]: unknown;
}

export interface VPASecurityCode {
  accountNumber: string;
  cvv2: string;
  [key: string]: unknown;
}

// ── Payment Controls / Rules (used in RVA and Manage Payment Controls) ────────

/** Single payment control rule applied to a virtual account. */
export interface VPAPaymentControlRule {
  /** Rule code — see full list in Visa VPA documentation. */
  ruleCode: string;
  /** Rule-specific parameters (amount, dates, MCC ranges, etc.). */
  [key: string]: unknown;
}

// ── Virtual Account (RVA) ─────────────────────────────────────────────────────

export interface VPARequisitionDetails {
  startDate?: string;
  endDate?: string;
  /** Timezone string, e.g. "UTC-8" or "EST". */
  timeZone?: string;
  rules?: VPAPaymentControlRule[];
}

export interface VPARequestVirtualAccountParams {
  messageId: string;
  /** A = Add, U = Update, D = Delete. */
  action: 'A' | 'U' | 'D';
  numberOfCards?: string;
  proxyPoolId?: string;
  requisitionDetails?: VPARequisitionDetails;
}

export interface VPAVirtualAccount {
  accountNumber: string;
  expiryDate?: string;
  cvv2?: string;
  status?: string;
  [key: string]: unknown;
}

export interface VPAAccountStatus {
  accountNumber: string;
  status: string;
  [key: string]: unknown;
}

export interface VPAManagePaymentControlsParams {
  messageId: string;
  /** A = Add, U = Update, D = Delete. */
  action: 'A' | 'U' | 'D';
  rules: VPAPaymentControlRule[];
}

export interface VPAPaymentControls {
  accountNumber: string;
  rules: VPAPaymentControlRule[];
  [key: string]: unknown;
}

// ── Proxy Pool ────────────────────────────────────────────────────────────────

export interface VPACreateProxyPoolParams {
  messageId: string;
  /**
   * Proxy pool account number / name — this becomes the proxyPoolId used
   * in VirtualCardRequisition. Required. Alphanumeric, no special chars
   * except underscore and dash.
   */
  proxyAccountNumber: string;
  /** Credit limit for all accounts in this pool (bucketed proxy only). */
  creditLimit?: string;
  /** Number of accounts to auto-order when minAvailableAccounts is reached. */
  reOrderCount?: string;
  /** (1) Multi-use pool, (2) One-time use pool. Defaults to 1. */
  proxyPoolType?: '1' | '2';
  /** (1) SUA adjustable, (2) SUA. Defaults to 2 for VIP/VIPP. */
  proxyAccountType?: '1' | '2';
  /** Initial accounts to provision at pool creation. */
  initialOrderCount?: string;
  /** Enable auth controls (VPC) for this pool. Required for VIP/VPP pools. */
  authControlEnabled?: boolean;
  /** Funding account PAN to generate VIP/VPP accounts. */
  fundingAccountNumber?: string;
  /** Minimum available accounts before auto-reorder triggers. */
  minAvailableAccounts?: string;
}

export interface VPAProxyPool {
  proxyPoolId: string;
  proxyAccountNumber?: string;
  buyerId: string;
  statusCode?: string;
  statusDesc?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type VPAUpdateProxyPoolParams = Partial<Omit<VPACreateProxyPoolParams, 'messageId'>> & {
  messageId: string;
  /** The proxy pool to update */
  proxyAccountNumber: string;
};

export interface VPAManageProxyPoolParams {
  messageId: string;
  /** Action type for ManageProxy */
  actionType: string;
  proxyAccountDetails?: unknown[];
}

// ── Supplier ──────────────────────────────────────────────────────────────────

/** SIP = Supplier Initiated Payment, BIP = Buyer Initiated, STP = Straight Through Processing. */
export type VPAPaymentDeliveryMethod = 'SIP' | 'BIP' | 'STP';

/** SUA = Single Use Account (unique per payment), LODGED = reused for all supplier payments. */
export type VPASupplierAccountModel = 'SUA' | 'LODGED';

export interface VPACreateSupplierParams {
  messageId: string;
  clientId: string;
  buyerId: string;
  /** Caller-assigned supplier ID (e.g. "SUPP-001") */
  supplierId: string;
  supplierName: string;
  /** Supplier type — use "VPA" for standard B2B suppliers */
  supplierType: string;
  supplierAddressLine1: string;
  supplierCity: string;
  /** ISO alpha-3 country code, e.g. "USA" */
  supplierCountryCode: string;
  supplierAddressLine2?: string;
  supplierState?: string;
  supplierPostalCode?: string;
  primaryEmailAddress?: string;
  alternateEmailAddresses?: Array<{ alternateEmailAddress: string }>;
  defaultCurrencyCode?: string;
  supplierLanguage?: string;
  supplierDate?: string;
  supplierGLCode?: string;
  paymentControlRequired?: string;
  securityCodeRequired?: string;
  invoiceAttachmentRequired?: string;
  reminderNotificationRequired?: string;
  reminderNotificationDays?: string;
  paymentExpirationDays?: string;
  cardDetails?: {
    actionType?: string;
    accountLimit?: string;
    accountType?: string;
    proxyNumber?: string;
    accountNumber?: string;
    currencyCode?: string;
    expirationDate?: string;
  };
}

export interface VPASupplier {
  supplierId: string;
  clientId?: string;
  buyerId?: string;
  supplierName: string;
  supplierType?: string;
  primaryEmailAddress?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type VPAUpdateSupplierParams = Partial<Omit<VPACreateSupplierParams, 'clientId' | 'buyerId'>> & {
  messageId: string;
  supplierId: string;
};

export interface VPAManageSupplierAccountParams {
  messageId: string;
  /** A = Add, D = Delete. */
  action: 'A' | 'D';
  accountNumber: string;
}

// ── Payment ───────────────────────────────────────────────────────────────────

export interface VPAProcessPaymentParams {
  messageId: string;
  buyerId: string;
  supplierId: string;
  paymentAmount: number;
  currencyCode: VPACurrencyCode;
  paymentDate?: string;
  invoiceNumber?: string;
  memo?: string;
  customFields?: Record<string, string>;
}

export type VPAPaymentStatus =
  | 'pending' | 'processing' | 'matched'
  | 'unmatched' | 'completed' | 'cancelled';

export interface VPAPayment {
  paymentId: string;
  buyerId: string;
  supplierId: string;
  paymentAmount: number;
  currencyCode: VPACurrencyCode;
  status: VPAPaymentStatus;
  paymentDate?: string;
  invoiceNumber?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface VPAPaymentUrl {
  paymentId: string;
  url: string;
  expiresAt?: string;
  [key: string]: unknown;
}

export interface VPAPaymentRequisitionParams {
  messageId: string;
  requisitionId?: string;
  startDate: string;
  endDate: string;
  timeZone?: string;
  amount?: number;
  currencyCode?: VPACurrencyCode;
  rules?: VPAPaymentControlRule[];
}

export interface VPARequisitionResponse {
  requisitionId: string;
  accountNumber: string;
  expiryDate?: string;
  status: string;
  createdAt?: string;
  [key: string]: unknown;
}

// ── BIP (Buyer Initiated Payment) ─────────────────────────────────────────────

/**
 * Parameters for initiating a Buyer-Initiated Payment (BIP).
 *
 * The buyer provisions a single-use virtual card locked to this exact invoice
 * amount and pushes it to the supplier through the VPA payment network.
 */
export interface BIPInitiateParams {
  messageId: string;
  clientId: string;
  buyerId: string;
  supplierId: string;
  paymentAmount: number;
  /** ISO 4217 numeric currency code, e.g. "840" for USD. */
  currencyCode: VPACurrencyCode;
  invoiceNumber?: string;
  memo?: string;
  /** Payment value date (YYYY-MM-DD). Defaults to today. */
  paymentDate?: string;
  /** Days the virtual card remains valid. Defaults to 30. */
  validDays?: number;
}

/** A virtual card issued and pushed to the supplier as part of a BIP. */
export interface BIPVirtualCard {
  accountNumber: string;
  expiryDate: string;
  cvv2?: string;
}

/** Result of a Buyer-Initiated Payment instruction. */
export interface BIPPayment {
  paymentId: string;
  buyerId: string;
  supplierId: string;
  paymentAmount: number;
  currencyCode: VPACurrencyCode;
  deliveryMethod: 'BIP';
  status: VPAPaymentStatus;
  /** Virtual card provisioned for this payment (present in sandbox; may be masked in live). */
  virtualCard?: BIPVirtualCard;
  /** Time-limited URL where the supplier can view card details. */
  paymentDetailUrl?: string;
  invoiceNumber?: string;
  createdAt: string;
  updatedAt?: string;
}

// ── SIP (Supplier Initiated Payment) ─────────────────────────────────────────

/**
 * Parameters for submitting a Supplier-Initiated Payment request (SIP).
 *
 * The supplier submits an invoice/requisition; the VPA network provisions a
 * virtual account for the supplier and notifies the buyer for approval.
 */
export interface SIPSubmitParams {
  messageId: string;
  clientId: string;
  supplierId: string;
  buyerId: string;
  requestedAmount: number;
  /** ISO 4217 numeric currency code, e.g. "840" for USD. */
  currencyCode: VPACurrencyCode;
  invoiceNumber?: string;
  description?: string;
  /** Requisition validity start date (YYYY-MM-DD). */
  startDate: string;
  /** Requisition validity end date (YYYY-MM-DD). */
  endDate: string;
  timeZone?: string;
}

/** A supplier payment requisition awaiting buyer approval. */
export interface SIPRequisition {
  requisitionId: string;
  supplierId: string;
  buyerId: string;
  requestedAmount: number;
  currencyCode: VPACurrencyCode;
  status: 'pending_approval' | 'approved' | 'rejected' | 'settled';
  /** Pre-provisioned virtual account issued to the supplier. */
  virtualAccount?: { accountNumber: string; expiryDate: string };
  invoiceNumber?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Parameters for the buyer to approve a pending SIP requisition. */
export interface SIPApproveParams {
  messageId: string;
  clientId: string;
  buyerId: string;
  requisitionId: string;
  /** Override amount — defaults to the supplier's requested amount. */
  approvedAmount?: number;
  currencyCode?: VPACurrencyCode;
  memo?: string;
}

/** Result returned when a buyer approves a SIP requisition. */
export interface SIPApprovalResult {
  requisitionId: string;
  paymentId: string;
  status: 'approved' | 'processing' | 'settled';
  approvedAmount: number;
  currencyCode: VPACurrencyCode;
  approvedAt: string;
}
