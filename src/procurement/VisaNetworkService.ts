import {
  VisaSupplierMatchRequest,
  VisaSupplierMatchResponse,
  VisaNetworkCheckResult,
  VisaApiConfig,
  VisaMatchConfidence,
  VISA_SMS_STATUS_CODES,
} from '../types/visa-api';
import { Supplier } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// VisaNetworkService — Visa Supplier Match Service (SMS) integration
//
// Verifies whether a supplier is registered in the Visa network by calling
// the Visa SMS API (POST /suppliermatching/v1/supplierregistry/search).
//
// Two modes:
//   Live     — calls the real Visa API (sandbox or production)
//   Sandbox  — returns realistic mock responses without network calls
// ─────────────────────────────────────────────────────────────────────────────

const SMS_ENDPOINT = '/suppliermatching/v1/supplierregistry/search';

/** Map Visa confidence strings to a 0-100 score. */
function confidenceToScore(confidence: VisaMatchConfidence, matched: boolean): number {
  if (!matched) return 0;
  switch (confidence) {
    case 'High':   return 95;
    case 'Medium': return 70;
    case 'Low':    return 45;
    case 'None':   return 0;
  }
}

/** Deterministic sandbox MCC based on supplier name hash (for consistent mock results). */
function sandboxMCC(name: string): string {
  const MCC_POOL = ['5045', '5047', '5065', '5084', '5085', '5199', '7372', '7389', '3501'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return MCC_POOL[Math.abs(hash) % MCC_POOL.length];
}

/** Build a mock Visa SMS response for sandbox mode. */
function buildSandboxResponse(
  request: VisaSupplierMatchRequest,
  forceStatus?: 'Yes' | 'No',
): VisaSupplierMatchResponse {
  // Sandbox logic: suppliers with "budget", "cheap", or "test-fail" in their
  // name return No match; everything else returns Yes with High confidence.
  const nameLower = request.supplierName.toLowerCase();
  const isRegistered = forceStatus
    ? forceStatus === 'Yes'
    : !nameLower.includes('budget') && !nameLower.includes('test-fail');

  const confidence: VisaMatchConfidence = isRegistered
    ? nameLower.includes('pending') ? 'Medium' : 'High'
    : 'None';

  return {
    matchConfidence: confidence,
    matchStatus:     isRegistered ? 'Yes' : 'No',
    matchDetails: {
      mcc:      isRegistered ? sandboxMCC(request.supplierName) : '',
      l2:       isRegistered ? 'Y' : '',
      l3s:      isRegistered ? 'Y' : '',
      l3li:     '',
      fleetInd: nameLower.includes('fleet') ? 'Y' : '',
    },
    status: {
      statusCode:        VISA_SMS_STATUS_CODES.SUCCESS,
      statusDescription: 'Request successfully received',
    },
  };
}

/**
 * VisaNetworkService
 *
 * Checks whether a supplier is registered in the Visa network using the
 * Visa Supplier Match Service (SMS) API.
 *
 * @example
 * ```ts
 * // ── Sandbox mode (no credentials needed) ────────────────────────────────
 * const service = VisaNetworkService.sandbox();
 *
 * const result = await service.check({
 *   supplierName:        'MedEquip Co.',
 *   supplierCountryCode: 'US',
 *   supplierCity:        'New York',
 *   supplierState:       'NY',
 * });
 *
 * console.log(result.isRegistered);     // true
 * console.log(result.confidenceScore);  // 95
 * console.log(result.mcc);              // "5047"
 *
 * // ── Live mode (Visa API credentials) ────────────────────────────────────
 * const liveService = new VisaNetworkService({
 *   baseUrl:  'https://sandbox.api.visa.com',
 *   userId:   process.env.VISA_USER_ID!,
 *   password: process.env.VISA_PASSWORD!,
 * });
 *
 * const result = await liveService.check({ supplierName: 'Acme Corp', supplierCountryCode: 'US' });
 * ```
 */
export class VisaNetworkService {
  private readonly config: VisaApiConfig | null;
  private readonly isSandbox: boolean;

  constructor(config: VisaApiConfig | null = null) {
    this.config    = config;
    this.isSandbox = config === null;
  }

  /** Create a sandbox instance — no credentials needed, returns realistic mocks. */
  static sandbox(): VisaNetworkService {
    return new VisaNetworkService(null);
  }

  /**
   * Check if a supplier is registered in the Visa network.
   *
   * @param request - Supplier details to match against the Visa registry.
   *   `supplierName` and `supplierCountryCode` are required.
   *   More fields = higher match accuracy.
   */
  async check(request: VisaSupplierMatchRequest): Promise<VisaNetworkCheckResult> {
    this.validateRequest(request);

    const raw = this.isSandbox
      ? buildSandboxResponse(request)
      : await this.callVisaAPI(request);

    return this.parseResponse(raw);
  }

  /**
   * Check multiple suppliers in parallel (max 10 concurrent).
   * Returns a map of supplierName → VisaNetworkCheckResult.
   */
  async bulkCheck(
    requests: VisaSupplierMatchRequest[],
  ): Promise<Map<string, VisaNetworkCheckResult>> {
    const CONCURRENCY = 10;
    const results     = new Map<string, VisaNetworkCheckResult>();
    const chunks: VisaSupplierMatchRequest[][] = [];

    for (let i = 0; i < requests.length; i += CONCURRENCY) {
      chunks.push(requests.slice(i, i + CONCURRENCY));
    }

    for (const chunk of chunks) {
      const settled = await Promise.allSettled(chunk.map((r) => this.check(r)));
      settled.forEach((outcome, i) => {
        const key = chunk[i].supplierName;
        if (outcome.status === 'fulfilled') {
          results.set(key, outcome.value);
        } else {
          // Build a "not found" result for failed requests
          results.set(key, this.notFoundResult());
        }
      });
    }

    return results;
  }

  /**
   * Convenience: check a Supplier domain object directly.
   * Maps Supplier fields to the Visa SMS request format.
   */
  async checkSupplier(supplier: Supplier & {
    countryCode?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    streetAddress?: string;
    phoneNumber?: string;
    taxId?: string;
  }): Promise<VisaNetworkCheckResult> {
    return this.check({
      supplierName:         supplier.name,
      supplierCountryCode:  supplier.countryCode ?? 'US',
      supplierCity:         supplier.city,
      supplierState:        supplier.state,
      supplierPostalCode:   supplier.postalCode,
      supplierStreetAddress: supplier.streetAddress,
      supplierPhoneNumber:  supplier.phoneNumber,
      supplierTaxId:        supplier.taxId,
    });
  }

  /**
   * Enrich a Supplier object with Visa network registry data.
   */
  async enrichSupplier<T extends Supplier>(
    supplier: T & { countryCode?: string },
  ): Promise<T & { visaNetwork: VisaNetworkCheckResult }> {
    const result = await this.checkSupplier(supplier);
    return {
      ...supplier,
      visaNetwork: result,
    };
  }

  /**
   * Enrich multiple suppliers in parallel.
   */
  async enrichSuppliers<T extends Supplier>(
    suppliers: T[],
    countryCode = 'US',
  ): Promise<Array<T & { visaNetwork: VisaNetworkCheckResult }>> {
    return Promise.all(
      suppliers.map((s) => this.enrichSupplier({ ...s, countryCode })),
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private validateRequest(request: VisaSupplierMatchRequest): void {
    if (!request.supplierName?.trim()) {
      throw new Error('VisaNetworkService: supplierName is required');
    }
    if (!request.supplierCountryCode?.trim()) {
      throw new Error('VisaNetworkService: supplierCountryCode is required');
    }
    if (!/^[A-Z]{2}$/.test(request.supplierCountryCode.toUpperCase())) {
      throw new Error(
        `VisaNetworkService: supplierCountryCode must be a 2-letter ISO code (got "${request.supplierCountryCode}")`,
      );
    }
  }

  private async callVisaAPI(
    request: VisaSupplierMatchRequest,
  ): Promise<VisaSupplierMatchResponse> {
    const cfg = this.config!;
    const url = `${cfg.baseUrl}${SMS_ENDPOINT}`;

    const credentials = Buffer.from(`${cfg.userId}:${cfg.password}`).toString('base64');
    const fetchFn     = cfg.fetch ?? fetch;

    const response = await fetchFn(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(
        `Visa SMS API error: HTTP ${response.status} — ${await response.text()}`,
      );
    }

    return response.json() as Promise<VisaSupplierMatchResponse>;
  }

  private parseResponse(raw: VisaSupplierMatchResponse): VisaNetworkCheckResult {
    const isRegistered = raw.matchStatus === 'Yes';

    return {
      raw,
      isRegistered,
      confidenceScore: confidenceToScore(raw.matchConfidence, isRegistered),
      mcc:             raw.matchDetails.mcc,
      supportsL2:      raw.matchDetails.l2  === 'Y',
      supportsL3:      raw.matchDetails.l3s === 'Y' || raw.matchDetails.l3li === 'Y',
      isFleetSupplier: raw.matchDetails.fleetInd === 'Y',
      checkedAt:       new Date().toISOString(),
    };
  }

  private notFoundResult(): VisaNetworkCheckResult {
    return {
      raw: {
        matchConfidence: 'None',
        matchStatus:     'No',
        matchDetails:    { mcc: '', l2: '', l3s: '', l3li: '', fleetInd: '' },
        status:          { statusCode: VISA_SMS_STATUS_CODES.SERVER_ERROR, statusDescription: 'Request failed' },
      },
      isRegistered:    false,
      confidenceScore: 0,
      mcc:             '',
      supportsL2:      false,
      supportsL3:      false,
      isFleetSupplier: false,
      checkedAt:       new Date().toISOString(),
    };
  }
}
