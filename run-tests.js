#!/usr/bin/env node
/**
 * @visa-gov/sdk — Unified Test Runner
 *
 * Run all test suites or any combination individually.
 *
 * Usage:
 *   node run-tests.js                         # run every suite
 *   node run-tests.js vcn                     # B2B Virtual Account Payments
 *   node run-tests.js vpa                     # Full VPA Account Management
 *   node run-tests.js bip                     # BIP & SIP Payment Flows
 *   node run-tests.js sms                     # Visa Supplier Match Service
 *   node run-tests.js ai                      # AI Supplier Evaluation
 *   node run-tests.js vpc                     # Visa B2B Payment Controls
 *   node run-tests.js ipc                     # IPC — Gen-AI Rules
 *   node run-tests.js settlement              # Settlement
 *   node run-tests.js vpa bip sms             # multiple specific suites
 *   node run-tests.js --list                  # show all available suite keys
 *
 * Notes:
 *   • vcn / ai / settlement all run test-sdk.ts (internal SDK test).
 *     If more than one of these is requested, test-sdk.ts runs only once.
 *   • Live sandbox endpoints require mTLS certs in ./certs/
 *   • Colour codes: GREEN = live 2xx  YELLOW = warn 400  MAGENTA = mock
 */

'use strict';

const { spawnSync } = require('child_process');
const path          = require('path');
const os            = require('os');

const ROOT = __dirname;

// ── Suite definitions ─────────────────────────────────────────────────────────
//
// Each suite has:
//   key      — CLI argument(s) that select this suite
//   label    — human-readable name (matches README sections)
//   cmd      — executable to run
//   args     — arguments passed to the executable
//   file     — the actual script run (used for deduplication)

const SUITES = [
  {
    keys:  ['vcn'],
    label: '1 · B2B Virtual Account Payments',
    cmd:   'npx',
    args:  ['tsx', path.join(ROOT, 'test-sdk.ts')],
    file:  'test-sdk.ts',
  },
  {
    keys:  ['vpa'],
    label: '2 · Full VPA Account Management',
    cmd:   'node',
    args:  [path.join(ROOT, 'test-vpa.js')],
    file:  'test-vpa.js',
  },
  {
    keys:  ['bip', 'sip', 'bip-sip'],
    label: '3 · BIP & SIP Payment Flows',
    cmd:   'node',
    args:  [path.join(ROOT, 'test-bip-sip.js')],
    file:  'test-bip-sip.js',
  },
  {
    keys:  ['sms'],
    label: '4 · Visa Supplier Match Service',
    cmd:   'node',
    args:  [path.join(ROOT, 'test-visa-sms.js')],
    file:  'test-visa-sms.js',
  },
  {
    keys:  ['ai', 'scorer', 'matcher'],
    label: '5 · AI Supplier Evaluation',
    cmd:   'npx',
    args:  ['tsx', path.join(ROOT, 'test-sdk.ts')],
    file:  'test-sdk.ts',
  },
  {
    keys:  ['vpc'],
    label: '6 · Visa B2B Payment Controls',
    cmd:   'node',
    args:  [path.join(ROOT, 'test-vpc.js')],
    file:  'test-vpc.js',
  },
  {
    keys:  ['ipc'],
    label: '7 · IPC — Gen-AI Rules',
    cmd:   'node',
    args:  [path.join(ROOT, 'test-ipc.js')],
    file:  'test-ipc.js',
  },
  {
    keys:  ['settlement', 'settle'],
    label: '8 · Settlement',
    cmd:   'npx',
    args:  ['tsx', path.join(ROOT, 'test-sdk.ts')],
    file:  'test-sdk.ts',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const DIM   = '\x1b[2m';
const CYAN  = '\x1b[36m';

function banner(text) {
  const line = '═'.repeat(80);
  console.log(`\n${BOLD}${line}${RESET}`);
  console.log(`${BOLD}  ${text}${RESET}`);
  console.log(`${BOLD}${line}${RESET}`);
}

function printHelp() {
  console.log(`
${BOLD}@visa-gov/sdk — Unified Test Runner${RESET}

${BOLD}USAGE${RESET}
  node run-tests.js [suite ...]     Run one or more suites (space-separated)
  node run-tests.js                 Run every suite (same as: all)
  node run-tests.js all             Run every suite explicitly
  node run-tests.js --list          List all suite keys and aliases
  node run-tests.js --help          Show this help message

${BOLD}SUITE KEYS${RESET}
  ${CYAN}vcn${RESET}          B2B Virtual Account Payments   ${DIM}POST /vpa/v1/cards/provisioning${RESET}
  ${CYAN}vpa${RESET}          Full VPA Account Management    ${DIM}/vpa/v1/* (28 endpoints)${RESET}
  ${CYAN}bip${RESET}          BIP & SIP Payment Flows        ${DIM}/vpa/v1/paymentService/* (10 endpoints)${RESET}
  ${CYAN}sms${RESET}          Visa Supplier Match Service    ${DIM}POST /visasuppliermatchingservice/v1/search${RESET}
  ${CYAN}ai${RESET}           AI Supplier Evaluation         ${DIM}SDK-internal (SupplierMatcher)${RESET}
  ${CYAN}vpc${RESET}          Visa B2B Payment Controls      ${DIM}/vpc/v1/* (15 endpoints)${RESET}
  ${CYAN}ipc${RESET}          IPC — Gen-AI Rules             ${DIM}POST /vpc/v1/ipc/suggest + /apply${RESET}
  ${CYAN}settlement${RESET}   Settlement                     ${DIM}SDK-internal (SettlementService)${RESET}

${BOLD}ALIASES${RESET}
  bip-sip, sip   → bip
  scorer, matcher → ai
  settle          → settlement

${BOLD}EXAMPLES${RESET}
  node run-tests.js                    # run all 8 suites
  node run-tests.js sms                # Visa Supplier Match only
  node run-tests.js vpa bip sms        # VPA + BIP/SIP + SMS
  node run-tests.js vcn ai settlement  # runs test-sdk.ts once (shared)
  node run-tests.js vpc ipc            # Payment Controls + Gen-AI

${BOLD}OUTPUT LEGEND${RESET}
  ${GREEN}LIVE nnn${RESET}   Real Visa sandbox accepted the call (2xx)
  \x1b[33mWARN nnn\x1b[0m   Endpoint reached; business/payload validation error (400)
  \x1b[35mMOCK\x1b[0m       Blocked (401/404) — module needs Visa provisioning; mock shown

${BOLD}NOTES${RESET}
  • vcn, ai and settlement all run test-sdk.ts internally.
    Requesting any combination runs it only once.
  • Live sandbox calls require mTLS certs in ./certs/
  • Exit code 0 = all selected suites passed; 1 = at least one failed.
`);
}

function printList() {
  console.log('\nAvailable test suites:\n');
  console.log(`  ${'Key(s)'.padEnd(28)} Label`);
  console.log(`  ${'─'.repeat(70)}`);
  for (const s of SUITES) {
    const keys = s.keys.join(', ');
    const note = s.file === 'test-sdk.ts' ? `${DIM}(shares test-sdk.ts)${RESET}` : '';
    console.log(`  ${CYAN}${keys.padEnd(28)}${RESET} ${s.label}  ${note}`);
  }
  console.log(`\n  ${'all'.padEnd(28)} Run every suite\n`);
  console.log(`  Example:  node run-tests.js vpa bip sms`);
  console.log(`  Example:  node run-tests.js vcn ai settlement  ${DIM}(runs test-sdk.ts once)${RESET}\n`);
}

function resolve(args) {
  const lower = args.map((a) => a.toLowerCase());

  if (lower.includes('--help') || lower.includes('-h') || lower.includes('help')) {
    printHelp();
    process.exit(0);
  }

  if (lower.includes('--list') || lower.includes('-l') || lower.includes('list')) {
    printList();
    process.exit(0);
  }

  const runAll = lower.length === 0 || lower.includes('all');

  if (runAll) return SUITES;

  // Match requested keys → collect unique files (deduplicate test-sdk.ts)
  const seen  = new Set();
  const picks = [];
  for (const suite of SUITES) {
    const matched = suite.keys.some((k) => lower.includes(k));
    if (matched && !seen.has(suite.file)) {
      seen.add(suite.file);
      picks.push(suite);
    } else if (matched && seen.has(suite.file)) {
      // Already queued — add an alias entry that won't re-run but will show in table
      picks.push({ ...suite, _skip: true });
    }
  }

  if (picks.length === 0) {
    console.error(`\nUnknown suite key(s): ${args.join(', ')}`);
    console.error('Run  node run-tests.js --list  to see available keys.\n');
    process.exit(1);
  }

  return picks;
}

function run(suite) {
  const result = spawnSync(suite.cmd, suite.args, {
    stdio:  'inherit',
    cwd:    ROOT,
    shell:  os.platform() === 'win32',
    env:    process.env,
  });
  return result.status ?? 1;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const args   = process.argv.slice(2);
  const suites = resolve(args);

  const runAll = args.length === 0 || args.includes('all');

  banner(
    runAll
      ? '@visa-gov/sdk — Full Test Suite'
      : `@visa-gov/sdk — Test Suite: ${args.join(', ')}`,
  );

  console.log(`\n  Suites to run : ${suites.filter((s) => !s._skip).length}`);
  console.log(`  Started at    : ${new Date().toISOString()}\n`);

  // Track results for summary
  const results = [];
  const startAll = Date.now();

  for (const suite of suites) {
    if (suite._skip) {
      // Shared file already ran — record as covered
      results.push({ label: suite.label, status: 'covered', exitCode: 0, ms: 0 });
      continue;
    }

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`${BOLD}  Running: ${suite.label}${RESET}`);
    console.log(`${'─'.repeat(80)}\n`);

    const t0       = Date.now();
    const exitCode = run(suite);
    const ms       = Date.now() - t0;

    results.push({ label: suite.label, status: exitCode === 0 ? 'pass' : 'fail', exitCode, ms });
  }

  const totalMs = Date.now() - startAll;

  // ── Final summary ───────────────────────────────────────────────────────────
  banner('@visa-gov/sdk — Test Results');

  console.log('');
  const colW = 42;
  console.log(`  ${'Suite'.padEnd(colW)} ${'Result'.padEnd(10)} ${'Time'}`);
  console.log(`  ${'─'.repeat(70)}`);

  let allPassed = true;
  for (const r of results) {
    let marker, color;
    if (r.status === 'pass')    { marker = '✓ PASS';    color = GREEN; }
    else if (r.status === 'covered') { marker = '~ shared'; color = DIM;   }
    else                        { marker = '✗ FAIL';    color = RED;   allPassed = false; }

    const time = r.ms > 0 ? `${(r.ms / 1000).toFixed(1)}s` : '—';
    console.log(`  ${r.label.padEnd(colW)} ${color}${marker.padEnd(10)}${RESET} ${DIM}${time}${RESET}`);
  }

  console.log(`\n  ${'─'.repeat(70)}`);
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  console.log(`  Total time : ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`  Passed     : ${GREEN}${passed}${RESET}`);
  if (failed > 0) {
    console.log(`  Failed     : ${RED}${failed}${RESET}`);
  }
  console.log('');

  if (allPassed) {
    console.log(`${GREEN}${BOLD}  All suites passed.${RESET}\n`);
  } else {
    console.log(`${RED}${BOLD}  Some suites failed — check output above.${RESET}\n`);
    process.exit(1);
  }
}

main();
