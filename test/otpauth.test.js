// SPDX-License-Identifier: GPL-3.0-or-later
// otpauth:// URI parser and builder tests
// Run with: gjs -m test/otpauth.test.js

import { buildOtpauthUri, parseOtpauthUri } from '../lib/otpauth.js';

let passed = 0;
let failed = 0;
let total = 0;

function assertEqual(actual, expected, message) {
    total++;
    if (actual === expected) {
        passed++;
        print(`  OK ${message}`);
    } else {
        failed++;
        print(`  FAIL ${message}: expected "${expected}", got "${actual}"`);
    }
}

function assertThrows(fn, message) {
    total++;
    try {
        fn();
        failed++;
        print(`  FAIL ${message}: expected an error`);
    } catch (e) {
        passed++;
        print(`  OK ${message}`);
    }
}

print('\n--- otpauth URI parsing ---');

const parsed = parseOtpauthUri(
    'otpauth://totp/GitHub:octocat%40github.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA256&digits=8&period=60'
);

assertEqual(parsed.type, 'totp', 'parses type');
assertEqual(parsed.issuer, 'GitHub', 'parses issuer');
assertEqual(parsed.label, 'octocat@github.com', 'parses label');
assertEqual(parsed.secret, 'JBSWY3DPEHPK3PXP', 'parses secret');
assertEqual(parsed.algorithm, 'SHA256', 'parses algorithm');
assertEqual(parsed.digits, 8, 'parses digits');
assertEqual(parsed.period, 60, 'parses period');

assertThrows(
    () => parseOtpauthUri('otpauth://totp/Bad?secret=not-valid!'),
    'rejects invalid Base32 secret'
);

print('\n--- otpauth URI building ---');

const built = buildOtpauthUri({
    label: 'octocat@github.com',
    issuer: 'GitHub',
    secret: 'JBSWY3DPEHPK3PXP',
    algorithm: 'SHA512',
    digits: 8,
    period: 60,
});
const roundTrip = parseOtpauthUri(built);

assertEqual(roundTrip.issuer, 'GitHub', 'round-trips issuer');
assertEqual(roundTrip.label, 'octocat@github.com', 'round-trips label');
assertEqual(roundTrip.secret, 'JBSWY3DPEHPK3PXP', 'round-trips secret');
assertEqual(roundTrip.algorithm, 'SHA512', 'round-trips algorithm');
assertEqual(roundTrip.digits, 8, 'round-trips digits');
assertEqual(roundTrip.period, 60, 'round-trips period');

print('\n------------------------------');
print(`  Results: ${passed}/${total} passed, ${failed} failed`);
print('------------------------------\n');

if (failed > 0) {
    imports.system.exit(1);
}
