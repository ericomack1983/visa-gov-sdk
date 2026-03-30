// ─────────────────────────────────────────────────────────────────────────────
// Visa B2B Virtual Account Payment Method API — Virtual Card Request types
//
// Endpoint: POST /vpa/v1/cards/provisioning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All supported rule codes for Visa B2B Virtual Card controls.
 *
 * Spending limits:
 *   SPV    — Spend Velocity (rolling period limit with max auth count)
 *   PUR    — Single purchase limit
 *   EAM    — Exact Amount Match (card authorised only for exact amount)
 *   VPAS   — Virtual Payment Account Specific (exact match with tolerance)
 *   TOLRNC — Tolerance band (min/max delta around expected amount)
 *   XBRA   — Cross-border amount cap
 *   ATML   — ATM cash withdrawal limit
 *
 * Merchant restrictions (no overrides = category blocked):
 *   CAID   — Card Acceptor ID lock (single merchant)
 *   HOT    — Hotels / lodging
 *   AUTO   — Auto dealers / rentals
 *   AIR    — Airlines
 *   REST   — Restaurants
 *   FUEL   — Fuel / petrol
 *   JEWL   — Jewelry
 *   ELEC   — Electronics
 *   ALC    — Alcohol / liquor stores
 *   GTM    — Government / tax payments
 *   OSS    — Other services
 *   GROC   — Grocery
 *   ENT    — Entertainment
 *   UTIL   — Utilities
 *   CLOTH  — Clothing / apparel
 *   MED    — Medical / healthcare
 *
 * Channel restrictions:
 *   ATM    — ATM cash withdrawals blocked
 *   ECOM   — E-commerce / online transactions blocked
 *   CNP    — Card-Not-Present transactions blocked
 *   XBR    — Cross-border transactions blocked
 *
 * Other:
 *   NOC    — No controls (open card)
 *   ADT    — Adult content blocked
 */
export type VCNRuleCode =
  // Spending
  | 'SPV' | 'PUR' | 'EAM' | 'VPAS' | 'TOLRNC' | 'XBRA' | 'ATML'
  // Merchant
  | 'CAID' | 'HOT' | 'AUTO' | 'AIR' | 'REST' | 'FUEL' | 'JEWL'
  | 'ELEC' | 'ALC' | 'GTM' | 'OSS' | 'GROC' | 'ENT' | 'UTIL'
  | 'CLOTH' | 'MED'
  // Channel
  | 'ATM' | 'ECOM' | 'CNP' | 'XBR'
  // Other
  | 'NOC' | 'ADT';

// ── Override codes per rule ───────────────────────────────────────────────────

/** SPV override codes */
export type SPVOverrideCode =
  | 'spendLimitAmount'   // Maximum cumulative spend amount in the period
  | 'maxAuth'            // Maximum number of authorisations allowed
  | 'amountCurrencyCode' // ISO 4217 numeric currency code (e.g. "840" = USD)
  | 'rangeType'          // Period type: 1=Daily, 2=Weekly, 3=Monthly, 4=Lifetime
  | 'startDate'          // Rule start date MM/DD/YYYY
  | 'endDate'            // Rule end date MM/DD/YYYY
  | 'updateFlag';        // NOCHANGE | RESET

/** Amount-based rule override codes (PUR, EAM, XBRA, ATML, VPAS) */
export type AmountOverrideCode = 'amountCurrencyCode' | 'amountValue';

/** TOLRNC override codes */
export type TOLRNCOverrideCode = 'amountCurrencyCode' | 'minValue' | 'maxValue';

/** CAID override codes */
export type CAIDOverrideCode = 'CAIDValue';

// ── Core building blocks ──────────────────────────────────────────────────────

/**
 * A single rule override parameter.
 * `sequence` controls ordering; multiple overrides with sequence "0" are peers.
 */
export interface VCNRuleOverride {
  sequence: string;
  overrideCode: string;
  overrideValue: string;
}

/**
 * A payment control rule applied to the virtual card.
 * Rules without overrides act as simple on/off blocks for that category/channel.
 */
export interface VCNRule {
  ruleCode: VCNRuleCode;
  overrides?: VCNRuleOverride[];
}

/** Optional metadata fields attached to the card request. */
export interface VCNOptionalInfo {
  optionalFieldName: string;
  optionalFieldValue: string;
}

/** Validity window and rules for the virtual card. */
export interface VCNRequisitionDetails {
  /** Card active from date — YYYY-MM-DD */
  startDate: string;
  /** Card active until date — YYYY-MM-DD */
  endDate: string;
  /** IANA / UTC offset time zone (e.g. "UTC-8", "America/New_York") */
  timeZone?: string;
  /** Payment control rules to apply at issuance */
  rules: VCNRule[];
}

// ── Request ───────────────────────────────────────────────────────────────────

/**
 * Request body for POST /vpa/v1/cards/provisioning
 *
 * Issues one or more Visa B2B virtual cards with embedded payment controls.
 *
 * @example
 * ```ts
 * const payload: VCNRequestPayload = {
 *   clientId:   'B2BWS_1_1_9999',
 *   buyerId:    '9999',
 *   messageId:  Date.now().toString(),
 *   action:     'A',
 *   numberOfCards: '1',
 *   proxyPoolId: 'Proxy12345',
 *   requisitionDetails: {
 *     startDate: '2025-05-11',
 *     endDate:   '2025-06-01',
 *     timeZone:  'UTC-8',
 *     rules: [
 *       {
 *         ruleCode: 'SPV',
 *         overrides: [
 *           { sequence: '1', overrideCode: 'spendLimitAmount',   overrideValue: '5000'  },
 *           { sequence: '2', overrideCode: 'maxAuth',            overrideValue: '10'    },
 *           { sequence: '3', overrideCode: 'amountCurrencyCode', overrideValue: '840'   },
 *           { sequence: '4', overrideCode: 'rangeType',          overrideValue: '3'     },
 *         ],
 *       },
 *       { ruleCode: 'ECOM' },
 *       { ruleCode: 'ATM'  },
 *     ],
 *   },
 * };
 * ```
 */
export interface VCNRequestPayload {
  /** Visa-assigned client identifier */
  clientId: string;
  /** Buyer / organisation identifier */
  buyerId: string;
  /** Unique message ID for idempotency — recommend `Date.now().toString()` */
  messageId: string;
  /**
   * Action type:
   *   "A" — Add (issue new card)
   *   "U" — Update existing card
   *   "D" — Delete / cancel card
   */
  action: 'A' | 'U' | 'D';
  /** Number of cards to issue in this request */
  numberOfCards: string;
  /** Virtual card number proxy pool identifier */
  proxyPoolId?: string;
  /** Existing account number — leave empty ("") for new issuance */
  accountNumber?: string;
  /** Validity window + payment control rules */
  requisitionDetails: VCNRequisitionDetails;
  /** Arbitrary key/value metadata fields */
  optionalInfo?: VCNOptionalInfo[];
}

// ── Response ──────────────────────────────────────────────────────────────────

/** A single issued virtual card in the response. */
export interface VCNIssuedAccount {
  accountNumber: string;    // Virtual card PAN (may be masked)
  proxyNumber?: string;     // Proxy / token number
  expiryDate?: string;      // MM/YYYY or YYMM depending on issuer
  cvv2?: string;            // CVV2 (only returned in sandbox)
  status: 'active' | 'inactive' | 'blocked';
}

/** Response envelope from POST /vpa/v1/cards/provisioning */
export interface VCNRequestResponse {
  messageId: string;
  responseCode: string;       // "00" = success
  responseMessage: string;    // Human-readable status
  accounts: VCNIssuedAccount[];
  requestedAt: string;        // ISO 8601
}

// ── Typed rule builders ───────────────────────────────────────────────────────

/**
 * Helper: build a Spend Velocity (SPV) rule object.
 *
 * @example
 * ```ts
 * import { buildSPVRule } from '@visa-gov/sdk';
 *
 * const rule = buildSPVRule({
 *   spendLimitAmount: 5000,
 *   maxAuth: 10,
 *   currencyCode: '840',
 *   rangeType: 'monthly',
 *   startDate: '05/11/2025',
 *   endDate:   '06/01/2025',
 * });
 * ```
 */
export function buildSPVRule(params: {
  spendLimitAmount: number;
  maxAuth: number;
  currencyCode: string;
  rangeType: 'daily' | 'weekly' | 'monthly' | 'lifetime';
  startDate?: string;
  endDate?: string;
  updateFlag?: 'NOCHANGE' | 'RESET';
}): VCNRule {
  const rangeMap = { daily: '1', weekly: '2', monthly: '3', lifetime: '4' };
  const overrides: VCNRuleOverride[] = [
    { sequence: '1', overrideCode: 'spendLimitAmount',   overrideValue: String(params.spendLimitAmount) },
    { sequence: '2', overrideCode: 'maxAuth',            overrideValue: String(params.maxAuth)           },
    { sequence: '3', overrideCode: 'amountCurrencyCode', overrideValue: params.currencyCode              },
    { sequence: '4', overrideCode: 'rangeType',          overrideValue: rangeMap[params.rangeType]       },
  ];
  if (params.startDate)  overrides.push({ sequence: '5', overrideCode: 'startDate',  overrideValue: params.startDate });
  if (params.endDate)    overrides.push({ sequence: '6', overrideCode: 'endDate',    overrideValue: params.endDate   });
  if (params.updateFlag) overrides.push({ sequence: '7', overrideCode: 'updateFlag', overrideValue: params.updateFlag });
  return { ruleCode: 'SPV', overrides };
}

/** Helper: build an amount-based rule (PUR, EAM, XBRA, ATML, VPAS). */
export function buildAmountRule(
  ruleCode: 'PUR' | 'EAM' | 'XBRA' | 'ATML' | 'VPAS',
  amount: number,
  currencyCode: string,
): VCNRule {
  return {
    ruleCode,
    overrides: [
      { sequence: '0', overrideCode: 'amountCurrencyCode', overrideValue: currencyCode  },
      { sequence: '0', overrideCode: 'amountValue',        overrideValue: String(amount) },
    ],
  };
}

/** Helper: build a Tolerance (TOLRNC) rule. */
export function buildToleranceRule(params: {
  currencyCode: string;
  minValue: number;
  maxValue: number;
}): VCNRule {
  return {
    ruleCode: 'TOLRNC',
    overrides: [
      { sequence: '0', overrideCode: 'amountCurrencyCode', overrideValue: params.currencyCode   },
      { sequence: '0', overrideCode: 'minValue',           overrideValue: String(params.minValue) },
      { sequence: '0', overrideCode: 'maxValue',           overrideValue: String(params.maxValue) },
    ],
  };
}

/** Helper: lock card to a single Card Acceptor (merchant). */
export function buildCAIDRule(caidValue: string): VCNRule {
  return {
    ruleCode: 'CAID',
    overrides: [{ sequence: '0', overrideCode: 'CAIDValue', overrideValue: caidValue }],
  };
}

/** Helper: add a simple block rule with no parameters (ATM, ECOM, CNP, HOT, FUEL, etc.). */
export function buildBlockRule(ruleCode: VCNRuleCode): VCNRule {
  return { ruleCode };
}
