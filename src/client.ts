/**
 * Visa Developer Platform — mTLS HTTP client
 *
 * Visa B2B APIs (B2B Payments, Supplier Match Service, VPC) require
 * Two-Way SSL (mutual TLS) in both the Sandbox and Certification
 * environments.  This module provides a Node.js `https`-based fetch
 * wrapper that attaches the client certificate and private key to every
 * outbound request.
 *
 * How to obtain the TLS materials from Visa Developer Center:
 *   1. Private Key   — generated locally when you submitted your CSR.
 *   2. Client Cert   — download from Project → Credentials → Two-Way SSL.
 *   3. Username/PWD  — Project → Credentials → Two-Way SSL → expand cert.
 *   4. CA Bundle     — Common Certificates at the bottom of the Two-Way SSL
 *                      section (optional but recommended for cert chain validation).
 */

import * as https from 'https';
import { URL } from 'url';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TLS materials required by the Visa Developer Platform Two-Way SSL.
 *
 * All values are PEM-encoded strings (the text that begins with
 * `-----BEGIN CERTIFICATE-----` or `-----BEGIN RSA PRIVATE KEY-----`).
 * You can read them from disk with `fs.readFileSync(path, 'utf-8')`.
 */
export interface VisaTLSMaterials {
  /**
   * Client certificate PEM.
   * Download from: Project → Credentials → Two-Way SSL → Download Certificate.
   */
  cert: string;

  /**
   * Private key PEM.
   * This is the key you generated locally before submitting your CSR to Visa.
   */
  key: string;

  /**
   * CA / Common Certificates PEM bundle (optional).
   * Available at the bottom of the Two-Way SSL section in Visa Developer Center.
   * Providing this enables full certificate-chain validation.
   */
  ca?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// mTLS fetch factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a fetch-compatible function pre-configured for Visa Two-Way SSL.
 *
 * The returned function has the same signature as the global `fetch` and can
 * be passed as the `fetch` option to any service constructor.  Internally it
 * uses Node.js `https.request` with a persistent `https.Agent` that holds
 * the client certificate so every call is authenticated at the TLS layer.
 *
 * @example
 * ```ts
 * import fs from 'fs';
 * import { createMtlsFetch, VisaNetworkService } from '@visa-gov/sdk';
 *
 * const mtlsFetch = createMtlsFetch({
 *   cert: fs.readFileSync('./certs/visa-client.crt', 'utf-8'),
 *   key:  fs.readFileSync('./certs/visa-client.key', 'utf-8'),
 *   ca:   fs.readFileSync('./certs/visa-ca-bundle.crt', 'utf-8'),
 * });
 *
 * const service = new VisaNetworkService({
 *   baseUrl:  'https://sandbox.api.visa.com',
 *   userId:   process.env.VISA_USER_ID!,
 *   password: process.env.VISA_PASSWORD!,
 *   cert:     fs.readFileSync('./certs/visa-client.crt', 'utf-8'),
 *   key:      fs.readFileSync('./certs/visa-client.key', 'utf-8'),
 *   ca:       fs.readFileSync('./certs/visa-ca-bundle.crt', 'utf-8'),
 * });
 * ```
 */
export function createMtlsFetch(
  tls: VisaTLSMaterials,
): (url: string, init: RequestInit) => Promise<Response> {
  const agent = new https.Agent({
    cert: tls.cert,
    key:  tls.key,
    ca:   tls.ca,
    rejectUnauthorized: true,
    keepAlive: true,
  });

  return (url: string, init: RequestInit = {}): Promise<Response> => {
    return new Promise((resolve, reject) => {
      const parsed  = new URL(url);
      const method  = (init.method ?? 'GET').toUpperCase();
      const rawBody = init.body as string | Buffer | undefined;

      const reqHeaders: Record<string, string> = {};
      if (init.headers) {
        const h = init.headers as Record<string, string>;
        for (const [k, v] of Object.entries(h)) reqHeaders[k] = v;
      }
      if (rawBody) {
        reqHeaders['Content-Length'] = String(Buffer.byteLength(rawBody));
      }

      const options: https.RequestOptions = {
        hostname: parsed.hostname,
        port:     parsed.port ? Number(parsed.port) : 443,
        path:     parsed.pathname + parsed.search,
        method,
        headers:  reqHeaders,
        agent,
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v == null) continue;
            const values = Array.isArray(v) ? v : [v];
            values.forEach((val) => headers.append(k, val));
          }
          resolve(
            new Response(body, {
              status:     res.statusCode ?? 200,
              statusText: res.statusMessage ?? '',
              headers,
            }),
          );
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      if (rawBody) req.write(rawBody);
      req.end();
    });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper — pick the right fetch implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the fetch function to use for a Visa API request.
 *
 * Priority:
 *   1. Caller-supplied `fetch` (explicit override, e.g. in tests)
 *   2. mTLS fetch derived from cert + key in the config
 *   3. Global `fetch` (Node 18+ / browser, no mTLS)
 *
 * @internal
 */
export function resolveFetch(config: {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  cert?: string;
  key?: string;
  ca?: string;
}): (url: string, init: RequestInit) => Promise<Response> {
  if (config.fetch) return config.fetch;
  if (config.cert && config.key) {
    return createMtlsFetch({ cert: config.cert, key: config.key, ca: config.ca });
  }
  return fetch as unknown as (url: string, init: RequestInit) => Promise<Response>;
}
