/**
 * Visa Developer Platform — Hello World connectivity test
 *
 * Verifies mTLS + Basic Auth against the Visa sandbox:
 *   GET https://sandbox.api.visa.com/vdp/helloworld
 *
 * Run:  node helloworld.js
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── 1. Load TLS materials ─────────────────────────────────────────────────────

const CERTS_DIR = path.join(__dirname, 'certs');

// Bundle all CA certs for server-side chain verification.
// DigiCertGlobalRootG2  — signs sandbox.api.visa.com server cert
// SBX-2024-Prod-Root    — Visa sandbox PKI root
// SBX-2024-Prod-Inter   — Visa sandbox PKI intermediate
const caBundle = [
  'DigiCertGlobalRootG2.crt.pem',
  'SBX-2024-Prod-Root.pem',
  'SBX-2024-Prod-Inter.pem',
].map((f) => fs.readFileSync(path.join(CERTS_DIR, f), 'utf-8')).join('\n');

const privateKey = fs.readFileSync(
  path.join(CERTS_DIR, 'privateKey-ea7ab837-d61c-43ff-9c50-13de588668ff.pem'),
  'utf-8',
);

// ── 2. Load Basic-Auth credentials ───────────────────────────────────────────

const credRaw = fs.readFileSync(path.join(CERTS_DIR, 'credentials.txt'), 'utf-8');
const creds   = Object.fromEntries(
  credRaw
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const { USER, PWD } = creds;
if (!USER || !PWD) {
  console.error('credentials.txt must contain USER= and PWD= entries');
  process.exit(1);
}

const basicAuth = Buffer.from(`${USER}:${PWD}`).toString('base64');

// ── 3. Client certificate (mTLS) ─────────────────────────────────────────────
// The client cert is the leaf certificate Visa issues for your project.
// Download it from: Project → Credentials → Two-Way SSL → Download Certificate
// and save it to certs/visa-client.pem, then set the path below.
//
// Candidates to try from what is available in certs/:
//   SBX-2024-Prod-Inter.pem  (intermediate — likely not a leaf client cert)
//   SBX-2024-Prod-Root.pem   (root CA — not a client cert)
//
const CLIENT_CERT_PATH = path.join(CERTS_DIR, 'cert.pem');
const clientCert = CLIENT_CERT_PATH ? fs.readFileSync(CLIENT_CERT_PATH, 'utf-8') : undefined;

// ── 4. Make the Hello World request ──────────────────────────────────────────

const options = {
  hostname: 'sandbox.api.visa.com',
  path:     '/vdp/helloworld',
  port:     443,
  method:   'GET',
  headers: {
    Authorization: `Basic ${basicAuth}`,
    Accept:        'application/json',
  },
  ca: caBundle,
  rejectUnauthorized: true,
  ...(clientCert ? { cert: clientCert, key: privateKey } : {}),
};

console.log('Visa Developer Platform — Hello World');
console.log('======================================');
console.log(`Endpoint : https://${options.hostname}${options.path}`);
console.log(`User ID  : ${USER}`);
console.log(`mTLS     : ${clientCert ? 'enabled (client cert + private key)' : 'Basic Auth only — client cert not configured'}`);
console.log(`CA bundle: DigiCertGlobalRootG2 + SBX-2024-Prod-Root + SBX-2024-Prod-Inter`);
console.log('');

const req = https.request(options, (res) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf-8');

    console.log(`HTTP Status : ${res.statusCode} ${res.statusMessage}`);
    console.log('');

    try {
      const json = JSON.parse(body);
      console.log('Response:');
      console.log(JSON.stringify(json, null, 2));
    } catch {
      console.log('Response body:');
      console.log(body);
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('\nConnectivity test PASSED ✓');
    } else if (res.statusCode === 400 && body.includes('9123')) {
      console.log('\nNetwork connectivity : REACHABLE ✓');
      console.log('Auth status          : FAILED — client certificate required (error 9123)');
      console.log('');
      console.log('Action: download your client cert from Visa Developer Center:');
      console.log('  Project → Credentials → Two-Way SSL → Download Certificate');
      console.log('  Save as certs/visa-client.pem and set CLIENT_CERT_PATH above.');
      process.exit(1);
    } else if (res.statusCode === 401 && body.includes('9124')) {
      console.log('\nNetwork connectivity : REACHABLE ✓');
      console.log('mTLS handshake       : PASSED ✓  (client cert accepted)');
      console.log('Auth status          : FAILED — credentials mismatch (error 9124)');
      console.log('');
      console.log('Possible causes:');
      console.log('  1. USER/PWD in credentials.txt do not match this project\'s API key.');
      console.log('  2. cert.pem belongs to a different project than the credentials.');
      console.log('  Verify both under: Visa Developer Center → Project → Credentials → Two-Way SSL.');
      process.exit(1);
    } else {
      console.error('\nConnectivity test FAILED ✗');
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

req.end();
