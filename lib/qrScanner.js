// SPDX-License-Identifier: GPL-3.0-or-later
// QR Code Scanner — zbar subprocess wrapper
// Spawns zbarimg/zbarcam for QR code detection

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const TEMP_QR_PATH = '/tmp/totp-qr-capture.png';

/**
 * Check if a program is available on the system.
 *
 * @param {string} program - Program name to find
 * @returns {boolean} True if available
 */
export function isProgramAvailable(program) {
    return GLib.find_program_in_path(program) !== null;
}

/**
 * Check all required dependencies for QR scanning.
 *
 * @returns {object} Dependency status
 */
export function checkDependencies() {
    return {
        zbarimg: isProgramAvailable('zbarimg'),
        zbarcam: isProgramAvailable('zbarcam'),
        gnomeScreenshot: isProgramAvailable('gnome-screenshot'),
        // grim is the Wayland alternative
        grim: isProgramAvailable('grim'),
        slurp: isProgramAvailable('slurp'),
        hasScreenCapture: isProgramAvailable('gnome-screenshot') ||
                          (isProgramAvailable('grim') && isProgramAvailable('slurp')),
        hasCamera: isProgramAvailable('zbarcam'),
    };
}

/**
 * Get install instructions for missing dependencies.
 *
 * @returns {string} Installation command string
 */
export function getInstallInstructions() {
    const deps = checkDependencies();
    const missing = [];

    if (!deps.zbarimg) missing.push('zbar-tools');
    if (!deps.gnomeScreenshot && !deps.grim) missing.push('gnome-screenshot');

    if (missing.length === 0) return '';

    // Detect package manager
    if (isProgramAvailable('apt')) {
        return `sudo apt install ${missing.join(' ')}`;
    } else if (isProgramAvailable('dnf')) {
        return `sudo dnf install ${missing.join(' ')}`;
    } else if (isProgramAvailable('pacman')) {
        return `sudo pacman -S ${missing.join(' ')}`;
    }

    return `Install: ${missing.join(', ')}`;
}

/**
 * Run a subprocess and capture stdout.
 *
 * @param {Array<string>} argv - Command and arguments
 * @param {number} [timeoutMs=15000] - Timeout in milliseconds
 * @returns {Promise<string>} stdout output
 */
function runSubprocess(argv, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        try {
            const proc = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            // Set up timeout
            let timedOut = false;
            const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
                timedOut = true;
                try {
                    proc.force_exit();
                } catch (e) {
                    // Process may have already exited
                }
                return GLib.SOURCE_REMOVE;
            });

            proc.communicate_utf8_async(null, null, (source, result) => {
                GLib.source_remove(timeoutId);

                if (timedOut) {
                    reject(new Error('QR scan timed out'));
                    return;
                }

                try {
                    const [, stdout, stderr] = proc.communicate_utf8_finish(result);
                    const exitCode = proc.get_exit_status();

                    if (exitCode !== 0 && (!stdout || stdout.trim() === '')) {
                        reject(new Error(stderr || `Process exited with code ${exitCode}`));
                        return;
                    }

                    resolve(stdout ? stdout.trim() : '');
                } catch (e) {
                    reject(new Error(`Subprocess failed: ${e.message}`));
                }
            });
        } catch (e) {
            reject(new Error(`Failed to launch subprocess: ${e.message}`));
        }
    });
}

/**
 * Capture a screen area and scan for QR codes.
 *
 * Flow:
 *   1. Launch gnome-screenshot (or grim+slurp) for area selection
 *   2. Run zbarimg on the captured image
 *   3. Return decoded URI
 *   4. Clean up temp file
 *
 * @returns {Promise<string>} Decoded QR code content (typically otpauth:// URI)
 */
export async function scanScreenArea() {
    const deps = checkDependencies();

    if (!deps.zbarimg) {
        throw new Error('zbarimg not found. Install zbar-tools.');
    }

    if (!deps.hasScreenCapture) {
        throw new Error('No screen capture tool found. Install gnome-screenshot.');
    }

    // Clean up any previous temp file
    _cleanupTempFile();

    try {
        // Step 1: Capture screen area
        if (deps.grim && deps.slurp) {
            // Wayland: use slurp for selection, grim for capture
            const geometry = await runSubprocess(['slurp'], 30000);
            await runSubprocess(['grim', '-g', geometry, TEMP_QR_PATH], 5000);
        } else {
            // X11/XWayland: gnome-screenshot area capture
            await runSubprocess(
                ['gnome-screenshot', '-a', '-f', TEMP_QR_PATH],
                30000  // Longer timeout for user selection
            );
        }

        // Verify capture file exists
        const captureFile = Gio.File.new_for_path(TEMP_QR_PATH);
        if (!captureFile.query_exists(null)) {
            throw new Error('Screen capture was cancelled or failed');
        }

        // Step 2: Decode QR code
        const decoded = await runSubprocess(
            ['zbarimg', '-q', '--raw', TEMP_QR_PATH],
            10000
        );

        if (!decoded) {
            throw new Error('No QR code found in the captured area');
        }

        return decoded;
    } finally {
        _cleanupTempFile();
    }
}

/**
 * Scan QR code from webcam.
 *
 * Spawns zbarcam which opens a camera preview window.
 * The process exits after the first successful scan.
 *
 * @returns {Promise<string>} Decoded QR code content
 */
export async function scanCamera() {
    const deps = checkDependencies();

    if (!deps.hasCamera) {
        throw new Error('zbarcam not found. Install zbar-tools.');
    }

    const decoded = await runSubprocess(
        ['zbarcam', '--raw', '--prescale=640x480', '-q', '--nodisplay'],
        30000  // 30 second timeout for camera scanning
    );

    if (!decoded) {
        throw new Error('No QR code detected from camera');
    }

    return decoded;
}

/**
 * Decode a QR code from an existing image file.
 *
 * @param {string} filePath - Absolute path to image file
 * @returns {Promise<string>} Decoded QR content
 */
export async function scanFile(filePath) {
    if (!isProgramAvailable('zbarimg')) {
        throw new Error('zbarimg not found. Install zbar-tools.');
    }

    const decoded = await runSubprocess(
        ['zbarimg', '-q', '--raw', filePath],
        10000
    );

    if (!decoded) {
        throw new Error('No QR code found in the image');
    }

    return decoded;
}

/**
 * Clean up temporary capture file.
 * @private
 */
function _cleanupTempFile() {
    try {
        const file = Gio.File.new_for_path(TEMP_QR_PATH);
        if (file.query_exists(null)) {
            file.delete(null);
        }
    } catch (e) {
        // Ignore cleanup errors
    }
}
