/**
 * Site-wide facts that appear in more than one place.
 *
 * The support address is printed on the legal pages, the help page and every
 * "contact us" link. One constant so they cannot disagree. NEXT_PUBLIC_ so it
 * is inlined at build time for client components too.
 */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@pet10x.com"

export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`

/** The date shown as "Last updated" on /terms and /privacy. Change it with the text. */
export const LEGAL_LAST_UPDATED = "October 7, 2026"
