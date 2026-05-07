// SPDX-License-Identifier: GPL-3.0-or-later
// Logo Fetcher — Automatically fetch site logos for services

import Gio from "gi://Gio";
import GLib from "gi://GLib";

// Common service mappings to their domains
const SERVICE_DOMAINS = {
  google: "google.com",
  github: "github.com",
  facebook: "facebook.com",
  twitter: "twitter.com",
  amazon: "amazon.com",
  microsoft: "microsoft.com",
  apple: "apple.com",
  reddit: "reddit.com",
  linkedin: "linkedin.com",
  instagram: "instagram.com",
  discord: "discord.com",
  slack: "slack.com",
  dropbox: "dropbox.com",
  zoom: "zoom.com",
  notion: "notion.so",
  trello: "trello.com",
  asana: "asana.com",
  figma: "figma.com",
  github: "github.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
  jira: "jira.com",
  confluence: "confluence.com",
  aws: "aws.amazon.com",
  azure: "azure.microsoft.com",
  heroku: "heroku.com",
  digitalocean: "digitalocean.com",
  linode: "linode.com",
  stripe: "stripe.com",
  paypal: "paypal.com",
  twilio: "twilio.com",
  sendgrid: "sendgrid.com",
  mailchimp: "mailchimp.com",
  okta: "okta.com",
  auth0: "auth0.com",
  lastpass: "lastpass.com",
  1password: "1password.com",
  bitwarden: "bitwarden.com",
  dashlane: "dashlane.com",
};

/**
 * Fetch logo URL for a given service/issuer name or site URL
 * Uses DuckDuckGo's icon API as the primary source
 * 
 * @param {string} issuerOrUrl - Service name, domain, or full URL
 * @returns {string|null} Logo URL or null if not found
 */
export function getLogoUrl(issuerOrUrl) {
  if (!issuerOrUrl) return null;

  // Normalize input
  const normalized = issuerOrUrl.toLowerCase().trim();

  // Handle full URLs
  if (
    normalized.includes("http://") ||
    normalized.includes("https://") ||
    normalized.includes("www.")
  ) {
    try {
      // Extract domain from URL
      let domain = normalized;
      
      // Remove protocol
      domain = domain.replace(/^https?:\/\//, '');
      // Remove www.
      domain = domain.replace(/^www\./, '');
      // Remove path
      domain = domain.split('/')[0];
      // Remove port
      domain = domain.split(':')[0];
      
      return getDuckDuckGoLogoUrl(domain);
    } catch (e) {
      return null;
    }
  }

  // Check if it's a domain (has a dot)
  if (normalized.includes('.')) {
    return getDuckDuckGoLogoUrl(normalized);
  }

  // Check our service mapping first
  const domain = SERVICE_DOMAINS[normalized] || normalized;

  // Validate it looks like a domain or service name
  if (!domain.includes(".") && !domain.match(/^[a-z0-9\-]+$/i)) {
    return null;
  }

  return getDuckDuckGoLogoUrl(domain);
}

/**
 * Get logo URL from DuckDuckGo's icon service
 * @private
 */
function getDuckDuckGoLogoUrl(domain) {
  if (!domain) return null;
  // DuckDuckGo provides favicons at: https://icons.duckduckgo.com/ip3/{domain}.ico
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

/**
 * Asynchronously fetch and validate a logo URL
 * Returns the URL if the image is accessible, null otherwise
 * 
 * @param {string} issuerOrUrl - Service name, domain, or full site URL
 * @returns {Promise<string|null>} Logo URL or null
 */
export async function fetchLogoUrl(issuerOrUrl) {
  const logoUrl = getLogoUrl(issuerOrUrl);
  if (!logoUrl) return null;

  try {
    // Attempt to validate the URL by checking if it's accessible
    const file = Gio.File.new_for_uri(logoUrl);
    const cancellable = Gio.Cancellable.new();

    // Set a timeout for the check
    const timeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      2000,
      () => {
        cancellable.cancel();
        return false;
      }
    );

    try {
      await new Promise((resolve, reject) => {
        file.query_info_async(
          Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
          Gio.FileQueryInfoFlags.NONE,
          GLib.PRIORITY_DEFAULT,
          cancellable,
          (file, result) => {
            GLib.source_remove(timeoutId);
            try {
              file.query_info_finish(result);
              resolve(logoUrl);
            } catch (e) {
              reject(e);
            }
          }
        );
      });
      return logoUrl;
    } catch (e) {
      GLib.source_remove(timeoutId);
      // Logo URL is not accessible, return null
      return null;
    }
  } catch (e) {
    // Return the URL anyway - worst case it shows a broken image
    // Better UX than no logo
    return logoUrl;
  }
}

/**
 * Get service suggestion from user input (for autocomplete-like features)
 * Returns null if no match found
 * 
 * @param {string} input - Partial service name
 * @returns {string|null} Matched service name
 */
export function getSuggestion(input) {
  if (!input || input.length < 2) return null;

  const normalized = input.toLowerCase();
  const matches = Object.keys(SERVICE_DOMAINS).filter((service) =>
    service.startsWith(normalized)
  );

  return matches.length > 0 ? matches[0] : null;
}
