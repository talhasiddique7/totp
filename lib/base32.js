// SPDX-License-Identifier: GPL-3.0-or-later
// Base32 Decoder — RFC 4648 compliant
// No external dependencies

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_LOOKUP = new Map();
for (let i = 0; i < BASE32_ALPHABET.length; i++) {
    BASE32_LOOKUP.set(BASE32_ALPHABET[i], i);
}

/**
 * Normalize a Base32 string: uppercase, strip spaces, hyphens, and padding.
 * @param {string} input - Raw Base32 string from user input or URI
 * @returns {string} Normalized Base32 string
 */
export function normalize(input) {
    return input
        .toUpperCase()
        .replace(/[\s\-=]/g, '');
}

/**
 * Validate a normalized Base32 string.
 * @param {string} input - Normalized Base32 string
 * @returns {boolean} True if all characters are valid Base32
 */
export function isValid(input) {
    const normalized = normalize(input);
    if (normalized.length === 0) return false;
    for (const ch of normalized) {
        if (!BASE32_LOOKUP.has(ch)) return false;
    }
    return true;
}

/**
 * Decode a Base32-encoded string to a Uint8Array.
 *
 * Implements RFC 4648 §6 decoding:
 *   - Each Base32 character encodes 5 bits
 *   - 8 characters → 5 bytes
 *   - Padding is optional and stripped
 *
 * @param {string} input - Base32 encoded string (case-insensitive, spaces/hyphens allowed)
 * @returns {Uint8Array} Decoded binary data
 * @throws {Error} If input contains invalid Base32 characters
 */
export function decode(input) {
    const normalized = normalize(input);

    if (normalized.length === 0) {
        return new Uint8Array(0);
    }

    // Validate characters
    for (const ch of normalized) {
        if (!BASE32_LOOKUP.has(ch)) {
            throw new Error(`Invalid Base32 character: '${ch}'`);
        }
    }

    // Each character encodes 5 bits.
    // Output length = floor(len * 5 / 8)
    const outputLength = Math.floor(normalized.length * 5 / 8);
    const result = new Uint8Array(outputLength);

    let buffer = 0;   // Bit accumulator
    let bitsLeft = 0;  // Number of bits in accumulator
    let index = 0;     // Output byte index

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
