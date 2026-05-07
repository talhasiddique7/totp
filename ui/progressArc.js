// SPDX-License-Identifier: GPL-3.0-or-later
// Progress Arc — Circular countdown timer widget
// Renders a circular arc that depletes as the TOTP period counts down.

import GObject from 'gi://GObject';
import St from 'gi://St';

const ACCENT_COLOR = { r: 0.10, g: 0.45, b: 0.91 };   // #1a73e8
const AMBER_COLOR  = { r: 0.91, g: 0.58, b: 0.04 };    // #e89406
const RED_COLOR    = { r: 0.80, g: 0.13, b: 0.13 };     // #cc2121

const ARC_SIZE = 32;
const LINE_WIDTH = 2.5;
const WARNING_THRESHOLD = 7; // seconds

/**
 * Interpolate between two colors.
 */
function lerpColor(c1, c2, t) {
    return {
        r: c1.r + (c2.r - c1.r) * t,
        g: c1.g + (c2.g - c1.g) * t,
        b: c1.b + (c2.b - c1.b) * t,
    };
}

/**
 * CircularProgressArc — A St.DrawingArea that renders a countdown arc.
 *
 * Usage:
 *   const arc = new ProgressArc(30);
 *   arc.setTimeRemaining(18);
 */
export const ProgressArc = GObject.registerClass(
class ProgressArc extends St.DrawingArea {
    _init(period = 30) {
        super._init({
            width: ARC_SIZE,
            height: ARC_SIZE,
            style_class: 'totp-progress-arc',
        });

        this._period = period;
        this._remaining = period;
        this._fraction = 1.0;

        this.connect('repaint', () => this._onRepaint());
    }

    /**
     * Update the remaining time and trigger a repaint.
     * @param {number} remaining - Seconds remaining in current period
     */
    setTimeRemaining(remaining) {
        this._remaining = Math.max(0, Math.min(remaining, this._period));
        this._fraction = this._remaining / this._period;
        this.queue_repaint();
    }

    /**
     * Get the current color based on time remaining.
     * @private
     */
    _getColor() {
        if (this._remaining <= 0) {
            return RED_COLOR;
        } else if (this._remaining <= WARNING_THRESHOLD) {
            const t = 1 - (this._remaining / WARNING_THRESHOLD);
            return lerpColor(AMBER_COLOR, RED_COLOR, t);
        } else if (this._remaining <= WARNING_THRESHOLD * 2) {
            const t = 1 - ((this._remaining - WARNING_THRESHOLD) / WARNING_THRESHOLD);
            return lerpColor(ACCENT_COLOR, AMBER_COLOR, t);
        }
        return ACCENT_COLOR;
    }

    /**
     * Cairo paint callback.
     * @private
     */
    _onRepaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - LINE_WIDTH;

        // Clear
        cr.setOperator(0); // Cairo.Operator.CLEAR
        cr.paint();
        cr.setOperator(2); // Cairo.Operator.OVER

        // Draw background track (subtle)
        cr.setLineWidth(LINE_WIDTH);
        cr.setLineCap(1); // Cairo.LineCap.ROUND
        cr.setSourceRGBA(0.5, 0.5, 0.5, 0.15);
        cr.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        cr.stroke();

        // Draw progress arc (clockwise from top)
        if (this._fraction > 0) {
            const color = this._getColor();
            cr.setSourceRGBA(color.r, color.g, color.b, 0.9);
            cr.setLineWidth(LINE_WIDTH);
            cr.setLineCap(1);

            const startAngle = -Math.PI / 2; // Top
            const endAngle = startAngle + (2 * Math.PI * this._fraction);
            cr.arc(centerX, centerY, radius, startAngle, endAngle);
            cr.stroke();
        }

        // Draw remaining seconds text in center
        cr.setSourceRGBA(0.85, 0.85, 0.85, 0.9);
        cr.selectFontFace('Sans', 0, 1); // NORMAL, BOLD
        cr.setFontSize(10);

        const text = `${this._remaining}`;
        const extents = cr.textExtents(text);
        cr.moveTo(
            centerX - extents.width / 2 - extents.xBearing,
            centerY - extents.height / 2 - extents.yBearing
        );
        cr.showText(text);

        cr.$dispose();
    }
});
