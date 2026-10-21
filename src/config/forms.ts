/**
 * Form backend settings. Values come from environment variables at build
 * time (see .env.example). Both values are public by design: the endpoint is
 * a URL and the Turnstile site key is meant to be embedded in pages.
 */

const endpoint = (import.meta.env.PUBLIC_FORMS_ENDPOINT ?? '').trim();
const turnstileSiteKey = (import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '').trim();

export const forms = {
  endpoint,
  turnstileSiteKey,
  /** True when the site has somewhere real to send submissions. */
  enabled: /^https:\/\/.+/.test(endpoint) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(endpoint),
};
