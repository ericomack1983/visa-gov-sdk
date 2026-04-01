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
