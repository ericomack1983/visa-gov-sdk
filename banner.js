'use strict';

/**
 * @visa-gov/sdk — welcome banner
 * Import and call printBanner(label) at the top of any script.
 */

const { version } = require('./package.json');

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  white:  '\x1b[97m',
  yellow: '\x1b[33m',
};

const LOGO = [
  '  ██╗   ██╗██╗███████╗ █████╗',
  '  ██║   ██║██║██╔════╝██╔══██╗',
  '  ╚██╗ ██╔╝██║███████╗███████║',
  '   ╚████╔╝ ██║╚════██║██╔══██║',
  '    ╚██╔╝  ██║███████║██║  ██║',
  '     ╚═╝   ╚═╝╚══════╝╚═╝  ╚═╝',
];

function printBanner(label) {
  const now  = new Date();
  const ts   = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const env  = process.env.VISA_ENV ?? 'sandbox';
  const node = process.version;

  const W = 56;
  const line = `${C.dim}${'─'.repeat(W)}${C.reset}`;

  console.log('');
  for (const row of LOGO) {
    console.log(`${C.blue}${C.bold}${row}${C.reset}`);
  }
  console.log('');
  console.log(line);
  console.log(`  ${C.bold}${C.white}Visa GovPay SDK${C.reset}  ${C.dim}v${version}${C.reset}`);
  if (label) {
    console.log(`  ${C.cyan}${label}${C.reset}`);
  }
  console.log(line);
  console.log(`  ${C.dim}env   ${C.reset}${C.yellow}${env}${C.reset}`);
  console.log(`  ${C.dim}node  ${C.reset}${node}`);
  console.log(`  ${C.dim}time  ${C.reset}${ts}`);
  console.log(line);
  console.log('');
}

module.exports = { printBanner };
