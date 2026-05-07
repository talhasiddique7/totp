#!/bin/bash
# GNOME TOTP Authenticator — Install Script
# Usage: ./install.sh

set -e

EXTENSION_UUID="gnome-totp-authenticator@talhasiddique7"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/$EXTENSION_UUID"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   GNOME TOTP Authenticator — Installer   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Check GNOME Shell version ──
echo -e "${BLUE}[1/5]${NC} Checking GNOME Shell version..."
if command -v gnome-shell &> /dev/null; then
    GNOME_VERSION=$(gnome-shell --version | grep -oP '\d+' | head -1)
    echo -e "  ${GREEN}✓${NC} GNOME Shell $GNOME_VERSION detected"
    if [ "$GNOME_VERSION" -lt 45 ]; then
        echo -e "  ${RED}✗ GNOME Shell 45+ required. You have version $GNOME_VERSION.${NC}"
        exit 1
    fi
else
    echo -e "  ${YELLOW}⚠ Could not detect GNOME Shell version${NC}"
fi

# ── Check dependencies ──
echo -e "${BLUE}[2/5]${NC} Checking dependencies..."

MISSING_DEPS=()

# Check for libsecret
if ! pkg-config --exists libsecret-1 2>/dev/null; then
    if ! dpkg -l | grep -q gir1.2-secret 2>/dev/null; then
        MISSING_DEPS+=("gir1.2-secret-1")
    fi
fi
echo -e "  ${GREEN}✓${NC} libsecret (GNOME Keyring)"

# Check for zbar-tools (optional but recommended)
if ! command -v zbarimg &> /dev/null; then
    echo -e "  ${YELLOW}⚠${NC} zbar-tools not found (install for QR code scanning)"
    echo -e "    ${YELLOW}Recommended for better experience:${NC} sudo apt install zbar-tools"
else
    echo -e "  ${GREEN}✓${NC} zbar-tools (QR scanning)"
fi

# Check for glib-compile-schemas
if ! command -v glib-compile-schemas &> /dev/null; then
    echo -e "  ${RED}✗ glib-compile-schemas not found${NC}"
    MISSING_DEPS+=("libglib2.0-dev-bin")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo -e "\n  ${RED}Missing required dependencies:${NC}"
    echo -e "  Run: ${YELLOW}sudo apt install ${MISSING_DEPS[*]}${NC}"
    exit 1
fi

# ── Check source directory ──
if [ ! -d "$SOURCE_DIR" ]; then
    # Try current directory
    if [ -f "metadata.json" ]; then
        SOURCE_DIR="$(pwd)"
    else
        echo -e "${RED}✗ Extension source not found at $SOURCE_DIR${NC}"
        exit 1
    fi
fi

# ── Install extension ──
echo -e "${BLUE}[3/5]${NC} Installing extension to $EXTENSION_DIR..."

mkdir -p "$EXTENSION_DIR"

# Copy all files
cp -r "$SOURCE_DIR"/* "$EXTENSION_DIR/"
echo -e "  ${GREEN}✓${NC} Extension files copied"

# ── Compile GSettings schemas ──
echo -e "${BLUE}[4/5]${NC} Compiling GSettings schemas..."

if [ -d "$EXTENSION_DIR/schemas" ]; then
    glib-compile-schemas "$EXTENSION_DIR/schemas/"
    echo -e "  ${GREEN}✓${NC} Schemas compiled"
else
    echo -e "  ${YELLOW}⚠ No schemas directory found${NC}"
fi

# ── Enable extension ──
echo -e "${BLUE}[5/5]${NC} Enabling extension..."

if command -v gnome-extensions &> /dev/null; then
    gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Extension enabled"
else
    echo -e "  ${YELLOW}⚠ gnome-extensions CLI not found. Enable manually in Extensions app.${NC}"
fi

# ── Done ──
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Installation complete! 🎉          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}▶ Restart GNOME Shell:${NC}"
echo -e "    • Wayland: Log out and log back in"
echo -e "    • X11: Press Alt+F2, type 'r', press Enter"
echo ""
echo -e "  ${YELLOW}▶ Open preferences:${NC}"
echo -e "    gnome-extensions prefs $EXTENSION_UUID"
echo ""

# Create data directory
mkdir -p "$HOME/.local/share/gnome-totp-auth"
echo -e "  ${GREEN}✓${NC} Data directory created at ~/.local/share/gnome-totp-auth/"
