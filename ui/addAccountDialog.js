// SPDX-License-Identifier: GPL-3.0-or-later
// Add Account Dialog — Modal dialog for adding TOTP accounts

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import * as AccountManager from '../lib/accountManager.js';
import * as QRScanner from '../lib/qrScanner.js';
import { parseOtpauthUri } from '../lib/otpauth.js';

export const AddAccountDialog = GObject.registerClass({
    Signals: {
        'account-added': {},
    },
}, class AddAccountDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({
            styleClass: 'totp-add-account-dialog',
            destroyOnClose: true,
        });

        this._currentTab = 'qr';
        this._buildUI();
    }

    _buildUI() {
        const content = new St.BoxLayout({
            vertical: true,
            styleClass: 'totp-dialog-content',
        });

        // Title
        const title = new St.Label({
            text: 'Add Account',
            styleClass: 'totp-dialog-title',
        });
        content.add_child(title);

        // Tab buttons
        const tabBox = new St.BoxLayout({
            styleClass: 'totp-dialog-tabs',
        });

        this._qrTabBtn = new St.Button({
            label: 'Scan QR',
            styleClass: 'totp-dialog-tab totp-dialog-tab-active',
        });
        this._qrTabBtn.connect('clicked', () => this._switchTab('qr'));
        tabBox.add_child(this._qrTabBtn);

        this._manualTabBtn = new St.Button({
            label: 'Manual Entry',
            styleClass: 'totp-dialog-tab',
        });
        this._manualTabBtn.connect('clicked', () => this._switchTab('manual'));
        tabBox.add_child(this._manualTabBtn);

        content.add_child(tabBox);

        // QR Tab content
        this._qrTab = new St.BoxLayout({
            vertical: true,
            styleClass: 'totp-tab-content',
        });

        this._scanBtn = new St.Button({
            label: 'Scan Screen Area',
            styleClass: 'totp-dialog-button totp-dialog-button-primary',
        });
        this._scanBtn.connect('clicked', () => this._onScanScreen());
        this._qrTab.add_child(this._scanBtn);

        this._cameraBtn = new St.Button({
            label: 'Scan with Camera',
            styleClass: 'totp-dialog-button',
        });
        this._cameraBtn.connect('clicked', () => this._onScanCamera());
        this._qrTab.add_child(this._cameraBtn);

        // File upload button
        this._fileBtn = new St.Button({
            label: 'Upload QR Code Image',
            styleClass: 'totp-dialog-button',
        });
        this._fileBtn.connect('clicked', () => this._onUploadFile());
        this._qrTab.add_child(this._fileBtn);

        // Check dependencies and show warning if needed
        const deps = QRScanner.checkDependencies();
        if (!deps.hasScreenCapture && !deps.hasCamera) {
            const warning = new St.Label({
                text: 'Warning: QR scanning requires zbar-tools and a screen capture tool.',
                styleClass: 'totp-dialog-warning',
            });
            this._qrTab.add_child(warning);
        }

        content.add_child(this._qrTab);

        // Manual Tab content
        this._manualTab = new St.BoxLayout({
            vertical: true,
            styleClass: 'totp-tab-content',
        });
        this._manualTab.hide();

        // Issuer field
        const issuerLabel = new St.Label({
            text: 'Service/Issuer:',
            styleClass: 'totp-field-label',
        });
        this._manualTab.add_child(issuerLabel);

        this._issuerEntry = new St.Entry({
            hint_text: 'e.g., Google, GitHub',
            styleClass: 'totp-entry',
            can_focus: true,
        });
        this._manualTab.add_child(this._issuerEntry);

        // Account label field
        const labelLabel = new St.Label({
            text: 'Account (email/username):',
            styleClass: 'totp-field-label',
        });
        this._manualTab.add_child(labelLabel);

        this._labelEntry = new St.Entry({
            hint_text: 'e.g., user@example.com',
            styleClass: 'totp-entry',
            can_focus: true,
        });
        this._manualTab.add_child(this._labelEntry);

        // Secret field
        const secretLabel = new St.Label({
            text: 'Secret Key (Base32):',
            styleClass: 'totp-field-label',
        });
        this._manualTab.add_child(secretLabel);

        this._secretEntry = new St.Entry({
            hint_text: 'JBSWY3DPEHPK3PXP',
            styleClass: 'totp-entry',
            can_focus: true,
        });
        this._manualTab.add_child(this._secretEntry);

        // Add button
        this._addManualBtn = new St.Button({
            label: 'Add Account',
            styleClass: 'totp-dialog-button totp-dialog-button-primary',
        });
        this._addManualBtn.connect('clicked', () => this._onAddManual());
        this._manualTab.add_child(this._addManualBtn);

        content.add_child(this._manualTab);

        // Status message
        this._statusLabel = new St.Label({
            text: '',
            styleClass: 'totp-dialog-status',
        });
        content.add_child(this._statusLabel);

        this.contentLayout.add_child(content);

        // Close button
        this.addButton({
            label: 'Close',
            action: () => this.close(),
        });
    }

    _switchTab(tab) {
        this._currentTab = tab;

        if (tab === 'qr') {
            this._qrTab.show();
            this._manualTab.hide();
            this._qrTabBtn.add_style_class_name('totp-dialog-tab-active');
            this._manualTabBtn.remove_style_class_name('totp-dialog-tab-active');
        } else {
            this._qrTab.hide();
            this._manualTab.show();
            this._manualTabBtn.add_style_class_name('totp-dialog-tab-active');
            this._qrTabBtn.remove_style_class_name('totp-dialog-tab-active');
        }
    }

    async _onScanScreen() {
        this._statusLabel.text = 'Select screen area with QR code...';

        try {
            const result = await QRScanner.scanScreenArea();
            await this._handleQRResult(result);
        } catch (e) {
            this._statusLabel.text = `Error: ${e.message}`;
        }
    }

    async _onScanCamera() {
        this._statusLabel.text = 'Scanning with camera... (Press Ctrl+C to cancel)';

        try {
            const result = await QRScanner.scanCamera();
            await this._handleQRResult(result);
        } catch (e) {
            this._statusLabel.text = `Error: ${e.message}`;
        }
    }

    async _onUploadFile() {
        // Check for available file picker
        const hasZenity = QRScanner.isProgramAvailable('zenity');
        const hasKdialog = QRScanner.isProgramAvailable('kdialog');

        if (!hasZenity && !hasKdialog) {
            this._statusLabel.text = 'Error: Install zenity (or kdialog) to use file picker. Run: sudo apt install zenity';
            return;
        }

        // Temporarily close this dialog to allow file picker to work
        this.close();

        try {
            let proc;
            if (hasZenity) {
                proc = Gio.Subprocess.new(
                    ['zenity', '--file-selection', '--title=Select QR Code Image', '--file-filter=Images | *.png *.jpg *.jpeg *.gif *.bmp *.webp'],
                    Gio.SubprocessFlags.STDOUT_PIPE
                );
            } else {
                proc = Gio.Subprocess.new(
                    ['kdialog', '--getopenfilename', '', 'Images (*.png *.jpg *.jpeg *.gif *.bmp *.webp)'],
                    Gio.SubprocessFlags.STDOUT_PIPE
                );
            }

            const [success, stdout, stderr] = await proc.communicate_utf8_async(null, null);

            // Always reopen the dialog first
            this.open();

            if (!success || !stdout.trim()) {
                this._statusLabel.text = 'File selection cancelled';
                return;
            }

            const filePath = stdout.trim();
            log(`[TOTP] Selected file: ${filePath}`);

            this._statusLabel.text = 'Scanning image...';

            const result = await QRScanner.scanFile(filePath);
            log(`[TOTP] QR scan result: ${result}`);
            await this._handleQRResult(result);
        } catch (e) {
            log(`[TOTP] File upload error: ${e.message}`);
            this.open();
            this._statusLabel.text = `Error: ${e.message}`;
        }
    }

    async _handleQRResult(uri) {
        try {
            const params = parseOtpauthUri(uri);
            if (!params) {
                this._statusLabel.text = 'Invalid QR code format';
                return;
            }

            this._statusLabel.text = `Adding ${params.issuer || 'account'}...`;

            await AccountManager.addAccount({
                label: params.label || '',
                issuer: params.issuer || '',
                secret: params.secret,
                algorithm: params.algorithm || 'SHA1',
                digits: params.digits || 6,
                period: params.period || 30,
            });

            this._statusLabel.text = 'Account added successfully!';
            this.emit('account-added');

            // Close after a short delay
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this.close();
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            this._statusLabel.text = `Error: ${e.message}`;
        }
    }

    async _onAddManual() {
        const issuer = this._issuerEntry.get_text().trim();
        const label = this._labelEntry.get_text().trim();
        const secret = this._secretEntry.get_text().trim().replace(/\s/g, '');

        if (!secret) {
            this._statusLabel.text = 'Secret key is required';
            return;
        }

        try {
            this._statusLabel.text = 'Adding account...';

            await AccountManager.addAccount({
                label,
                issuer: issuer || 'Unknown',
                secret,
                algorithm: 'SHA1',
                digits: 6,
                period: 30,
            });

            this._statusLabel.text = 'Account added successfully!';
            this.emit('account-added');

            // Clear fields
            this._issuerEntry.set_text('');
            this._labelEntry.set_text('');
            this._secretEntry.set_text('');

            // Close after a short delay
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this.close();
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            this._statusLabel.text = `Error: ${e.message}`;
        }
    }
});
