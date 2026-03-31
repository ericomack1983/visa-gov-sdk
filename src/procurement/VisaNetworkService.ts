import {
  VisaSupplierMatchRequest,
  VisaSupplierMatchResponse,
  VisaNetworkCheckResult,
  VisaApiConfig,
  VisaMatchConfidence,
  VISA_SMS_STATUS_CODES,
} from '../types/visa-api';
import { Supplier } from '../types';
import { resolveFetch } from '../client';

// ─────────────────────────────────────────────────────────────────────────────
// VisaNetworkService — Visa Supplier Matching Service (SMS) integration
//
// Verifies whether a supplier accepts Visa Commercial Payment Products by
// calling the Visa Supplier Matching Service API.
//
// Confirmed endpoint (Visa Developer Center API Reference):
//   POST /visasuppliermatchingservice/v1/search
//   All parameters are passed as query string parameters (not request body).
//
// Bulk endpoints:
//   POST /visasuppliermatchingservice/v1/upload   — upload CSV batch file
//   GET  /visasuppliermatchingservice/v1/status   — poll batch file status
//   GET  /visasuppliermatchingservice/v1/download — download matched results
//
// Two modes:
//   Live     — calls the real Visa API (sandbox or production)
//   Sandbox  — returns realistic mock responses without network calls
// ─────────────────────────────────────────────────────────────────────────────

const SMS_BASE    = '/visasuppliermatchingservice/v1';
const SMS_SEARCH  = `${SMS_BASE}/search`;
const SMS_UPLOAD  = `${SMS_BASE}/upload`;
const SMS_STATUS  = `${SMS_BASE}/status`;
const SMS_DOWNLOAD = `${SMS_BASE}/download`;

// ── Response from the bulk upload endpoint ────────────────────────────────────
export interface VisaBulkUploadResponse {
  fileId: number;
  status: { statusCode: string; statusDescription: string };
}

// ── Response from the bulk status endpoint ────────────────────────────────────
export interface VisaBulkStatusResponse {
  fileId: number;
  status: { statusCode: string; statusDescription: string };
}

// ── Response from the bulk download endpoint ─────────────────────────────────
export interface VisaBulkDownloadResponse {
  /** CSV-format strings — one entry per matched supplier. */
  byteArray: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
 * Checks whether a supplier accepts Visa Commercial Payment Products using
 * the Visa Supplier Matching Service (SMS) API.
 *
 * Suppliers confirmed by the API (matchStatus = "Yes") receive a
 * `visaAcceptMark: true` flag on their result, which SupplierMatcher uses
 * to annotate ScoredBids in evaluateWithVisaCheck().
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
 * console.log(result.visaAcceptMark);   // true
 * console.log(result.isRegistered);     // true
 * console.log(result.confidenceScore);  // 95
 * console.log(result.mcc);              // "5047"
 *
 * // ── Live mode (Visa API credentials) ────────────────────────────────────
 * const liveService = new VisaNetworkService({
 *   baseUrl:  'https://sandbox.api.visa.com',
 *   userId:   process.env.VISA_USER_ID!,
 *   password: process.env.VISA_PASSWORD!,
 *   cert:     fs.readFileSync('./certs/cert.pem', 'utf-8'),
 *   key:      fs.readFileSync('./certs/privateKey-....pem', 'utf-8'),
 *   ca:       caBundle,
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
   * Check if a supplier accepts Visa Commercial Payment Products.
   * Endpoint: POST /visasuppliermatchingservice/v1/search
   * Parameters are sent as query string (not request body).
   *
   * @param request - Supplier details to match. `supplierName` and
   *   `supplierCountryCode` are required; more fields = higher accuracy.
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
        results.set(
          key,
          outcome.status === 'fulfilled' ? outcome.value : this.notFoundResult(),
        );
      });
    }

    return results;
  }

  /**
   * Convenience: check a Supplier domain object directly.
   * Maps Supplier fields to the Visa SMS query parameter format.
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
      supplierName:          supplier.name,
      supplierCountryCode:   supplier.countryCode ?? 'US',
      supplierCity:          supplier.city,
      supplierState:         supplier.state,
      supplierPostalCode:    supplier.postalCode,
      supplierStreetAddress: supplier.streetAddress,
      supplierPhoneNumber:   supplier.phoneNumber,
      supplierTaxId:         supplier.taxId,
    });
  }

  /**
   * Enrich a Supplier object with Visa network registry data.
   * Adds `visaNetwork: VisaNetworkCheckResult` (includes `visaAcceptMark`).
   */
  async enrichSupplier<T extends Supplier>(
    supplier: T & { countryCode?: string },
  ): Promise<T & { visaNetwork: VisaNetworkCheckResult }> {
    const result = await this.checkSupplier(supplier);
    return { ...supplier, visaNetwork: result };
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

  // ── Bulk API ───────────────────────────────────────────────────────────────

  /**
   * Upload a CSV bulk file of suppliers for batch matching.
   * Endpoint: POST /visasuppliermatchingservice/v1/upload?countryCode=US
   *
   * @returns fileId — use with bulkStatus() and bulkDownload()
   */
  async bulkUpload(
    csvContent: string,
    countryCode: string,
  ): Promise<VisaBulkUploadResponse> {
    if (this.isSandbox) {
      return {
        fileId: Math.floor(1000 + Math.random() * 9000),
        status: { statusCode: VISA_SMS_STATUS_CODES.SUCCESS, statusDescription: 'File uploaded successfully' },
      };
    }

    const cfg   = this.config!;
    const qs    = new URLSearchParams({ countryCode }).toString();
    const url   = `${cfg.baseUrl}${SMS_UPLOAD}?${qs}`;
    const token = Buffer.from(`${cfg.userId}:${cfg.password}`).toString('base64');
    const fn    = resolveFetch(cfg);

    const res = await fn(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'text/plain',
        Accept:          'application/json',
        Authorization:   `Basic ${token}`,
      },
      body: csvContent,
    });

    if (!res.ok) throw new Error(`Visa SMS upload error: HTTP ${res.status}`);
    return res.json() as Promise<VisaBulkUploadResponse>;
  }

  /**
   * Poll the processing status of a bulk upload.
   * Endpoint: GET /visasuppliermatchingservice/v1/status?fileId=1001
   */
  async bulkStatus(fileId: string): Promise<VisaBulkStatusResponse> {
    if (this.isSandbox) {
      return {
        fileId: Number(fileId),
        status: { statusCode: VISA_SMS_STATUS_CODES.SUCCESS, statusDescription: 'File processing completed' },
      };
    }

    const cfg   = this.config!;
    const qs    = new URLSearchParams({ fileId }).toString();
    const url   = `${cfg.baseUrl}${SMS_STATUS}?${qs}`;
    const token = Buffer.from(`${cfg.userId}:${cfg.password}`).toString('base64');
    const fn    = resolveFetch(cfg);

    const res = await fn(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Basic ${token}` },
    });

    if (!res.ok) throw new Error(`Visa SMS status error: HTTP ${res.status}`);
    return res.json() as Promise<VisaBulkStatusResponse>;
  }

  /**
   * Download results of a completed bulk match.
   * Endpoint: GET /visasuppliermatchingservice/v1/download?inputFileId=1001
   *
   * @returns byteArray — CSV-format strings, one per matched supplier.
   */
  async bulkDownload(inputFileId: string): Promise<VisaBulkDownloadResponse> {
    if (this.isSandbox) {
      return {
        byteArray: [
          '1,Acme Medical Supplies,123 Main St,Boston,MA,02101,840,Yes,High,5047',
          '2,Budget Supplies Co,456 Oak Ave,Dallas,TX,75201,840,No,,',
        ],
      };
    }

    const cfg   = this.config!;
    const qs    = new URLSearchParams({ inputFileId }).toString();
    const url   = `${cfg.baseUrl}${SMS_DOWNLOAD}?${qs}`;
    const token = Buffer.from(`${cfg.userId}:${cfg.password}`).toString('base64');
    const fn    = resolveFetch(cfg);

    const res = await fn(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Basic ${token}` },
    });

    if (!res.ok) throw new Error(`Visa SMS download error: HTTP ${res.status}`);
    return res.json() as Promise<VisaBulkDownloadResponse>;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private validateRequest(request: VisaSupplierMatchRequest): void {
    if (!request.supplierName?.trim()) {
      throw new Error('VisaNetworkService: supplierName is required');
    }
    if (!request.supplierCountryCode?.trim()) {
      throw new Error('VisaNetworkService: supplierCountryCode is required');
    }
    if (!/^[A-Z]{2}$/i.test(request.supplierCountryCode)) {
      throw new Error(
        `VisaNetworkService: supplierCountryCode must be a 2-letter ISO code (got "${request.supplierCountryCode}")`,
      );
    }
  }

  private async callVisaAPI(
    request: VisaSupplierMatchRequest,
  ): Promise<VisaSupplierMatchResponse> {
    const cfg = this.config!;

    // Build query string — Visa SMS API passes all params as query parameters
    const params: Record<string, string> = {
      supplierName:        request.supplierName,
      supplierCountryCode: request.supplierCountryCode,
    };
    if (request.supplierStreetAddress) params.supplierStreetAddress = request.supplierStreetAddress;
    if (request.supplierCity)          params.supplierCity          = request.supplierCity;
    if (request.supplierState)         params.supplierState         = request.supplierState;
    if (request.supplierPostalCode)    params.supplierPostalCode    = request.supplierPostalCode;
    if (request.supplierPhoneNumber)   params.supplierPhoneNumber   = request.supplierPhoneNumber;
    if (request.supplierTaxId)         params.supplierTaxId         = request.supplierTaxId;

    const qs  = new URLSearchParams(params).toString();
    const url = `${cfg.baseUrl}${SMS_SEARCH}?${qs}`;

    const token  = Buffer.from(`${cfg.userId}:${cfg.password}`).toString('base64');
    const fetchFn = resolveFetch(cfg);

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        Accept:         'application/json',
        Authorization:  `Basic ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Visa SMS API error: HTTP ${response.status} — ${await response.text()}`,
      );
    }

    return response.json() as Promise<VisaSupplierMatchResponse>;
  }

  private parseResponse(raw: VisaSupplierMatchResponse): VisaNetworkCheckResult {
    const isRegistered  = raw.matchStatus === 'Yes';
    const visaAcceptMark = isRegistered;  // Visa Accept Mark = matchStatus "Yes"

    return {
      raw,
      isRegistered,
      visaAcceptMark,
      confidenceScore: confidenceToScore(raw.matchConfidence, isRegistered),
      mcc:             raw.matchDetails.mcc,
      supportsL2:      raw.matchDetails.l2   === 'Y',
      supportsL3:      raw.matchDetails.l3s  === 'Y' || raw.matchDetails.l3li === 'Y',
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
      visaAcceptMark:  false,
      confidenceScore: 0,
      mcc:             '',
      supportsL2:      false,
      supportsL3:      false,
      isFleetSupplier: false,
      checkedAt:       new Date().toISOString(),
    };
  }
}
