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

const { spawnSync }   = require('child_process');
const path            = require('path');
const os              = require('os');
const { printBanner } = require('./banner');

const ROOT = __dirname;

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  reset:    '\x1b[0m',
  bold:     '\x1b[1m',
  dim:      '\x1b[2m',
  italic:   '\x1b[3m',
  underline:'\x1b[4m',
  black:    '\x1b[30m',
  red:      '\x1b[31m',
  green:    '\x1b[32m',
  yellow:   '\x1b[33m',
  blue:     '\x1b[34m',
  magenta:  '\x1b[35m',
  cyan:     '\x1b[36m',
  white:    '\x1b[37m',
  brightRed:    '\x1b[91m',
  brightGreen:  '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue:   '\x1b[94m',
  brightMagenta:'\x1b[95m',
  brightCyan:   '\x1b[96m',
  brightWhite:  '\x1b[97m',
  bgBlue:   '\x1b[44m',
  bgCyan:   '\x1b[46m',
};

// ── Timing helpers ────────────────────────────────────────────────────────────

/** Synchronous sleep — does not block the event loop but pauses execution. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Print text character-by-character for a typewriter effect. */
function typewrite(text, { delay = 22, color = '' } = {}) {
  if (color) process.stdout.write(color);
  for (const ch of text) {
    process.stdout.write(ch);
    sleep(delay);
  }
  if (color) process.stdout.write(C.reset);
  process.stdout.write('\n');
}

/** Print a line with a leading pause so each item lands visibly. */
function slowLine(text, pauseBefore = 120) {
  sleep(pauseBefore);
  console.log(text);
}

// ── Box-drawing helpers ───────────────────────────────────────────────────────

const W = 78; // inner content width (box is W+2 border chars wide)

function boxTop(color = C.cyan) {
  return `${color}╔${'═'.repeat(W)}╗${C.reset}`;
}
function boxBot(color = C.cyan) {
  return `${color}╚${'═'.repeat(W)}╝${C.reset}`;
}
function boxDiv(color = C.cyan) {
  return `${color}╠${'═'.repeat(W)}╣${C.reset}`;
}
function boxRow(text = '', color = C.cyan) {
  // Strip ANSI codes to measure visible length
  const visible = text.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, W - visible.length - 2);
  return `${color}║${C.reset} ${text}${' '.repeat(pad)} ${color}║${C.reset}`;
}
function boxEmpty(color = C.cyan) {
  return boxRow('', color);
}

// ── Suite definitions ─────────────────────────────────────────────────────────

const SUITES = [
  {
    keys:  ['vcn'],
    label: '1 · B2B Virtual Account Payments',
    cmd:   'npx',
    args:  ['tsx', path.join(ROOT, 'test-sdk.ts')],
    file:  'test-sdk.ts',
    sessionNum: 1,
    tagline: 'Virtual card provisioning for enterprise B2B purchasing workflows',
    description: [
      'Provisions virtual card numbers (VCNs) on demand — enabling enterprises to',
      'issue single-use or multi-use cards tied to purchase orders, suppliers, and',
      'spending rules. No plastic. No manual reconciliation. Just code.',
    ],
    highlights: [
      'POST /vpa/v1/cards/provisioning  — dynamic card issuance',
      'Spend controls embedded at card-creation time',
      'Full mTLS sandbox round-trip with real Visa infrastructure',
    ],
    accentColor: C.brightCyan,
  },
  {
    keys:  ['vpa'],
    label: '2 · Full VPA Account Management',
    cmd:   'node',
    args:  [path.join(ROOT, 'test-vpa.js')],
    file:  'test-vpa.js',
    sessionNum: 2,
    tagline: 'Complete Virtual Payment Account lifecycle across 28 live endpoints',
    description: [
      'Walks every stage of a VPA account from first creation through suspension,',
      'resumption, and closure. Covers supplier pools, proxy pools, and account',
      'management — the full breadth of Visa\'s VPA platform surface.',
    ],
    highlights: [
      '28 Visa sandbox endpoints exercised end-to-end',
      'Account provisioning · activation · suspension · closure',
      'Supplier pool & proxy pool management',
      'Processor-credential flows with realistic mock fallbacks',
    ],
    accentColor: C.brightBlue,
  },
  {
    keys:  ['bip', 'sip', 'bip-sip'],
    label: '3 · BIP & SIP Payment Flows',
    cmd:   'node',
    args:  [path.join(ROOT, 'test-bip-sip.js')],
    file:  'test-bip-sip.js',
    sessionNum: 3,
    tagline: 'Buyer-Initiated and Supplier-Initiated payment orchestration',
    description: [
      'Demonstrates both directions of payment initiation in Visa\'s VPA ecosystem.',
      'BIP lets buyers push funds to suppliers on their own schedule; SIP lets',
      'suppliers pull approved payments when goods or services are delivered.',
    ],
    highlights: [
      '10 endpoints: /vpa/v1/paymentService/*',
      'BIP — buyer-controlled disbursement timing',
      'SIP — supplier-triggered settlement on delivery',
      'Idempotency keys and retry-safe request patterns',
    ],
    accentColor: C.brightGreen,
  },
  {
    keys:  ['sms'],
    label: '4 · Visa Supplier Match Service',
    cmd:   'node',
    args:  [path.join(ROOT, 'test-visa-sms.js')],
    file:  'test-visa-sms.js',
    sessionNum: 4,
    tagline: 'AI-assisted supplier discovery across Visa\'s commercial network',
    description: [
      'Queries Visa\'s Supplier Match Service to find and verify commercial',
      'counterparties. Buyers submit supplier details; the service returns ranked',
      'matches with confidence scores drawn from Visa\'s payment network data.',
    ],
    highlights: [
      'POST /visasuppliermatchingservice/v1/search',
      'Fuzzy name + address matching across millions of merchants',
      'Confidence-scored results for straight-through processing',
      'Foundation layer for AI-assisted procurement automation',
    ],
    accentColor: C.brightYellow,
  },
  {
    keys:  ['ai', 'scorer', 'matcher'],
    label: '5 · AI Supplier Evaluation',
    cmd:   'npx',
    args:  ['tsx', path.join(ROOT, 'test-sdk.ts')],
    file:  'test-sdk.ts',
    sessionNum: 5,
    tagline: 'Machine-learning supplier scoring built on top of Visa network data',
    description: [
      'The SDK\'s SupplierMatcher class wraps the raw search API with an opinionated',
      'scoring layer. Suppliers are ranked by payment history, compliance posture,',
      'and category relevance — turning raw matches into actionable procurement intel.',
    ],
    highlights: [
      'SDK-internal SupplierMatcher — zero raw API calls needed',
      'Multi-factor scoring: history · compliance · category fit',
      'Batch evaluation across supplier shortlists',
      'Structured output ready for ERP or procurement workflow ingestion',
    ],
    accentColor: C.brightMagenta,
  },
  {
    keys:  ['vpc'],
    label: '6 · Visa B2B Payment Controls',
    cmd:   'node',
    args:  [path.join(ROOT, 'test-vpc.js')],
    file:  'test-vpc.js',
    sessionNum: 6,
    tagline: 'Real-time authorization rules that travel with every payment',
    description: [
      'VPC lets finance teams encode procurement policy directly into the payment',
      'rail. Rules block, cap, or flag transactions at the moment of authorization —',
      'before funds move — with zero integration overhead on the supplier side.',
    ],
    highlights: [
      '15 endpoints: /vpc/v1/*',
      'Account management · rule CRUD · reporting · supplier validation',
      'Block / disable / enable controls without card reissuance',
      'Notification and transaction ledger for audit-ready reporting',
    ],
    accentColor: C.brightRed,
  },
  {
    keys:  ['ipc'],
    label: '7 · IPC — Intelligent Payment Controls',
    cmd:   'node',
    args:  [path.join(ROOT, 'test-ipc.js')],
    file:  'test-ipc.js',
    sessionNum: 7,
    tagline: 'Natural language → spend policy — Gen-AI on the Visa payment rail',
    description: [
      'IPC is the Gen-AI layer on top of VPC. A procurement manager types a plain-',
      'English policy ("limit travel spend to $500 per trip, no weekend charges");',
      'the API returns ranked rule-sets ready to apply to any account — instantly.',
    ],
    highlights: [
      'POST /vpc/v1/ipc/suggest  — prompt → ranked rule sets',
      'POST /vpc/v1/ipc/apply    — activate chosen rules on any account',
      'No rule-definition expertise required — policy as plain text',
      'Same authorization engine as VPC — rules are live at card-swipe time',
    ],
    accentColor: C.brightCyan,
  },
  {
    keys:  ['settlement', 'settle'],
    label: '8 · Settlement',
    cmd:   'npx',
    args:  ['tsx', path.join(ROOT, 'test-sdk.ts')],
    file:  'test-sdk.ts',
    sessionNum: 8,
    tagline: 'End-to-end transaction settlement via the SDK SettlementService',
    description: [
      'The SDK\'s SettlementService abstracts the full settlement cycle: batch',
      'submission, status polling, and reconciliation callbacks. Finance teams get',
      'a clean promise-based interface over Visa\'s settlement infrastructure.',
    ],
    highlights: [
      'SDK-internal SettlementService — single async call per batch',
      'Batch submission with idempotent retry semantics',
      'Status polling with exponential back-off built in',
      'Structured reconciliation output for ERP auto-posting',
    ],
    accentColor: C.brightBlue,
  },
];

// ── Standard helpers ──────────────────────────────────────────────────────────

function banner(text) {
  const line = '═'.repeat(80);
  console.log(`\n${C.bold}${line}${C.reset}`);
  console.log(`${C.bold}  ${text}${C.reset}`);
  console.log(`${C.bold}${line}${C.reset}`);
}

function printHelp() {
  console.log(`
${C.bold}@visa-gov/sdk — Unified Test Runner${C.reset}

${C.bold}USAGE${C.reset}
  node run-tests.js [suite ...]     Run one or more suites (space-separated)
  node run-tests.js                 Run every suite (same as: all)
  node run-tests.js all             Run every suite explicitly
  node run-tests.js --list          List all suite keys and aliases
  node run-tests.js --help          Show this help message

${C.bold}SUITE KEYS${C.reset}
  ${C.cyan}vcn${C.reset}          B2B Virtual Account Payments   ${C.dim}POST /vpa/v1/cards/provisioning${C.reset}
  ${C.cyan}vpa${C.reset}          Full VPA Account Management    ${C.dim}/vpa/v1/* (28 endpoints)${C.reset}
  ${C.cyan}bip${C.reset}          BIP & SIP Payment Flows        ${C.dim}/vpa/v1/paymentService/* (10 endpoints)${C.reset}
  ${C.cyan}sms${C.reset}          Visa Supplier Match Service    ${C.dim}POST /visasuppliermatchingservice/v1/search${C.reset}
  ${C.cyan}ai${C.reset}           AI Supplier Evaluation         ${C.dim}SDK-internal (SupplierMatcher)${C.reset}
  ${C.cyan}vpc${C.reset}          Visa B2B Payment Controls      ${C.dim}/vpc/v1/* (15 endpoints)${C.reset}
  ${C.cyan}ipc${C.reset}          IPC — Gen-AI Rules             ${C.dim}POST /vpc/v1/ipc/suggest + /apply${C.reset}
  ${C.cyan}settlement${C.reset}   Settlement                     ${C.dim}SDK-internal (SettlementService)${C.reset}

${C.bold}ALIASES${C.reset}
  bip-sip, sip   → bip
  scorer, matcher → ai
  settle          → settlement

${C.bold}EXAMPLES${C.reset}
  node run-tests.js                    # run all 8 suites
  node run-tests.js sms                # Visa Supplier Match only
  node run-tests.js vpa bip sms        # VPA + BIP/SIP + SMS
  node run-tests.js vcn ai settlement  # runs test-sdk.ts once (shared)
  node run-tests.js vpc ipc            # Payment Controls + Gen-AI

${C.bold}OUTPUT LEGEND${C.reset}
  ${C.green}LIVE nnn${C.reset}   Real Visa sandbox accepted the call (2xx)
  ${C.yellow}WARN nnn${C.reset}   Endpoint reached; business/payload validation error (400)
  ${C.magenta}MOCK${C.reset}       Blocked (401/404) — module needs Visa provisioning; mock shown

${C.bold}NOTES${C.reset}
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
    const note = s.file === 'test-sdk.ts' ? `${C.dim}(shares test-sdk.ts)${C.reset}` : '';
    console.log(`  ${C.cyan}${keys.padEnd(28)}${C.reset} ${s.label}  ${note}`);
  }
  console.log(`\n  ${'all'.padEnd(28)} Run every suite\n`);
  console.log(`  Example:  node run-tests.js vpa bip sms`);
  console.log(`  Example:  node run-tests.js vcn ai settlement  ${C.dim}(runs test-sdk.ts once)${C.reset}\n`);
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

  const seen  = new Set();
  const picks = [];
  for (const suite of SUITES) {
    const matched = suite.keys.some((k) => lower.includes(k));
    if (matched && !seen.has(suite.file)) {
      seen.add(suite.file);
      picks.push(suite);
    } else if (matched && seen.has(suite.file)) {
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

// ── Session intro card ────────────────────────────────────────────────────────

function printSessionCard(suite, current, total) {
  const ac = suite.accentColor || C.cyan;

  sleep(400);

  // Top border
  slowLine(boxTop(ac), 0);

  // Session header line
  const sessionTag = `${C.bold}${C.brightWhite}SESSION ${suite.sessionNum} of ${total}${C.reset}`;
  const sessionTagVisible = `SESSION ${suite.sessionNum} of ${total}`;
  const labelStr = `${C.bold}${ac}${suite.label}${C.reset}`;
  const labelVisible = suite.label;
  const headerPad = Math.max(0, W - sessionTagVisible.length - 2 - labelVisible.length - 3);
  const headerLine = ` ${sessionTag}   ${labelStr}${' '.repeat(headerPad)} `;
  process.stdout.write(`${ac}║${C.reset}${headerLine}${ac}║${C.reset}\n`);
  sleep(80);

  slowLine(boxDiv(ac), 80);

  // Tagline
  slowLine(boxEmpty(ac), 60);
  sleep(60);
  const taglineStr = `${C.italic}${C.brightWhite}${suite.tagline}${C.reset}`;
  process.stdout.write(boxRow(`  ${taglineStr}`, ac) + '\n');
  sleep(120);
  slowLine(boxEmpty(ac), 60);

  // Description lines typed out
  for (const line of suite.description) {
    sleep(60);
    const dimLine = `${C.dim}${line}${C.reset}`;
    process.stdout.write(boxRow(`  ${dimLine}`, ac) + '\n');
    sleep(80);
  }

  sleep(100);
  slowLine(boxEmpty(ac), 40);
  slowLine(boxDiv(ac), 40);
  sleep(100);

  // Highlights
  const hlHeader = `${C.bold}${C.brightWhite}  KEY CAPABILITIES${C.reset}`;
  process.stdout.write(boxRow(hlHeader, ac) + '\n');
  sleep(80);
  slowLine(boxEmpty(ac), 40);

  for (const hl of suite.highlights) {
    sleep(100);
    const bullet = `${ac}  ◈  ${C.reset}${C.brightWhite}${hl}${C.reset}`;
    process.stdout.write(boxRow(bullet, ac) + '\n');
    sleep(120);
  }

  sleep(80);
  slowLine(boxEmpty(ac), 40);
  slowLine(boxBot(ac), 60);
  sleep(300);
  console.log('');
}

// ── Running separator ─────────────────────────────────────────────────────────

function printRunningHeader(suite) {
  const ac = suite.accentColor || C.cyan;
  sleep(100);
  const arrow = `${C.bold}${ac}▶  EXECUTING${C.reset}`;
  const labelPart = `${C.bold}${C.brightWhite}${suite.label}${C.reset}`;
  console.log(`\n  ${arrow}   ${labelPart}`);
  const dots = `${C.dim}${'·'.repeat(70)}${C.reset}`;
  console.log(`  ${dots}\n`);
  sleep(200);
}

function printRunningFooter(suite, ms, passed) {
  const ac = suite.accentColor || C.cyan;
  const timeStr = `${(ms / 1000).toFixed(2)}s`;
  const statusColor = passed ? C.brightGreen : C.brightRed;
  const statusMark  = passed ? '✔  SUITE PASSED' : '✘  SUITE FAILED';
  const dots = `${C.dim}${'·'.repeat(70)}${C.reset}`;
  console.log(`\n  ${dots}`);
  sleep(120);
  console.log(`  ${C.bold}${statusColor}${statusMark}${C.reset}   ${C.dim}${suite.label}${C.reset}   ${C.dim}(${timeStr})${C.reset}`);
  sleep(150);
  console.log('');
}

// ── Countdown before starting a suite ────────────────────────────────────────

function countdown(label) {
  process.stdout.write(`  ${C.dim}Starting ${label} in ...${C.reset}`);
  for (let i = 3; i >= 1; i--) {
    sleep(600);
    process.stdout.write(` ${C.bold}${C.brightYellow}${i}${C.reset}`);
  }
  sleep(500);
  process.stdout.write(` ${C.bold}${C.brightGreen}go!${C.reset}\n\n`);
  sleep(300);
}

// ── Run a single suite ────────────────────────────────────────────────────────

function run(suite) {
  const result = spawnSync(suite.cmd, suite.args, {
    stdio: 'inherit',
    cwd:   ROOT,
    shell: os.platform() === 'win32',
    env:   process.env,
  });
  return result.status ?? 1;
}

// ── Grand intro splash ────────────────────────────────────────────────────────

function printGrandIntro(total) {
  sleep(200);
  const W2 = 78;
  const topLine    = `${C.bold}${C.brightBlue}╔${'═'.repeat(W2)}╗${C.reset}`;
  const botLine    = `${C.bold}${C.brightBlue}╚${'═'.repeat(W2)}╝${C.reset}`;
  const divLine    = `${C.bold}${C.brightBlue}╠${'═'.repeat(W2)}╣${C.reset}`;
  const emptyRow   = () => boxRow('', C.brightBlue);

  const mkRow = (text) => {
    const visible = text.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, W2 - visible.length - 2);
    return `${C.bold}${C.brightBlue}║${C.reset} ${text}${' '.repeat(pad)} ${C.bold}${C.brightBlue}║${C.reset}`;
  };

  console.log('');
  slowLine(topLine, 0);
  slowLine(mkRow(''), 60);

  const title = `${C.bold}${C.brightWhite}@visa-gov/sdk${C.reset}${C.brightBlue}  —  ${C.reset}${C.bold}${C.brightCyan}Full Platform Demonstration${C.reset}`;
  process.stdout.write(mkRow(`        ${title}`) + '\n');
  sleep(100);

  const subtitle = `${C.dim}Live Visa sandbox · mTLS authenticated · ${total} test suites${C.reset}`;
  process.stdout.write(mkRow(`        ${subtitle}`) + '\n');
  sleep(80);
  slowLine(mkRow(''), 60);
  slowLine(divLine, 80);
  sleep(80);
  slowLine(mkRow(''), 40);

  const lines = [
    `${C.brightWhite}This session exercises every major surface of the Visa GovPay SDK${C.reset}`,
    `${C.dim}against the Visa developer sandbox. Each module is introduced with a${C.reset}`,
    `${C.dim}summary of what it does and why it matters, followed by a live run.${C.reset}`,
  ];
  for (const l of lines) {
    sleep(100);
    process.stdout.write(mkRow(`  ${l}`) + '\n');
  }

  sleep(80);
  slowLine(mkRow(''), 40);
  slowLine(divLine, 80);
  sleep(80);
  slowLine(mkRow(''), 40);

  const legend = [
    `${C.brightGreen}LIVE nnn${C.reset}  ${C.dim}Real Visa sandbox returned 2xx — authentic API call${C.reset}`,
    `${C.brightYellow}WARN nnn${C.reset}  ${C.dim}Endpoint reached — payload / business validation error${C.reset}`,
    `${C.brightMagenta}MOCK    ${C.reset}  ${C.dim}Module not yet provisioned — realistic mock response shown${C.reset}`,
  ];

  const legendHeader = `${C.bold}${C.brightWhite}  OUTPUT LEGEND${C.reset}`;
  process.stdout.write(mkRow(legendHeader) + '\n');
  sleep(60);
  slowLine(mkRow(''), 30);
  for (const l of legend) {
    sleep(80);
    process.stdout.write(mkRow(`    ${l}`) + '\n');
  }

  sleep(60);
  slowLine(mkRow(''), 40);
  slowLine(botLine, 60);
  sleep(500);
  console.log('');
}

// ── Final results table ───────────────────────────────────────────────────────

function printResultsTable(results, totalMs) {
  sleep(400);
  banner('@visa-gov/sdk — Test Results');
  sleep(200);

  console.log('');
  const colW = 42;
  console.log(`  ${C.bold}${'Suite'.padEnd(colW)} ${'Result'.padEnd(14)} ${'Time'}${C.reset}`);
  console.log(`  ${C.dim}${'─'.repeat(72)}${C.reset}`);

  let allPassed = true;
  for (const r of results) {
    sleep(120);
    let marker, color;
    if (r.status === 'pass')         { marker = '✔  PASS';    color = C.brightGreen; }
    else if (r.status === 'covered') { marker = '~  shared';  color = C.dim;         }
    else                             { marker = '✘  FAIL';    color = C.brightRed;   allPassed = false; }

    const time = r.ms > 0 ? `${(r.ms / 1000).toFixed(1)}s` : '—';
    console.log(`  ${r.label.padEnd(colW)} ${color}${marker.padEnd(14)}${C.reset} ${C.dim}${time}${C.reset}`);
  }

  sleep(200);
  console.log(`\n  ${C.dim}${'─'.repeat(72)}${C.reset}`);

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  sleep(100);
  console.log(`  ${C.dim}Total time${C.reset} : ${C.brightWhite}${(totalMs / 1000).toFixed(1)}s${C.reset}`);
  sleep(80);
  console.log(`  ${C.dim}Passed    ${C.reset} : ${C.brightGreen}${C.bold}${passed}${C.reset}`);
  if (failed > 0) {
    sleep(80);
    console.log(`  ${C.dim}Failed    ${C.reset} : ${C.brightRed}${C.bold}${failed}${C.reset}`);
  }
  console.log('');
  sleep(200);

  if (allPassed) {
    console.log(`${C.brightGreen}${C.bold}  ✔  All suites passed.${C.reset}\n`);
  } else {
    console.log(`${C.brightRed}${C.bold}  ✘  Some suites failed — check output above.${C.reset}\n`);
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const args   = process.argv.slice(2);
  const suites = resolve(args);
  const runAll = args.length === 0 || args.includes('all');
  const total  = suites.filter((s) => !s._skip).length;

  // Outer banner (logo)
  printBanner(
    runAll
      ? 'Full Test Suite'
      : `Test Suite: ${args.join(', ')}`,
  );

  sleep(300);

  // Grand intro splash
  printGrandIntro(total);

  sleep(300);
  console.log(`  ${C.dim}Suites to run : ${C.reset}${C.bold}${C.brightWhite}${total}${C.reset}`);
  console.log(`  ${C.dim}Started at    : ${C.reset}${C.dim}${new Date().toISOString()}${C.reset}\n`);
  sleep(600);

  const results  = [];
  const startAll = Date.now();
  let   current  = 0;

  for (const suite of suites) {
    if (suite._skip) {
      results.push({ label: suite.label, status: 'covered', exitCode: 0, ms: 0 });
      continue;
    }

    current++;

    // Session intro card
    printSessionCard(suite, current, total);

    // Countdown
    countdown(suite.label);

    // Running header
    printRunningHeader(suite);

    // Execute
    const t0       = Date.now();
    const exitCode = run(suite);
    const ms       = Date.now() - t0;

    // Footer
    printRunningFooter(suite, ms, exitCode === 0);

    results.push({ label: suite.label, status: exitCode === 0 ? 'pass' : 'fail', exitCode, ms });

    // Breathing room between suites
    if (current < total) {
      sleep(600);
    }
  }

  const totalMs = Date.now() - startAll;
  printResultsTable(results, totalMs);
}

main();
