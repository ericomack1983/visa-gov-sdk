/**
 * Visa Developer Platform — Hello World connectivity test
 *
 * Verifies mTLS + Basic Auth against the Visa sandbox:
 *   GET https://sandbox.api.visa.com/vdp/helloworld
 *
 * Credentials are read from the ./certs directory:
 *   certs/cert.pem                                               — client certificate
 *   certs/privateKey-ea7ab837-d61c-43ff-9c50-13de588668ff.pem   — private key
 *   certs/DigiCertGlobalRootG2.crt.pem                          — CA bundle (1/3)
 *   certs/SBX-2024-Prod-Root.pem                                 — CA bundle (2/3)
 *   certs/SBX-2024-Prod-Inter.pem                                — CA bundle (3/3)
 *   certs/credentials.txt                                        — USER= / PWD=
 *
 * Run:
 *   npx tsx helloworld.ts
 */

import fs   from 'fs';
import path from 'path';
import { createMtlsFetch } from './src/client.js';

// ── 1. Load TLS materials ─────────────────────────────────────────────────────

const CERTS_DIR = path.join(__dirname, 'certs');

const cert = fs.readFileSync(path.join(CERTS_DIR, 'cert.pem'), 'utf-8');

const key = fs.readFileSync(
  path.join(CERTS_DIR, 'privateKey-ea7ab837-d61c-43ff-9c50-13de588668ff.pem'),
  'utf-8',
);

// CA bundle — enables full certificate-chain validation against the Visa root CA
const ca = [
  'DigiCertGlobalRootG2.crt.pem',
  'SBX-2024-Prod-Root.pem',
  'SBX-2024-Prod-Inter.pem',
].map((f) => fs.readFileSync(path.join(CERTS_DIR, f), 'utf-8')).join('\n');

// ── 2. Load Basic-Auth credentials ───────────────────────────────────────────

function parseCredentials(filePath: string): Record<string, string> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return Object.fromEntries(
    raw
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => l.split('=').map((s) => s.trim()) as [string, string]),
  );
}

const { USER, PWD } = parseCredentials(path.join(CERTS_DIR, 'credentials.txt'));

if (!USER || !PWD) {
  console.error('credentials.txt must contain USER= and PWD= entries');
  process.exit(1);
}

const basicAuth = Buffer.from(`${USER}:${PWD}`).toString('base64');

// ── 3. Make the Hello World request ──────────────────────────────────────────

const HELLO_WORLD_URL = 'https://sandbox.api.visa.com/vdp/helloworld';

async function main(): Promise<void> {
  console.log('Visa Developer Platform — Hello World');
  console.log('======================================');
  console.log(`Endpoint : ${HELLO_WORLD_URL}`);
  console.log(`User ID  : ${USER}`);
  console.log('mTLS     : enabled (cert + key + CA bundle loaded)');
  console.log('');

  const mtlsFetch = createMtlsFetch({ cert, key, ca });

  let res: Response;
  try {
    res = await mtlsFetch(HELLO_WORLD_URL, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept:        'application/json',
      },
    });
  } catch (err) {
    console.error('Connection error:', (err as Error).message);
    process.exit(1);
  }

  const body = await res.text();

  console.log(`HTTP Status : ${res.status} ${res.statusText}`);
  console.log('');

  try {
    const json = JSON.parse(body);
    console.log('Response:');
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log('Response body:');
    console.log(body);
  }

  if (res.ok) {
    console.log('\nConnectivity test PASSED');
  } else {
    console.error('\nConnectivity test FAILED');
    process.exit(1);
  }
}

main();
