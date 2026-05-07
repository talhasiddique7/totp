# GNOME TOTP Authenticator — Development Guide

## Architecture

```
gnome-totp-authenticator@local/
├── extension.js          ← Entry point (enable/disable lifecycle)
├── prefs.js              ← Preferences window (Adw widgets)
├── metadata.json         ← Extension metadata & shell versions
├── stylesheet.css        ← All UI styling
├── schemas/              ← GSettings schema (compiled at install)
├── lib/                  ← Core logic (no UI dependencies)
│   ├── base32.js         ← RFC 4648 Base32 decoder
│   ├── hotp.js           ← RFC 4226 HOTP algorithm
│   ├── totp.js           ← RFC 6238 TOTP algorithm
│   ├── otpauth.js        ← otpauth:// URI parser
│   ├── secretStorage.js  ← GNOME Keyring (libsecret) wrapper
│   ├── accountManager.js ← Account CRUD & persistence
│   └── qrScanner.js      ← zbar subprocess wrapper
├── ui/                   ← Shell UI widgets
│   ├── panelButton.js    ← Top-bar indicator (PanelMenu.Button)
│   ├── mainPopup.js      ← Dropdown popup content
│   ├── accountRow.js     ← Single account display row
│   ├── addAccountDialog.js ← Modal add-account flow
│   ├── emptyState.js     ← Empty state placeholder
│   └── progressArc.js    ← Cairo countdown arc
├── icons/                ← Symbolic SVG icons
└── test/                 ← Unit tests
```

## Prerequisites

```bash
# Ubuntu 24.04+
sudo apt install gnome-shell-extensions gir1.2-secret-1 zbar-tools

# Development tools
sudo apt install gjs libglib2.0-dev-bin
```

## Development Workflow

### 1. Edit & Install

```bash
# After making changes, reinstall:
./install.sh

# Or manually copy changed files:
cp extension.js ~/.local/share/gnome-shell/extensions/gnome-totp-authenticator@local/
```

### 2. Restart GNOME Shell

```bash
# X11 only:
busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting...")'

# Wayland: Log out and back in
```

### 3. View Logs

```bash
# Extension logs
journalctl -f -o cat /usr/bin/gnome-shell

# Filter for TOTP extension
journalctl -f -o cat /usr/bin/gnome-shell | grep TOTP
```

### 4. Debug with Looking Glass

Press `Alt+F2` → type `lg` → Enter

Useful commands:
```javascript
// List extensions
Main.extensionManager.getUuids()

// Get extension object
const ext = Main.extensionManager.lookup('gnome-totp-authenticator@local')

// Check extension state
ext.state  // 1 = ENABLED, 2 = DISABLED, 3 = ERROR
```

## Running Tests

```bash
# Run TOTP algorithm tests
gjs -m gnome-totp-authenticator@local/test/totp.test.js

# Cross-validate with oathtool
oathtool --totp -b GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ

# Verify keyring storage
secret-tool search account-id <uuid>
```

## Key Design Decisions

### ES Modules (GNOME 45+)
All files use `import`/`export` syntax. No legacy `imports.gi` or `const X = imports.Y` patterns.

### Security Model
- `secretStorage.js` is the **only** module that interacts with GNOME Keyring
- `accountManager.js` delegates all secret operations to `secretStorage.js`
- The JSON file at `~/.local/share/gnome-totp-auth/accounts.json` contains **only metadata** — never secrets
- TOTP codes are generated on-demand and not cached

### Timer Architecture
- A single 1-second timer runs when the popup is open
- It calls `refresh()` on each `AccountRow`, which regenerates the TOTP code
- Timer stops when popup closes to save resources
- The countdown arc repaints on each tick

### Clipboard Security
- OTP codes copied via `St.Clipboard` (no subprocess)
- A 30-second timeout auto-clears the clipboard
- Notification shown on clear

## GSettings Schema

Compile after changes:
```bash
glib-compile-schemas gnome-totp-authenticator@local/schemas/
```

Inspect current values:
```bash
dconf dump /org/gnome/shell/extensions/totp-auth/
```

Reset all settings:
```bash
dconf reset -f /org/gnome/shell/extensions/totp-auth/
```

## Troubleshooting

### Extension Not Appearing
```bash
gnome-extensions list
gnome-extensions info gnome-totp-authenticator@local
gnome-extensions enable gnome-totp-authenticator@local
```

### Schema Errors
```bash
# Recompile schemas
glib-compile-schemas ~/.local/share/gnome-shell/extensions/gnome-totp-authenticator@local/schemas/
```

### Keyring Issues
```bash
# Check if keyring is unlocked
secret-tool search account-id test

# Store a test secret
secret-tool store --label="Test" account-id test <<< "TESTSECRET"
```
