// SPDX-License-Identifier: GPL-3.0-or-later
// GNOME TOTP Authenticator — Preferences Window

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TOTPPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_default_size(580, 640);

        // ── General Page ──
        const generalPage = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);

        // Display group
        const displayGroup = new Adw.PreferencesGroup({
            title: 'Display',
            description: 'Customize how OTP codes are shown',
        });
        generalPage.add(displayGroup);

        // Code font
        const fontRow = new Adw.ActionRow({
            title: 'Code Font',
            subtitle: 'Font family used for OTP digits',
        });
        const fontEntry = new Gtk.Entry({
            text: settings.get_string('code-font'),
            valign: Gtk.Align.CENTER,
            width_chars: 14,
        });
        fontEntry.connect('changed', () => {
            settings.set_string('code-font', fontEntry.get_text());
        });
        fontRow.add_suffix(fontEntry);
        displayGroup.add(fontRow);

        // Code size
        const sizeRow = new Adw.ActionRow({
            title: 'Code Size',
            subtitle: 'Font size in points for OTP digits',
        });
        const sizeSpinBtn = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 16,
                upper: 48,
                step_increment: 2,
                value: settings.get_int('code-size'),
            }),
            valign: Gtk.Align.CENTER,
        });
        settings.bind('code-size', sizeSpinBtn, 'value', Gio.SettingsBindFlags.DEFAULT);
        sizeRow.add_suffix(sizeSpinBtn);
        displayGroup.add(sizeRow);

        // Popup width
        const widthRow = new Adw.ActionRow({
            title: 'Popup Width',
            subtitle: 'Width of the dropdown panel (320–480 px)',
        });
        const widthSpinBtn = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 320,
                upper: 480,
                step_increment: 10,
                value: settings.get_int('popup-width'),
            }),
            valign: Gtk.Align.CENTER,
        });
        settings.bind('popup-width', widthSpinBtn, 'value', Gio.SettingsBindFlags.DEFAULT);
        widthRow.add_suffix(widthSpinBtn);
        displayGroup.add(widthRow);

        // Sort order
        const sortRow = new Adw.ComboRow({
            title: 'Sort Order',
            subtitle: 'How accounts are ordered in the list',
        });
        const sortModel = new Gtk.StringList();
        sortModel.append('Manual');
        sortModel.append('Alphabetical');
        sortModel.append('Last Used');
        sortRow.set_model(sortModel);
        const sortValues = ['manual', 'alphabetical', 'last-used'];
        const currentSort = settings.get_string('sort-order');
        sortRow.set_selected(Math.max(0, sortValues.indexOf(currentSort)));
        sortRow.connect('notify::selected', () => {
            settings.set_string('sort-order', sortValues[sortRow.get_selected()]);
        });
        displayGroup.add(sortRow);

        // ── Behavior group ──
        const behaviorGroup = new Adw.PreferencesGroup({
            title: 'Behavior',
            description: 'Notifications and clipboard settings',
        });
        generalPage.add(behaviorGroup);

        // Show notifications
        const notifRow = new Adw.SwitchRow({
            title: 'Show Notifications',
            subtitle: 'Notify when a code is copied or clipboard is cleared',
        });
        settings.bind('show-notifications', notifRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(notifRow);

        // Dark icons
        const darkRow = new Adw.SwitchRow({
            title: 'Dark Account Avatars',
            subtitle: 'Force dark mode for account avatar circles',
        });
        settings.bind('dark-icons', darkRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(darkRow);

        // ── Dependencies group ──
        const depsGroup = new Adw.PreferencesGroup({
            title: 'Optional Features',
            description: 'Enhance your experience with optional packages',
        });
        generalPage.add(depsGroup);

        // Check zbar-tools
        const hasZbar = GLib.find_program_in_path('zbarimg') !== null;
        const zbarRow = new Adw.ActionRow({
            title: 'QR Code Scanning',
            subtitle: hasZbar ? 'zbar-tools installed - QR scanning available' : 'zbar-tools not installed - QR scanning unavailable',
        });
        const zbarIcon = new Gtk.Image({
            icon_name: hasZbar ? 'check-circle-symbolic' : 'warning-symbolic',
        });
        zbarIcon.add_css_class(hasZbar ? 'success' : 'warning');
        zbarRow.add_suffix(zbarIcon);
        depsGroup.add(zbarRow);

        if (!hasZbar) {
            const installRow = new Adw.ActionRow({
                title: 'Install zbar-tools',
                subtitle: 'Run: sudo apt install zbar-tools',
                activatable: true,
            });
            installRow.add_suffix(new Gtk.Image({
                icon_name: 'go-next-symbolic',
            }));
            installRow.connect('activated', () => {
                const app = Gio.Application.get_default();
                if (app) {
                    app.activate_action('show-url', GLib.Variant.new_string('apt:zbar-tools'));
                }
            });
            depsGroup.add(installRow);
        }

        // ── Security Page ──
        const securityPage = new Adw.PreferencesPage({
            title: 'Security',
            icon_name: 'security-high-symbolic',
        });
        window.add(securityPage);

        const secGroup = new Adw.PreferencesGroup({
            title: 'Security',
            description: 'Screen lock and clock drift settings',
        });
        securityPage.add(secGroup);

        // Lock on screen lock
        const lockRow = new Adw.SwitchRow({
            title: 'Lock on Screen Lock',
            subtitle: 'Close popup and require re-auth after screen lock',
        });
        settings.bind('lock-on-screen-lock', lockRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        secGroup.add(lockRow);

        // Clock drift
        const driftRow = new Adw.ActionRow({
            title: 'Clock Drift Tolerance',
            subtitle: 'Number of time windows to check (0 = exact, 1 = ±30s)',
        });
        const driftSpinBtn = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 2,
                step_increment: 1,
                value: settings.get_int('clock-drift'),
            }),
            valign: Gtk.Align.CENTER,
        });
        settings.bind('clock-drift', driftSpinBtn, 'value', Gio.SettingsBindFlags.DEFAULT);
        driftRow.add_suffix(driftSpinBtn);
        secGroup.add(driftRow);

        // ── Backup group ──
        const backupGroup = new Adw.PreferencesGroup({
            title: 'Backup',
            description: 'Export and import account data',
        });
        securityPage.add(backupGroup);

        const backupRow = new Adw.SwitchRow({
            title: 'Enable Encrypted Backup Export',
            subtitle: 'Allow exporting accounts as encrypted backup file',
        });
        settings.bind('backup-enabled', backupRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        backupGroup.add(backupRow);

        // ── About Page ──
        const aboutPage = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);

        const aboutGroup = new Adw.PreferencesGroup({
            title: 'GNOME TOTP Authenticator',
            description: 'A native TOTP authenticator for the GNOME desktop.\n\nVersion 1.0.0\nLicense: GPL-3.0-or-later',
        });
        aboutPage.add(aboutGroup);

        const linksGroup = new Adw.PreferencesGroup({
            title: 'Links',
        });
        aboutPage.add(linksGroup);

        const rfcRow = new Adw.ActionRow({
            title: 'RFC 6238 (TOTP Standard)',
            subtitle: 'https://datatracker.ietf.org/doc/html/rfc6238',
            activatable: true,
        });
        rfcRow.add_suffix(new Gtk.Image({
            icon_name: 'go-next-symbolic',
        }));
        linksGroup.add(rfcRow);
    }
}
