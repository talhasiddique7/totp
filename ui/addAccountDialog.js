// SPDX-License-Identifier: GPL-3.0-or-later
// Add Account Dialog — Modal dialog for adding TOTP accounts

import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

import * as AccountManager from "../lib/accountManager.js";
import * as QRScanner from "../lib/qrScanner.js";
import * as LogoFetcher from "../lib/logoFetcher.js";
import { parseOtpauthUri } from "../lib/otpauth.js";

export const AddAccountDialog = GObject.registerClass(
  {
    Signals: {
      "account-added": {},
      "account-updated": {},
    },
  },
  class AddAccountDialog extends ModalDialog.ModalDialog {
    _init(account = null) {
      super._init({
        styleClass: "totp-add-account-dialog",
        destroyOnClose: true,
      });

      this._editingAccount = account;
      this._currentTab = "manual";
      this._selectedLogoUrl = null;
      this._logoFetchTimeoutId = 0;
      this._buildUI();
      this._switchTab("manual");
      this._populateFromAccount();
    }

    _buildUI() {
      const content = new St.BoxLayout({
        vertical: true,
        styleClass: "totp-dialog-content",
      });

      // Title
      const title = new St.Label({
        text: this._editingAccount ? "Edit Account" : "Add Account",
        styleClass: "totp-dialog-title",
      });
      content.add_child(title);

      // Tab buttons
      const tabBox = new St.BoxLayout({
        styleClass: "totp-dialog-tabs",
      });

      this._manualTabBtn = new St.Button({
        label: "Manual Entry",
        styleClass: "totp-dialog-tab totp-dialog-tab-active",
      });
      this._manualTabBtn.connect("clicked", () => this._switchTab("manual"));
      tabBox.add_child(this._manualTabBtn);

      content.add_child(tabBox);

      // QR Scanning - Coming Soon (blocked)
      const comingSoonBox = new St.BoxLayout({
        vertical: true,
        styleClass: "totp-coming-soon-box",
      });
      const comingSoonLabel = new St.Label({
        text: "📱 QR Code Scanning - Coming Soon",
        styleClass: "totp-coming-soon-label",
      });
      comingSoonBox.add_child(comingSoonLabel);
      content.add_child(comingSoonBox);

      // Manual Tab content
      this._manualTab = new St.BoxLayout({
        vertical: true,
        styleClass: "totp-tab-content",
      });
      this._manualTab.hide();

      // Issuer field
      const issuerLabel = new St.Label({
        text: "Service/Issuer:",
        styleClass: "totp-field-label",
      });
      this._manualTab.add_child(issuerLabel);

      this._issuerEntry = new St.Entry({
        hint_text: "e.g., Google, GitHub",
        styleClass: "totp-entry",
        can_focus: true,
      });
      this._issuerEntry.connect("text-changed", () => this._onIssuerChanged());
      this._manualTab.add_child(this._issuerEntry);

      // Logo preview
      this._logoPreview = new St.Bin({
        style_class: "totp-logo-preview",
        visible: false,
      });
      this._manualTab.add_child(this._logoPreview);

      // Account label field
      const labelLabel = new St.Label({
        text: "Account (email/username):",
        styleClass: "totp-field-label",
      });
      this._manualTab.add_child(labelLabel);

      this._labelEntry = new St.Entry({
        hint_text: "e.g., user@example.com",
        styleClass: "totp-entry",
        can_focus: true,
      });
      this._manualTab.add_child(this._labelEntry);

      // Site URL field
      const siteUrlLabel = new St.Label({
        text: "Site URL (optional):",
        styleClass: "totp-field-label",
      });
      this._manualTab.add_child(siteUrlLabel);

      this._siteUrlEntry = new St.Entry({
        hint_text: "e.g., https://google.com or google.com",
        styleClass: "totp-entry",
        can_focus: true,
      });
      this._siteUrlEntry.connect("text-changed", () =>
        this._onSiteUrlChanged(),
      );
      this._manualTab.add_child(this._siteUrlEntry);

      const siteUrlHint = new St.Label({
        text: "Website URL for logo retrieval and reference",
        styleClass: "totp-hint-text",
      });
      this._manualTab.add_child(siteUrlHint);

      // Secret field (Field 3)
      const secretLabel = new St.Label({
        text: "Secret Key (Base32):",
        styleClass: "totp-field-label",
      });
      this._manualTab.add_child(secretLabel);

      this._secretEntry = new St.Entry({
        hint_text: "JBSWY3DPEHPK3PXP",
        styleClass: "totp-entry",
        can_focus: true,
        x_expand: true,
      });
      this._manualTab.add_child(this._secretEntry);

      const secretHint = new St.Label({
        text: "Required: Base32 encoded string (usually provided by the service)",
        styleClass: "totp-hint-text",
      });
      this._manualTab.add_child(secretHint);

      // Algorithm selection (Field 4)
      const algorithmLabel = new St.Label({
        text: "Algorithm:",
        styleClass: "totp-field-label",
      });
      this._manualTab.add_child(algorithmLabel);

      const algorithmBox = new St.BoxLayout({
        styleClass: "totp-algorithm-box",
      });

      this._algorithmDropdown = new St.Button({
        label: "SHA1",
        styleClass: "totp-dropdown-button",
        can_focus: true,
        x_expand: true,
      });
      this._selectedAlgorithm = "SHA1";
      this._updateAlgorithmLabel();
      this._algorithmDropdown.connect("clicked", () =>
        this._showAlgorithmMenu(),
      );
      algorithmBox.add_child(this._algorithmDropdown);
      this._manualTab.add_child(algorithmBox);

      const algorithmHint = new St.Label({
        text: "Click to cycle through: SHA1 → SHA256 → SHA512",
        styleClass: "totp-hint-text",
      });
      this._manualTab.add_child(algorithmHint);

      // Code Length dropdown (Digits field)
      const digitsLabel = new St.Label({
        text: "Code Length (digits):",
        styleClass: "totp-field-label",
      });
      this._manualTab.add_child(digitsLabel);

      const digitsBox = new St.BoxLayout({
        styleClass: "totp-digits-box",
      });

      this._digitsDropdown = new St.Button({
        label: "6",
        styleClass: "totp-dropdown-button",
        can_focus: true,
        x_expand: true,
      });
      this._selectedDigits = 6;
      this._updateDigitsLabel();
      this._digitsDropdown.connect("clicked", () => this._showDigitsMenu());
      digitsBox.add_child(this._digitsDropdown);
      this._manualTab.add_child(digitsBox);

      const digitsHint = new St.Label({
        text: "Click to toggle: 6 ↔ 8 digits",
        styleClass: "totp-hint-text",
      });
      this._manualTab.add_child(digitsHint);

      // Time Period dropdown (Field 6)
      const periodLabel = new St.Label({
        text: "Time Period (seconds):",
        styleClass: "totp-field-label",
      });
      this._manualTab.add_child(periodLabel);

      const periodBox = new St.BoxLayout({
        styleClass: "totp-period-box",
      });

      this._periodDropdown = new St.Button({
        label: "30",
        styleClass: "totp-dropdown-button",
        can_focus: true,
        x_expand: true,
      });
      this._selectedPeriod = 30;
      this._updatePeriodLabel();
      this._periodDropdown.connect("clicked", () => this._showPeriodMenu());
      periodBox.add_child(this._periodDropdown);
      this._manualTab.add_child(periodBox);

      const periodHint = new St.Label({
        text: "Click to cycle: 30 → 60 seconds",
        styleClass: "totp-hint-text",
      });
      this._manualTab.add_child(periodHint);

      // Save button
      this._addManualBtn = new St.Button({
        label: this._editingAccount ? "Save Changes" : "Add Account",
        styleClass: "totp-dialog-button totp-dialog-button-primary",
      });
      this._addManualBtn.connect("clicked", () => this._onAddManual());
      this._manualTab.add_child(this._addManualBtn);

      content.add_child(this._manualTab);

      // Status message
      this._statusLabel = new St.Label({
        text: "",
        styleClass: "totp-dialog-status",
      });
      content.add_child(this._statusLabel);

      this.contentLayout.add_child(content);

      // Close button
      this.addButton({
        label: "Close",
        action: () => this.close(),
      });
    }

    _switchTab(tab) {
      this._currentTab = tab;

      // Only manual entry is available now
      this._manualTab.show();
      this._manualTabBtn.add_style_class_name("totp-dialog-tab-active");
    }

    _populateFromAccount() {
      if (!this._editingAccount) {
        return;
      }

      const account = this._editingAccount;
      this._issuerEntry.set_text(account.issuer || "");
      this._labelEntry.set_text(account.label || "");
      this._siteUrlEntry.set_text(account.siteUrl || "");
      this._selectedAlgorithm = account.algorithm || "SHA1";
      this._selectedDigits = account.digits || 6;
      this._selectedPeriod = account.period || 30;

      this._secretEntry.set_text("");
      this._secretEntry.hint_text = "Leave blank to keep existing secret";

      if (account.logoUrl) {
        this._selectedLogoUrl = account.logoUrl;
        this._showLogoPreview(account.logoUrl);
      }

      this._updateAlgorithmLabel();
      this._updateDigitsLabel();
      this._updatePeriodLabel();
    }

    _onIssuerChanged() {
      const issuer = this._issuerEntry.text.trim();

      // Clear existing timeout
      if (this._logoFetchTimeoutId) {
        GLib.source_remove(this._logoFetchTimeoutId);
        this._logoFetchTimeoutId = 0;
      }

      if (!issuer || issuer.length < 2) {
        this._logoPreview.visible = false;
        this._selectedLogoUrl = null;
        return;
      }

      // Debounce logo fetching
      this._logoFetchTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        500,
        () => {
          this._logoFetchTimeoutId = 0;
          this._fetchLogo(issuer, null);
          return GLib.SOURCE_REMOVE;
        },
      );
    }

    _onSiteUrlChanged() {
      const siteUrl = this._siteUrlEntry.text.trim();

      // Clear existing timeout
      if (this._logoFetchTimeoutId) {
        GLib.source_remove(this._logoFetchTimeoutId);
        this._logoFetchTimeoutId = 0;
      }

      if (!siteUrl) {
        // If site URL is empty, try fetching from issuer
        const issuer = this._issuerEntry.text.trim();
        if (issuer && issuer.length >= 2) {
          this._logoFetchTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            500,
            () => {
              this._logoFetchTimeoutId = 0;
              this._fetchLogo(issuer, null);
              return GLib.SOURCE_REMOVE;
            },
          );
        } else {
          this._logoPreview.visible = false;
          this._selectedLogoUrl = null;
        }
        return;
      }

      // Debounce logo fetching with site URL
      this._logoFetchTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        500,
        () => {
          this._logoFetchTimeoutId = 0;
          this._fetchLogo(null, siteUrl);
          return GLib.SOURCE_REMOVE;
        },
      );
    }

    async _fetchLogo(issuer, siteUrl) {
      try {
        const logoUrl = await LogoFetcher.fetchLogoUrl(siteUrl || issuer);
        const currentIssuer = this._issuerEntry.text.trim();
        const currentSiteUrl = this._siteUrlEntry.text.trim();

        // Only update if the input hasn't changed
        if (
          (siteUrl && currentSiteUrl === siteUrl) ||
          (issuer && currentIssuer === issuer)
        ) {
          if (logoUrl) {
            this._selectedLogoUrl = logoUrl;
            this._showLogoPreview(logoUrl);
          }
        }
      } catch (e) {
        // Silently fail
      }
    }

    _showLogoPreview(logoUrl) {
      try {
        // For now, show a simple icon placeholder
        // Full image loading would require more complex handling
        this._logoPreview.child = new St.Icon({
          icon_name: "document-properties-symbolic",
          icon_size: 48,
          style_class: "totp-logo-icon",
        });
        this._logoPreview.visible = true;
      } catch (e) {
        this._logoPreview.visible = false;
      }
    }

    _updateAlgorithmLabel() {
      this._algorithmDropdown.set_label(`${this._selectedAlgorithm} ▼`);
    }

    _updateDigitsLabel() {
      this._digitsDropdown.set_label(`${this._selectedDigits} ▼`);
    }

    _updatePeriodLabel() {
      this._periodDropdown.set_label(`${this._selectedPeriod} ▼`);
    }

    _showAlgorithmMenu() {
      // Simple algorithm selection - cycle through options
      const algorithms = ["SHA1", "SHA256", "SHA512"];
      const currentIndex = algorithms.indexOf(this._selectedAlgorithm);
      const nextIndex = (currentIndex + 1) % algorithms.length;
      this._selectedAlgorithm = algorithms[nextIndex];
      this._updateAlgorithmLabel();
    }

    _showDigitsMenu() {
      // Cycle between 6 and 8 digits
      const digits = [6, 8];
      const currentIndex = digits.indexOf(this._selectedDigits);
      const nextIndex = (currentIndex + 1) % digits.length;
      this._selectedDigits = digits[nextIndex];
      this._updateDigitsLabel();
    }

    _showPeriodMenu() {
      // Cycle between 30 and 60 seconds
      const periods = [30, 60];
      const currentIndex = periods.indexOf(this._selectedPeriod);
      const nextIndex = (currentIndex + 1) % periods.length;
      this._selectedPeriod = periods[nextIndex];
      this._updatePeriodLabel();
    }

    // QR Scanning methods - COMING SOON (commented out)
    /*
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
    */

    async _onAddManual() {
      const issuer = this._issuerEntry.get_text().trim();
      const label = this._labelEntry.get_text().trim();
      const siteUrl = this._siteUrlEntry.get_text().trim();
      const secret = this._secretEntry.get_text().trim().replace(/\s/g, "");
      const algorithm = this._selectedAlgorithm || "SHA1";
      const digits = this._selectedDigits || 6;
      const period = this._selectedPeriod || 30;

      if (!this._editingAccount && !secret) {
        this._statusLabel.text = "Secret key is required";
        return;
      }

      try {
        const accountData = {
          label,
          issuer: issuer || "Unknown",
          siteUrl: siteUrl || null,
          algorithm,
          digits,
          period,
          logoUrl: this._selectedLogoUrl || null,
        };

        if (this._editingAccount) {
          this._statusLabel.text = "Saving changes...";
          await AccountManager.updateAccountWithSecret(
            this._editingAccount.id,
            accountData,
            secret || null,
          );
          this._statusLabel.text = "Account updated successfully!";
          this.emit("account-updated");
        } else {
          this._statusLabel.text = "Adding account...";
          await AccountManager.addAccount({
            ...accountData,
            secret,
          });
          this._statusLabel.text = "Account added successfully!";
          this.emit("account-added");
        }

        // Clear fields
        this._issuerEntry.set_text("");
        this._labelEntry.set_text("");
        this._siteUrlEntry.set_text("");
        this._secretEntry.set_text("");
        this._logoPreview.visible = false;
        this._selectedLogoUrl = null;

        // Close after a short delay
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          this.close();
          return GLib.SOURCE_REMOVE;
        });
      } catch (e) {
        this._statusLabel.text = `Error: ${e.message}`;
      }
    }
  },
);
