/**
 * What a cron route answers with when a stage fails.
 *
 * The routes used to answer with `error.message`, which is a diagnostic (a
 * constraint name, a column) in a response body anyone holding the secret can
 * read. This says which stage failed and the error's code, and nothing else;
 * the detail goes to the server log.
 *
 * Positive grammar: a step is short snake_case, a code is a SQLSTATE or one of
 * our own / Storage's snake_case codes. Anything else is not echoed.
 */
const STEP = /^[a-z_]{1,40}$/
const SQLSTATE = /^[0-9A-Z]{5}$/
const NAMED_CODE = /^[a-z_]{1,40}$/

export const CRON_FAILED = "The job couldn't finish. The server log has the detail."

/**
 * `tag` is the route's own log prefix ("[care-reminders]"), so the log line
 * stays greppable: step names such as `remove_files` repeat across routes.
 */
export function cronFailure(
  step: string,
  err: unknown,
  tag?: string,
): { error: string; step: string; code: string | null } {
  console.error(tag ? `${tag} ${step}` : step, err)
  const raw = err && typeof err === "object" ? (err as { code?: unknown }).code : null
  const code = typeof raw === "string" && (SQLSTATE.test(raw) || NAMED_CODE.test(raw)) ? raw : null
  return { error: CRON_FAILED, step: STEP.test(step) ? step : "unknown", code }
}

/**
 * A failure that knows which stage it came from. A route throws one where a
 * stage fails (`throw new CronStageError("remove_files", error)`) and answers
 * once, at the top, with `cronFailureOf(err)`.
 */
export class CronStageError extends Error {
  constructor(
    readonly step: string,
    readonly detail: unknown,
  ) {
    super(`cron stage ${step} failed`)
  }
}

/** The body for a 500: the stage when one was named, else `fallbackStep`. */
export function cronFailureOf(
  err: unknown,
  tag?: string,
  fallbackStep = "unknown",
): { error: string; step: string; code: string | null } {
  return err instanceof CronStageError ? cronFailure(err.step, err.detail, tag) : cronFailure(fallbackStep, err, tag)
}

/** Run one stage; a failure that does not already name its stage is given this one. */
export async function inStage<T>(step: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    throw err instanceof CronStageError ? err : new CronStageError(step, err)
  }
}
