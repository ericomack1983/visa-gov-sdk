// ─────────────────────────────────────────────────────────────────────────────
// Visa B2B Payment Controls (VPC) — Types
//
// API base: POST/GET /vpc/v1/...
// ─────────────────────────────────────────────────────────────────────────────

// ── Rule codes ────────────────────────────────────────────────────────────────

/**
 * All VPC rule codes.
 *
 *   HOT   — Block all transactions
 *   SPV   — Spend Velocity (rolling period limit + auth count)
 *   SPP   — Spend Policy (max single transaction amount)
 *   MCC   — Merchant Category Code allow/block list
 *   MCG   — Merchant Category Group
 *   VPAS  — Exact Amount Match (amount + currency)
 *   BHR   — Business Hours (days + hours + timezone)
 *   CHN   — Channel (online / POS / ATM / contactless)
 *   LOC   — Location (country codes)
 */
export type VPCRuleCode =
  | 'HOT'
  | 'SPV'
  | 'SPP'
  | 'MCC'
  | 'MCG'
  | 'VPAS'
  | 'BHR'
  | 'CHN'
  | 'LOC';

// ── Spending rule parameters ──────────────────────────────────────────────────

/** SPV — Spend Velocity rule parameters */
export interface VPCSpendVelocity {
  /** Maximum cumulative spend amount */
  limitAmount: number;
  /** ISO 4217 numeric currency code (e.g. "840" = USD) */
  currencyCode: string;
  /** Maximum number of authorisations in the period */
  maxAuthCount?: number;
  /** Period type */
  periodType: 'daily' | 'weekly' | 'monthly' | 'lifetime';
  /** Rule start date (YYYY-MM-DD) */
  startDate?: string;
  /** Rule end date (YYYY-MM-DD) */
  endDate?: string;
}

/** SPP — Spend Policy rule parameters (single-transaction cap) */
export interface VPCSpendPolicy {
  /** Maximum amount per single transaction */
  maxTransactionAmount: number;
  /** ISO 4217 numeric currency code */
  currencyCode: string;
}

/** VPAS — Exact Amount Match rule parameters */
export interface VPCExactAmountMatch {
  /** Expected exact transaction amount */
  amount: number;
  /** ISO 4217 numeric currency code */
  currencyCode: string;
}

/** BHR — Business Hours rule parameters */
export interface VPCBusinessHours {
  /**
   * Allowed days of the week (0 = Sunday … 6 = Saturday).
   * Only these days will be authorised.
   */
  allowedDays: number[];
  /** Allowed start time in HH:MM (24-hour, local timezone) */
  startTime: string;
  /** Allowed end time in HH:MM (24-hour, local timezone) */
  endTime: string;
  /** IANA timezone (e.g. "America/New_York") */
  timezone: string;
}

/** CHN — Channel restriction parameters */
export interface VPCChannelRestriction {
  /** Allow online / e-commerce */
  allowOnline?: boolean;
  /** Allow in-person / POS */
  allowPOS?: boolean;
  /** Allow ATM cash withdrawals */
  allowATM?: boolean;
  /** Allow contactless (NFC) */
  allowContactless?: boolean;
}

/** LOC — Location restriction parameters */
export interface VPCLocationRestriction {
  /**
   * ISO 3166-1 alpha-2 country codes to ALLOW.
   * All other countries are blocked when this list is provided.
   */
  allowedCountries?: string[];
  /**
   * ISO 3166-1 alpha-2 country codes to BLOCK.
   * Used when an allowlist is impractical.
   */
  blockedCountries?: string[];
}

/** MCC — Merchant Category Code restriction parameters */
export interface VPCMCCRestriction {
  /** MCC codes (4-digit strings) to ALLOW. All others blocked. */
  allowedMCCs?: string[];
  /** MCC codes to BLOCK. All others allowed. */
  blockedMCCs?: string[];
}

/** MCG — Merchant Category Group restriction parameters */
export interface VPCMCGRestriction {
  /**
   * Named merchant groups to ALLOW (e.g. "MEDICAL", "OFFICE_SUPPLIES").
   * All other groups blocked.
   */
  allowedGroups?: string[];
  /** Named merchant groups to BLOCK. */
  blockedGroups?: string[];
}

// ── Rule ─────────────────────────────────────────────────────────────────────

/**
 * A single VPC payment control rule.
 * Exactly one of the parameter fields should be set based on `ruleCode`.
 */
export interface VPCRule {
  ruleCode: VPCRuleCode;
  spendVelocity?: VPCSpendVelocity;
  spendPolicy?: VPCSpendPolicy;
  exactAmountMatch?: VPCExactAmountMatch;
  businessHours?: VPCBusinessHours;
  channel?: VPCChannelRestriction;
  location?: VPCLocationRestriction;
  mcc?: VPCMCCRestriction;
  mcg?: VPCMCGRestriction;
}

// ── Account ───────────────────────────────────────────────────────────────────

/** Account status in the VPC system */
export type VPCAccountStatus = 'active' | 'blocked' | 'rules_disabled' | 'deleted';

/** Contact attached to a VPC account (for notifications) */
export interface VPCContact {
  contactId?: string;
  name: string;
  /** Email address for notification delivery */
  email?: string;
  /** Phone number (E.164 format) for SMS notifications */
  phone?: string;
  /** Notification events this contact subscribes to */
  notifyOn?: VPCNotificationEvent[];
}

/** A VPC-enrolled account (virtual card registered with payment controls) */
export interface VPCAccount {
  accountId: string;
  /** Virtual card PAN (may be masked) */
  accountNumber: string;
  status: VPCAccountStatus;
  contacts: VPCContact[];
  rules: VPCRule[];
  createdAt: string;
  updatedAt: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────

/** Events that can trigger a VPC notification */
export type VPCNotificationEvent =
  | 'transaction_approved'
  | 'transaction_declined'
  | 'rule_triggered'
  | 'account_blocked'
  | 'rules_updated';

/** A VPC notification record (email or SMS sent to a contact) */
export interface VPCNotification {
  notificationId: string;
  accountId: string;
  event: VPCNotificationEvent;
  channel: 'email' | 'sms';
  recipient: string;
  message: string;
  sentAt: string;
  deliveryStatus: 'delivered' | 'failed' | 'pending';
}

// ── Transactions ──────────────────────────────────────────────────────────────

/** A VPC transaction record (approved or declined) */
export interface VPCTransaction {
  transactionId: string;
  accountId: string;
  amount: number;
  currencyCode: string;
  merchantName: string;
  merchantId?: string;
  merchantCategoryCode?: string;
  channel: 'online' | 'pos' | 'atm' | 'contactless';
  countryCode?: string;
  outcome: 'approved' | 'declined';
  /** VPC rule code that caused the decline (if outcome = 'declined') */
  declineReason?: VPCRuleCode;
  declineMessage?: string;
  transactedAt: string;
}

// ── IPC (Intelligent Payment Controls — Gen-AI) ───────────────────────────────

/** Natural-language prompt request for IPC Gen-AI rule suggestion */
export interface IPCPromptRequest {
  /** Natural language description of how the card should be used */
  prompt: string;
  /** Optional account context to tailor suggestions */
  accountId?: string;
  /** ISO 4217 numeric currency code for amount-based rules (default "840") */
  currencyCode?: string;
}

/** A single suggested rule set from IPC */
export interface IPCSuggestedRuleSet {
  ruleSetId: string;
  /** Human-readable explanation of why these rules were suggested */
  rationale: string;
  rules: VPCRule[];
  /** Confidence score 0–100 */
  confidence: number;
}

/** Response from IPC Gen-AI rule suggestion */
export interface IPCRuleSetResponse {
  promptId: string;
  prompt: string;
  suggestions: IPCSuggestedRuleSet[];
  generatedAt: string;
}

// ── Supplier Validation ───────────────────────────────────────────────────────

/** Supplier registration payload for VPC validation */
export interface VPCSupplierRegistration {
  supplierName: string;
  /** Acquirer BIN (Bank Identification Number) */
  acquirerBin: string;
  /** Card Acceptor ID — unique merchant identifier in Visa network */
  caid: string;
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;
  mcc?: string;
  address?: string;
  city?: string;
  postalCode?: string;
}

/** Validation status of a supplier in the VPC system */
export type VPCValidationStatus = 'pending' | 'validated' | 'rejected' | 'suspended';

/** VPC supplier validation record */
export interface VPCSupplierValidation {
  supplierId: string;
  acquirerBin: string;
  caid: string;
  supplierName: string;
  status: VPCValidationStatus;
  validatedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Service request / response shapes ────────────────────────────────────────

export interface VPCCreateAccountParams {
  /** Virtual card account number to register */
  accountNumber: string;
  contacts?: VPCContact[];
  /** Initial rules to set on registration */
  rules?: VPCRule[];
}

export interface VPCUpdateAccountParams {
  contacts?: VPCContact[];
}

export interface VPCGetNotificationHistoryParams {
  /** Filter by event type */
  event?: VPCNotificationEvent;
  /** ISO date filter — records on or after this date */
  fromDate?: string;
  /** ISO date filter — records on or before this date */
  toDate?: string;
  limit?: number;
}

export interface VPCGetTransactionHistoryParams {
  /** Filter by outcome */
  outcome?: 'approved' | 'declined';
  /** ISO date filter */
  fromDate?: string;
  /** ISO date filter */
  toDate?: string;
  limit?: number;
}
