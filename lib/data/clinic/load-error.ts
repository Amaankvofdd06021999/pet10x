import { dbErrorMessage } from "@/lib/data/db-error"
import { rememberFallback } from "@/lib/data/db-sentences"
import { userError } from "@/lib/user-error"

/** What dbErrorMessage logs against and answers with before it is named. */
const UNNAMED = "Couldn't load this. Try again."

/**
 * The sentence a failed `useLive` load shows. `what` is a plain noun phrase
 * ("patients", "the schedule") so a screen with several reads says which one
 * failed instead of "Couldn't load this."
 *
 * A loader throws either a sentence we wrote (kept as is) or something
 * unexpected. dbErrorMessage logs it and maps a known SQLSTATE to its
 * sentence; when it has nothing better to say, the answer is named here.
 * `what` is always a literal at the hook's call site, so the named sentence is
 * remembered like any other fallback and survives a screen's userError().
 */
export function loadErrorSentence(what: string, err: unknown): string {
  const sentence = err instanceof Error ? userError(err.message, "") : ""
  if (sentence) return sentence
  const answer = dbErrorMessage(err, UNNAMED)
  if (answer !== UNNAMED) return answer
  const named = `Couldn't load ${what}. Try again.`
  rememberFallback(named)
  return named
}
