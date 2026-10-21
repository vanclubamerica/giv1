/**
 * Support page settings.
 *
 * Online giving is OFF until the organization sets up a reputable hosted
 * checkout (for example a Stripe Payment Link, PayPal Giving, Givebutter or
 * Zeffy page). This site never collects card details itself.
 *
 * Do not add a tax-deductibility statement unless the organization's status
 * has been confirmed in writing.
 */

export const support = {
  donations: {
    /** Full https:// link to a hosted donation page, or null. */
    url: null as string | null,
    /** Name of the hosted provider, shown next to the button, e.g. "Givebutter". */
    provider: null as string | null,
    /** Optional confirmed statement about tax status. Leave null if unknown. */
    taxStatement: null as string | null,
  },
};
