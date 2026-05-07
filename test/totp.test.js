// SPDX-License-Identifier: GPL-3.0-or-later
// TOTP Algorithm Unit Tests
// Run with: gjs -m test/totp.test.js
// Or validate against: oathtool --totp -b <secret>

import GLib from 'gi://GLib';

// ─── We import our modules relatively ───
// When running standalone with gjs, we need to adjust paths.
// For testing, we use direct implementations.

// ══════════════════════════════════════
// Base32 Decoder Tests
// ══════════════════════════════════════

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_LOOKUP = new Map();
for (let i = 0; i < BASE32_ALPHABET.length; i++) {
    BASE32_LOOKUP.set(BASE32_ALPHABET[i], i);
}

function base32Decode(input) {
    const normalized = input.toUpperCase().replace(/[\s\-=]/g, '');
    if (normalized.length === 0) return new Uint8Array(0);

    for (const ch of normalized) {
        if (!BASE32_LOOKUP.has(ch)) throw new Error(`Invalid Base32 char: '${ch}'`);
    }

    const outputLength = Math.floor(normalized.length * 5 / 8);
    const result = new Uint8Array(outputLength);
    let buffer = 0, bitsLeft = 0, index = 0;

    for (const ch of normalized) {
        buffer = (buffer << 5) | BASE32_LOOKUP.get(ch);
        bitsLeft += 5;
        if (bitsLeft >= 8) {
            bitsLeft -= 8;
            result[index++] = (buffer >>> bitsLeft) & 0xff;
        }
    }
    return result;
}

// ══════════════════════════════════════
// HOTP Implementation (inline for testing)
// ══════════════════════════════════════

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

function counterToBytes(counter) {
    const bytes = new Uint8Array(8);
    let value = counter;
    for (let i = 7; i >= 0; i--) {
        bytes[i] = value & 0xff;
        value = Math.floor(value / 256);
    }
    return bytes;
}

function generateHOTP(secret, counter, algorithm = 'SHA1', digits = 6) {
    const ALGORITHMS = {
        'SHA1': GLib.ChecksumType.SHA1,
        'SHA256': GLib.ChecksumType.SHA256,
        'SHA512': GLib.ChecksumType.SHA512,
    };

    const keyBytes = base32Decode(secret);
    const counterBytes = counterToBytes(counter);
    const hmacHex = GLib.compute_hmac_for_data(ALGORITHMS[algorithm], keyBytes, counterBytes);
    const hmacBytes = hexToBytes(hmacHex);

    const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
    const binCode =
        ((hmacBytes[offset] & 0x7f) << 24) |
        ((hmacBytes[offset + 1] & 0xff) << 16) |
        ((hmacBytes[offset + 2] & 0xff) << 8) |
        (hmacBytes[offset + 3] & 0xff);

    const modulus = Math.pow(10, digits);
    const otp = binCode % modulus;
    return otp.toString().padStart(digits, '0');
}

function generateTOTP(secret, time, algorithm = 'SHA1', digits = 6, period = 30) {
    const counter = Math.floor(time / period);
    return generateHOTP(secret, counter, algorithm, digits);
}

// ══════════════════════════════════════
// Test Runner
// ══════════════════════════════════════

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
    total++;
    if (condition) {
        passed++;
        print(`  ✓ ${message}`);
    } else {
        failed++;
        print(`  ✗ ${message}`);
    }
}

function assertEqual(actual, expected, message) {
    total++;
    if (actual === expected) {
        passed++;
        print(`  ✓ ${message}`);
    } else {
        failed++;
        print(`  ✗ ${message}: expected "${expected}", got "${actual}"`);
    }
}

// ══════════════════════════════════════
// Test: Base32 Decoding
// ══════════════════════════════════════

print('\n━━━ Base32 Decoding ━━━');

// RFC 4648 test vectors
const b32_hello = base32Decode('JBSWY3DPEHPK3PXP');
assert(b32_hello.length > 0, 'Decodes non-empty Base32 string');

// "Hello!" = JBSWY3DPEE (verified with: echo -n "Hello!" | base32)
const b32_test = base32Decode('JBSWY3DPEE======');
const decoded_str = new TextDecoder().decode(b32_test);
assertEqual(decoded_str, 'Hello!', 'Decodes "JBSWY3DPEE" to "Hello!"');

// Case insensitive
const b32_lower = base32Decode('jbswy3dpee');
const decoded_lower = new TextDecoder().decode(b32_lower);
assertEqual(decoded_lower, 'Hello!', 'Case-insensitive decoding');

// Spaces and hyphens stripped
const b32_spaced = base32Decode('JBSW Y3DP EE');
const decoded_spaced = new TextDecoder().decode(b32_spaced);
assertEqual(decoded_spaced, 'Hello!', 'Strips spaces from input');

const b32_dashed = base32Decode('JBSW-Y3DP-EE');
const decoded_dashed = new TextDecoder().decode(b32_dashed);
assertEqual(decoded_dashed, 'Hello!', 'Strips hyphens from input');

// Empty input
const b32_empty = base32Decode('');
assertEqual(b32_empty.length, 0, 'Empty input returns empty array');

// ══════════════════════════════════════
// Test: HOTP (RFC 4226 Appendix D)
// ══════════════════════════════════════

print('\n━━━ HOTP (RFC 4226) ━━━');

// RFC 4226 test secret: "12345678901234567890" = Base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

// RFC 4226 Appendix D: HOTP test values for secret "12345678901234567890"
const HOTP_TEST_VECTORS = [
    { counter: 0, expected: '755224' },
    { counter: 1, expected: '287082' },
    { counter: 2, expected: '359152' },
    { counter: 3, expected: '969429' },
    { counter: 4, expected: '338314' },
    { counter: 5, expected: '254676' },
    { counter: 6, expected: '287922' },
    { counter: 7, expected: '162583' },
    { counter: 8, expected: '399871' },
    { counter: 9, expected: '520489' },
];

for (const { counter, expected } of HOTP_TEST_VECTORS) {
    const code = generateHOTP(RFC_SECRET, counter);
    assertEqual(code, expected, `HOTP counter=${counter}`);
}

// ══════════════════════════════════════
// Test: TOTP (RFC 6238)
// ══════════════════════════════════════

print('\n━━━ TOTP (RFC 6238) ━━━');

// RFC 6238 test vectors use different secrets per algorithm:
// SHA1:   "12345678901234567890"                    (20 bytes)
// SHA256: "12345678901234567890123456789012"          (32 bytes)
// SHA512: "1234567890123456789012345678901234567890123456789012345678901234" (64 bytes)

const SHA1_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
// SHA256 secret: "12345678901234567890123456789012" (32 bytes)
// Verified with: echo -n "12345678901234567890123456789012" | base32
const SHA256_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA';
// SHA512 secret: "1234567890...1234" (64 bytes)
// Verified with: echo -n "1234567890123456789012345678901234567890123456789012345678901234" | base32
const SHA512_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA';

// RFC 6238 Table 1 — SHA1 test vectors
const TOTP_SHA1_VECTORS = [
    { time: 59,          expected: '287082' },
    { time: 1111111109,  expected: '081804' },
    { time: 1111111111,  expected: '050471' },
    { time: 1234567890,  expected: '005924' },
    { time: 2000000000,  expected: '279037' },
];

for (const { time, expected } of TOTP_SHA1_VECTORS) {
    const code = generateTOTP(SHA1_SECRET, time, 'SHA1', 6, 30);
    assertEqual(code, expected, `TOTP SHA1 time=${time}`);
}

// RFC 6238 Table 1 — SHA256 test vectors (8 digits)
const TOTP_SHA256_VECTORS = [
    { time: 59,          expected: '46119246' },
    { time: 1111111109,  expected: '68084774' },
    { time: 1111111111,  expected: '67062674' },
    { time: 1234567890,  expected: '91819424' },
    { time: 2000000000,  expected: '90698825' },
];

for (const { time, expected } of TOTP_SHA256_VECTORS) {
    const code = generateTOTP(SHA256_SECRET, time, 'SHA256', 8, 30);
    assertEqual(code, expected, `TOTP SHA256 time=${time} (8 digits)`);
}

// RFC 6238 Table 1 — SHA512 test vectors (8 digits)
const TOTP_SHA512_VECTORS = [
    { time: 59,          expected: '90693936' },
    { time: 1111111109,  expected: '25091201' },
    { time: 1111111111,  expected: '99943326' },
    { time: 1234567890,  expected: '93441116' },
    { time: 2000000000,  expected: '38618901' },
];

for (const { time, expected } of TOTP_SHA512_VECTORS) {
    const code = generateTOTP(SHA512_SECRET, time, 'SHA512', 8, 30);
    assertEqual(code, expected, `TOTP SHA512 time=${time} (8 digits)`);
}

// ══════════════════════════════════════
// Test: 60-second period
// ══════════════════════════════════════

print('\n━━━ TOTP 60s Period ━━━');

// With 60s period, counter at time=59 should be 0 (same as 30s counter=1)
const code_60s = generateTOTP(SHA1_SECRET, 59, 'SHA1', 6, 60);
assert(code_60s.length === 6, 'Generates 6-digit code with 60s period');
// counter = floor(59/60) = 0, same as HOTP counter 0
assertEqual(code_60s, '755224', 'TOTP 60s period at time=59 (counter=0)');

// ══════════════════════════════════════
// Test: 7 and 8 digit codes
// ══════════════════════════════════════

print('\n━━━ Digit Variations ━━━');

const code_7 = generateHOTP(RFC_SECRET, 0, 'SHA1', 7);
assertEqual(code_7.length, 7, '7-digit code has correct length');

const code_8 = generateHOTP(RFC_SECRET, 0, 'SHA1', 8);
assertEqual(code_8.length, 8, '8-digit code has correct length');

// ══════════════════════════════════════
// Test: Practical TOTP with common secret
// ══════════════════════════════════════

print('\n━━━ Practical TOTP ━━━');

// Common test secret used by many authenticator apps
const PRACTICAL_SECRET = 'JBSWY3DPEHPK3PXP';
const now = Math.floor(GLib.get_real_time() / 1000000);
const code_now = generateTOTP(PRACTICAL_SECRET, now);
assertEqual(code_now.length, 6, 'Current TOTP generates 6-digit code');
assert(/^\d{6}$/.test(code_now), `Current TOTP is numeric: ${code_now}`);

// Verify same code within same 30s window
const code_same_window = generateTOTP(PRACTICAL_SECRET, now);
assertEqual(code_same_window, code_now, 'Same time window produces same code');

// ══════════════════════════════════════
// Results
// ══════════════════════════════════════

print('\n═══════════════════════════════');
print(`  Results: ${passed}/${total} passed, ${failed} failed`);
if (failed === 0) {
    print('  ✅ All tests passed!');
} else {
    print('  ❌ Some tests failed!');
}
print('═══════════════════════════════\n');

// Exit with appropriate code
if (failed > 0) {
    // Use a non-zero exit to signal failure
    imports.system.exit(1);
}
