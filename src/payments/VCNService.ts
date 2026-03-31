import type {
  VCNRequestPayload,
  VCNRequestResponse,
  VCNIssuedAccount,
} from '../types/vcn-request';
import { resolveFetch, VisaTLSMaterials } from '../client';

// ─────────────────────────────────────────────────────────────────────────────
// VCNService — Request a Virtual Card via Visa B2B Virtual Account Payment API
//
// Endpoint: POST /vpa/v1/cards/provisioning
//
// Two modes:
//   Live    — calls the real Visa API (sandbox or production)
//   Sandbox — returns realistic mock responses without network calls
//             (omit `options.baseUrl` to use sandbox mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VCNService
 *
 * Requests virtual cards through the Visa B2B Virtual Account Payment API
 * (`POST /vpa/v1/cards/provisioning`).
 *
 * Omit `options` (or omit `options.baseUrl`) to use sandbox mode — no
 * credentials required, returns realistic simulated card data.
 *
 * @example
 * ```ts
 * import { VCNService, buildSPVRule, buildBlockRule } from '@visa-gov/sdk';
 *
 * const vcn = new VCNService();
 *
 * // Sandbox (no credentials)
 * const response = await vcn.requestVirtualCard({
 *   clientId:      'B2BWS_1_1_9999',
 *   buyerId:       '9999',
 *   messageId:     Date.now().toString(),
 *   action:        'A',
 *   numberOfCards: '1',
 *   proxyPoolId:   'Proxy12345',
 *   requisitionDetails: {
 *     startDate: '2025-05-11',
 *     endDate:   '2025-06-01',
 *     timeZone:  'UTC-8',
 *     rules: [
 *       buildSPVRule({ spendLimitAmount: 5000, maxAuth: 10, currencyCode: '840', rangeType: 'monthly' }),
 *       buildBlockRule('ECOM'),
 *       buildBlockRule('ATM'),
 *     ],
 *   },
 * });
 *
 * console.log(response.accounts[0].accountNumber); // Visa PAN
 *
 * // Live (Visa sandbox/production)
 * const liveResponse = await vcn.requestVirtualCard(payload, {
 *   baseUrl:     'https://sandbox.api.visa.com',
 *   credentials: { userId: process.env.VISA_USER_ID!, password: process.env.VISA_PASSWORD! },
 *   tls: {
 *     cert: fs.readFileSync('./certs/cert.pem', 'utf-8'),
 *     key:  fs.readFileSync('./certs/privateKey-....pem', 'utf-8'),
 *     ca:   caBundle,
 *   },
 * });
 * ```
 */
export class VCNService {
  /**
   * Request one or more virtual cards via the Visa B2B Virtual Account
   * Payment Method API (`POST /vpa/v1/cards/provisioning`).
   *
   * In sandbox mode the call resolves immediately with simulated card data.
   * In live mode it POSTs to `{baseUrl}/vpa/v1/cards/provisioning` with
   * HTTP Basic authentication and optional mTLS.
   */
  async requestVirtualCard(
    payload: VCNRequestPayload,
    options?: {
      /**
       * Visa API base URL (default: sandbox simulation — no HTTP call).
       * Sandbox / Certification: https://sandbox.api.visa.com
       */
      baseUrl?: string;
      /**
       * HTTP Basic auth credentials.
       * Found in: Project → Credentials → Two-Way SSL (Username + Password).
       * Required when baseUrl is provided.
       */
      credentials?: { userId: string; password: string };
      /**
       * Two-Way SSL (mTLS) materials for the Visa Developer Platform.
       * Required in Sandbox and Certification environments.
       *
       *   cert — download from Project → Credentials → Two-Way SSL
       *   key  — private key generated at CSR submission time
       *   ca   — Common Certificates from Two-Way SSL section (optional)
       */
      tls?: VisaTLSMaterials;
      /**
       * Injectable fetch override — bypasses mTLS auto-detection.
       * Use for unit tests or custom HTTP clients.
       */
      fetch?: typeof fetch;
    },
  ): Promise<VCNRequestResponse> {
    // ── Live mode ─────────────────────────────────────────────────────────────
    if (options?.baseUrl) {
      const { baseUrl, credentials, tls, fetch: explicitFetch } = options;

      const _fetch = resolveFetch({
        fetch: explicitFetch as ((url: string, init: RequestInit) => Promise<Response>) | undefined,
        ...tls,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (credentials) {
        const token = Buffer.from(`${credentials.userId}:${credentials.password}`).toString('base64');
        headers['Authorization'] = `Basic ${token}`;
      }

      const res = await _fetch(`${baseUrl}/vpa/v1/cards/provisioning`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Visa VPA API error: ${res.status} ${res.statusText}`);
      }

      return res.json() as Promise<VCNRequestResponse>;
    }

    // ── Sandbox simulation ────────────────────────────────────────────────────
    const count = parseInt(payload.numberOfCards, 10) || 1;

    const accounts: VCNIssuedAccount[] = Array.from({ length: count }, () => ({
      accountNumber: '4' + Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join(''),
      proxyNumber:   'PRX' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      expiryDate:    (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 3);
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      })(),
      cvv2:   String(Math.floor(100 + Math.random() * 900)),
      status: 'active' as const,
    }));

    return {
      messageId:       payload.messageId,
      responseCode:    '00',
      responseMessage: 'Virtual card(s) issued successfully',
      accounts,
      requestedAt:     new Date().toISOString(),
    };
  }
}
