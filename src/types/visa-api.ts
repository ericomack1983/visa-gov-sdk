// ─────────────────────────────────────────────────────────────────────────────
// Visa Supplier Match Service (SMS) API types
//
// Reference: Visa Supplier Match Service API
// Status code prefix: SMSAPI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request payload for the Visa Supplier Match Service.
 * Checks whether a supplier is registered in the Visa network.
 */
export interface VisaSupplierMatchRequest {
  /** Name of the Supplier (required) */
  supplierName: string;

  /** ISO 3166-1 alpha-2 country code of the Supplier (required) — e.g. "US", "BR" */
  supplierCountryCode: string;

  /** City of the Supplier */
  supplierCity?: string;

  /** State / province of the Supplier */
  supplierState?: string;

  /** Postal code of the Supplier */
  supplierPostalCode?: string;

  /** Street address of the Supplier */
  supplierStreetAddress?: string;

  /** Phone number of the Supplier */
  supplierPhoneNumber?: string;

  /** Tax ID / EIN of the Supplier */
  supplierTaxId?: string;
}

/**
 * Confidence level returned by Visa for the supplier match.
 */
export type VisaMatchConfidence = 'High' | 'Medium' | 'Low' | 'None';

/**
 * Whether the supplier was found in the Visa network.
 */
export type VisaMatchStatus = 'Yes' | 'No';

/**
 * Detailed match data returned by Visa when a supplier is found.
 */
export interface VisaMatchDetails {
  /** Merchant Category Code — e.g. "3501" (Hotels), "5047" (Medical Equipment) */
  mcc: string;

  /** Level 2 purchasing card data indicator */
  l2: string;

  /** Level 3 summary data indicator */
  l3s: string;

  /** Level 3 line-item data indicator */
  l3li: string;

  /** Fleet card indicator */
  fleetInd: string;
}

/**
 * API response status envelope.
 * Success code: SMSAPI000
 */
export interface VisaApiStatus {
  statusCode: string;
  statusDescription: string;
}

/**
 * Full response from the Visa Supplier Match Service API.
 */
export interface VisaSupplierMatchResponse {
  matchConfidence: VisaMatchConfidence;
  matchStatus: VisaMatchStatus;
  matchDetails: VisaMatchDetails;
  status: VisaApiStatus;
}

/**
 * Visa SMS API status codes.
 */
export const VISA_SMS_STATUS_CODES = {
  SUCCESS:          'SMSAPI000',
  NOT_FOUND:        'SMSAPI001',
  INVALID_REQUEST:  'SMSAPI002',
  UNAUTHORIZED:     'SMSAPI401',
  RATE_LIMIT:       'SMSAPI429',
  SERVER_ERROR:     'SMSAPI500',
} as const;

/**
 * Enriched result returned by VisaNetworkService — combines the raw
 * Visa API response with a derived `isRegistered` boolean and a
 * `confidenceScore` (0-100) derived from the Visa match confidence level.
 */
export interface VisaNetworkCheckResult {
  /** Raw Visa API response */
  raw: VisaSupplierMatchResponse;

  /** Whether the supplier is registered in the Visa network */
  isRegistered: boolean;

  /** Visa match confidence mapped to 0-100 (High=95, Medium=70, Low=45, None=0) */
  confidenceScore: number;

  /** MCC code returned by Visa (empty string if not found) */
  mcc: string;

  /** Supports Level 2 purchasing data */
  supportsL2: boolean;

  /** Supports Level 3 purchasing data */
  supportsL3: boolean;

  /** Supports fleet cards */
  isFleetSupplier: boolean;

  /** ISO timestamp of when the check was performed */
  checkedAt: string;
}

/**
 * Configuration for connecting to the Visa SMS API.
 */
export interface VisaApiConfig {
  /**
   * Base URL for the Visa API.
   * Sandbox:    https://sandbox.api.visa.com
   * Production: https://api.visa.com
   */
  baseUrl: string;

  /** Visa API user ID (from Visa Developer Center project) */
  userId: string;

  /** Visa API password (from Visa Developer Center project) */
  password: string;

  /**
   * Optional: inject a custom fetch implementation.
   * Defaults to the global `fetch` (Node 18+ / browser).
   * Pass `node-fetch` or a test stub here if needed.
   */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}
