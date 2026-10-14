export type ReasonResult = { ok: true; value: string | null } | { ok: false; error: "required" | "too_long" }

/** A reason a person types before a consequential action. Whitespace is not a reason. */
export function validateReason(text: string, opts: { required: boolean; max?: number }): ReasonResult {
  const value = text.trim()
  if (value.length === 0) return opts.required ? { ok: false, error: "required" } : { ok: true, value: null }
  if (value.length > (opts.max ?? 2000)) return { ok: false, error: "too_long" }
  return { ok: true, value }
}
