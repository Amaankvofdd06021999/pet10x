/**
 * Pet10x — the admin Municipalities form, validated.
 *
 * A municipality's postal prefixes decide which city a report matches, so a
 * typo here silently sends reports to the wrong place. Everything is checked
 * against what is allowed (a regex or a length range), never against a list
 * of what is not. Pure, so vitest pins it.
 */

const FSA = /^[A-Z][0-9][A-Z]$/
const PHONE = /^[+0-9 ()-]{7,20}$/

/**
 * "v6b, V6C  v5k" → ["V6B","V6C","V5K"]. Split on commas and whitespace,
 * uppercase, each token must be a Canadian forward sortation area (letter,
 * digit, letter). Duplicates collapse; order of first appearance is kept.
 */
export function parsePostalPrefixes(raw: string): { ok: true; value: string[] } | { ok: false; bad: string[] } {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.toUpperCase())
    .filter(Boolean)
  const bad = [...new Set(tokens.filter((t) => !FSA.test(t)))]
  if (bad.length > 0) return { ok: false, bad }
  return { ok: true, value: [...new Set(tokens)] }
}

export interface MunicipalityFormInput {
  name: string
  region: string
  prefixes: string
  phone: string
  url: string
}

export type MunicipalityFormField = "name" | "region" | "prefixes" | "phone" | "url"

export interface MunicipalityFormValue {
  name: string
  region: string
  postalPrefixes: string[]
  phone: string | null
  url: string | null
}

export function validateMunicipalityForm(
  input: MunicipalityFormInput,
): { ok: true; value: MunicipalityFormValue } | { ok: false; errors: Partial<Record<MunicipalityFormField, string>> } {
  const errors: Partial<Record<MunicipalityFormField, string>> = {}
  const name = input.name.trim()
  const region = input.region.trim()
  const phone = input.phone.trim()
  const url = input.url.trim()

  if (name.length < 2 || name.length > 80) errors.name = "Enter a name between 2 and 80 characters."
  if (region.length < 2 || region.length > 40) errors.region = "Enter a region between 2 and 40 characters, such as BC."

  const prefixes = parsePostalPrefixes(input.prefixes)
  if (!prefixes.ok) {
    errors.prefixes = `${prefixes.bad.join(", ")} ${prefixes.bad.length === 1 ? "is not a" : "are not"} valid postal prefix${prefixes.bad.length === 1 ? "" : "es"}. Use the first three characters, like V6B.`
  }

  if (phone && !PHONE.test(phone)) errors.phone = "Use 7 to 20 digits, spaces, + ( ) or -."

  if (url) {
    let ok = false
    try {
      const p = new URL(url).protocol
      ok = p === "https:" || p === "http:"
    } catch {
      ok = false
    }
    if (!ok) errors.url = "Enter a full web address starting with https://."
  }

  if (Object.keys(errors).length > 0 || !prefixes.ok) return { ok: false, errors }
  return {
    ok: true,
    value: { name, region, postalPrefixes: prefixes.value, phone: phone || null, url: url || null },
  }
}
