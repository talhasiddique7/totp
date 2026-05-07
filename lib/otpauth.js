// SPDX-License-Identifier: GPL-3.0-or-later
// otpauth:// URI Parser
// Reference: https://github.com/google/google-authenticator/wiki/Key-Uri-Format

import { isValid as isValidBase32 } from './base32.js';

/**
 * Parse an otpauth:// URI into an account configuration object.
 *
 * URI format:
 *   otpauth://totp/LABEL?secret=BASE32SECRET&issuer=ISSUER&algorithm=SHA1&digits=6&period=30
 *
 * Label format (both supported):
 *   - "issuer:account"  (e.g., "GitHub:octocat@github.com")
 *   - "account"         (e.g., "octocat@github.com")
 *
 * All query parameters are optional except `secret`.
 *
 * @param {string} uri - otpauth:// URI string
 * @returns {object} Parsed account configuration
 * @throws {Error} If URI is malformed or missing required fields
 */
export function parseOtpauthUri(uri) {
    if (!uri || typeof uri !== 'string') {
        throw new Error('URI must be a non-empty string');
    }

    const trimmed = uri.trim();

    // Validate scheme
    if (!trimmed.startsWith('otpauth://')) {
        throw new Error('URI must start with "otpauth://"');
    }

    // Remove scheme
    const rest = trimmed.substring('otpauth://'.length);

    // Extract type (totp or hotp)
    const slashIndex = rest.indexOf('/');
    if (slashIndex === -1) {
        throw new Error('URI missing type and label (expected otpauth://totp/LABEL?...)');
    }

    const type = rest.substring(0, slashIndex).toLowerCase();
    if (type !== 'totp' && type !== 'hotp') {
        throw new Error(`Unsupported OTP type: "${type}". Only "totp" and "hotp" are supported.`);
    }

    // Extract label and query string
    const afterType = rest.substring(slashIndex + 1);
    const queryIndex = afterType.indexOf('?');

    let rawLabel;
    let queryString = '';

    if (queryIndex === -1) {
        rawLabel = afterType;
    } else {
        rawLabel = afterType.substring(0, queryIndex);
        queryString = afterType.substring(queryIndex + 1);
    }

    // Decode label (URI-encoded)
    rawLabel = decodeURIComponent(rawLabel);

    // Parse label: "issuer:account" or just "account"
    let labelIssuer = '';
    let labelAccount = rawLabel;

    const colonIndex = rawLabel.indexOf(':');
    if (colonIndex !== -1) {
        labelIssuer = rawLabel.substring(0, colonIndex).trim();
        labelAccount = rawLabel.substring(colonIndex + 1).trim();
    }

    // Parse query parameters
    const params = new Map();
    if (queryString) {
        for (const pair of queryString.split('&')) {
            const eqIndex = pair.indexOf('=');
            if (eqIndex === -1) continue;
            const key = decodeURIComponent(pair.substring(0, eqIndex)).toLowerCase();
            const value = decodeURIComponent(pair.substring(eqIndex + 1));
            params.set(key, value);
        }
    }

    // Extract secret (required)
    const secret = params.get('secret');
    if (!secret) {
        throw new Error('URI missing required "secret" parameter');
    }

    // Validate secret is valid Base32
    if (!isValidBase32(secret)) {
        throw new Error('Invalid Base32 secret in URI');
    }

    // Extract issuer — query param takes precedence over label prefix
    const issuer = params.get('issuer') || labelIssuer || '';

    // Extract algorithm with validation
    const rawAlgorithm = (params.get('algorithm') || 'SHA1').toUpperCase();
    const validAlgorithms = ['SHA1', 'SHA256', 'SHA512'];
    if (!validAlgorithms.includes(rawAlgorithm)) {
        throw new Error(`Unsupported algorithm: "${rawAlgorithm}". Use SHA1, SHA256, or SHA512.`);
    }

    // Extract digits with validation
    const rawDigits = parseInt(params.get('digits') || '6', 10);
    if (![6, 7, 8].includes(rawDigits)) {
        throw new Error(`Invalid digits value: ${rawDigits}. Must be 6, 7, or 8.`);
    }

    // Extract period with validation
    const rawPeriod = parseInt(params.get('period') || '30', 10);
    if (![30, 60].includes(rawPeriod)) {
        throw new Error(`Invalid period value: ${rawPeriod}. Must be 30 or 60.`);
    }

    // Extract counter (for HOTP only)
    const counter = type === 'hotp' ? parseInt(params.get('counter') || '0', 10) : undefined;

    return {
        type,
        label: labelAccount,
        issuer,
        secret: secret.toUpperCase().replace(/[\s\-]/g, ''),
        algorithm: rawAlgorithm,
        digits: rawDigits,
        period: rawPeriod,
        counter,
    };
}

/**
 * Build an otpauth:// URI from account parameters.
 *
 * @param {object} account - Account configuration
 * @param {string} account.label - Account label/email
 * @param {string} account.issuer - Service name
 * @param {string} account.secret - Base32-encoded secret
 * @param {string} [account.algorithm='SHA1'] - Hash algorithm
 * @param {number} [account.digits=6] - Number of digits
 * @param {number} [account.period=30] - Time period in seconds
 * @returns {string} otpauth:// URI
 */
export function buildOtpauthUri(account) {
    const {
        label,
        issuer,
        secret,
        algorithm = 'SHA1',
        digits = 6,
        period = 30,
    } = account;

    const encodedLabel = issuer
        ? `${encodeURIComponent(issuer)}:${encodeURIComponent(label)}`
        : encodeURIComponent(label);

    const params = new URLSearchParams();
    params.set('secret', secret);
    if (issuer) params.set('issuer', issuer);
    if (algorithm !== 'SHA1') params.set('algorithm', algorithm);
    if (digits !== 6) params.set('digits', digits.toString());
    if (period !== 30) params.set('period', period.toString());

    return `otpauth://totp/${encodedLabel}?${params.toString()}`;
}
