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

export interface VPAPaymentNotificationConfig {
  emailNotification: boolean;
  notificationEmailAddress?: string;
  smsNotification?: boolean;
  smsPhoneNumber?: string;
}

export interface VPAAuthorizationControlConfig {
  authorizationControlEnabled: boolean;
}

export interface VPACreateBuyerParams {
  messageId: string;
  clientId: string;
  implementationType?: string;
  visaBusinessId?: string;
  billingType?: string;
  /** ISO 4217 numeric, e.g. "840" for USD. */
  billingCurrency: VPACurrencyCode;
  paymentNotificationConfig: VPAPaymentNotificationConfig;
  dateFormat?: VPADateFormat;
  authorizationControlConfig: VPAAuthorizationControlConfig;
  expirationDays?: number;
  expirationBufferDays?: number;
  allowableCurrencies?: VPACurrencyCode[];
  defaultLanguageCode?: VPALanguageCode;
  holdDays?: number;
  suppressSupplierNotification?: boolean;
  approvalWorkflowCodes?: VPAApprovalWorkflowCode[];
}

export interface VPABuyer {
  buyerId: string;
  clientId: string;
  billingCurrency: VPACurrencyCode;
  status: string;
  paymentNotificationConfig?: VPAPaymentNotificationConfig;
  expirationDays?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type VPAUpdateBuyerParams = Partial<Omit<VPACreateBuyerParams, 'clientId'>> & {
  messageId: string;
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
  proxyPoolName?: string;
  /** Initial virtual accounts to provision (ready within ~15 minutes). */
  initialOrderCount?: number;
  /** Minimum threshold before auto-reorder triggers. */
  minAvailableAccounts?: number;
  /** Number of accounts to auto-order when threshold is reached. */
  reOrderCount?: number;
}

export interface VPAProxyPool {
  proxyPoolId: string;
  buyerId: string;
  proxyPoolName?: string;
  initialOrderCount?: number;
  minAvailableAccounts?: number;
  reOrderCount?: number;
  availableAccounts?: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type VPAUpdateProxyPoolParams = Partial<Omit<VPACreateProxyPoolParams, 'messageId'>> & {
  messageId: string;
};

export interface VPAManageProxyPoolParams {
  messageId: string;
  /** Processor PANs to manually populate (legacy processor PANs). */
  accounts: string[];
}

// ── Supplier ──────────────────────────────────────────────────────────────────

/** SIP = Supplier Initiated Payment, BIP = Buyer Initiated, STP = Straight Through Processing. */
export type VPAPaymentDeliveryMethod = 'SIP' | 'BIP' | 'STP';

/** SUA = Single Use Account (unique per payment), LODGED = reused for all supplier payments. */
export type VPASupplierAccountModel = 'SUA' | 'LODGED';

export interface VPACreateSupplierParams {
  messageId: string;
  clientId: string;
  supplierName: string;
  emailAddress?: string;
  paymentDeliveryMethod?: VPAPaymentDeliveryMethod;
  accountModel?: VPASupplierAccountModel;
  remittanceInfo?: Record<string, unknown>;
}

export interface VPASupplier {
  supplierId: string;
  clientId?: string;
  supplierName: string;
  emailAddress?: string;
  paymentDeliveryMethod?: VPAPaymentDeliveryMethod;
  accountModel?: VPASupplierAccountModel;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type VPAUpdateSupplierParams = Partial<Omit<VPACreateSupplierParams, 'clientId'>> & {
  messageId: string;
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
