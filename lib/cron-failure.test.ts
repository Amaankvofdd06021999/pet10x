import { describe, it, expect, vi, beforeEach } from "vitest"
import { cronFailure, cronFailureOf, CronStageError, inStage } from "./cron-failure"

const SENTENCE = "The job couldn't finish. The server log has the detail."

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("cronFailure", () => {
  it("returns the fixed sentence, the step and a SQLSTATE code", () => {
    expect(cronFailure("list_expired", { code: "42501", message: "nope" })).toEqual({
      error: SENTENCE,
      step: "list_expired",
      code: "42501",
    })
  })

  it("keeps a storage or application code in snake_case", () => {
    expect(cronFailure("remove_files", { code: "bucket_not_found" }).code).toBe("bucket_not_found")
  })

  it("drops a code that is neither shape", () => {
    expect(cronFailure("s", { code: "42501; drop table" }).code).toBeNull()
    expect(cronFailure("s", { code: "4250" }).code).toBeNull()
    expect(cronFailure("s", { code: "Not-Allowed" }).code).toBeNull()
    expect(cronFailure("s", { code: 42501 }).code).toBeNull()
  })

  it("has a null code when the error has none", () => {
    expect(cronFailure("s", new Error("x")).code).toBeNull()
    expect(cronFailure("s", "just a string").code).toBeNull()
    expect(cronFailure("s", null).code).toBeNull()
  })

  it("replaces a step that is not short snake_case with unknown", () => {
    expect(cronFailure("List Expired", new Error("x")).step).toBe("unknown")
    expect(cronFailure("a".repeat(41), new Error("x")).step).toBe("unknown")
    expect(cronFailure("", new Error("x")).step).toBe("unknown")
    expect(cronFailure("a".repeat(40), new Error("x")).step).toBe("a".repeat(40))
  })

  it("never echoes the message, even one naming a constraint", () => {
    const err = Object.assign(new Error('duplicate key value violates unique constraint "pets_owner_key"'), {
      code: "23505",
    })
    const out = cronFailure("save", err)
    expect(JSON.stringify(out)).not.toContain("pets_owner_key")
    expect(out.error).toBe(SENTENCE)
  })

  it("logs the step and the error", () => {
    const err = new Error("detail")
    cronFailure("save", err)
    expect(console.error).toHaveBeenCalledWith("save", err)
  })
})

describe("cronFailureOf", () => {
  it("names the stage a CronStageError carries and the code of its cause", () => {
    const out = cronFailureOf(new CronStageError("remove_files", { code: "bucket_not_found", message: "secret" }))
    expect(out).toEqual({ error: SENTENCE, step: "remove_files", code: "bucket_not_found" })
  })

  it("says unknown for anything else", () => {
    expect(cronFailureOf(new Error("x"))).toEqual({ error: SENTENCE, step: "unknown", code: null })
  })
})

describe("inStage", () => {
  it("passes a result through", async () => {
    await expect(inStage("read_rows", async () => 5)).resolves.toBe(5)
  })

  it("names the stage on a plain failure, and keeps a stage a failure already names", async () => {
    const plain = await inStage("read_rows", async () => { throw new Error("x") }).catch((e) => e)
    expect(cronFailureOf(plain).step).toBe("read_rows")
    const named = await inStage("outer_step", async () => { throw new CronStageError("inner_step", {}) }).catch((e) => e)
    expect(cronFailureOf(named).step).toBe("inner_step")
  })
})
