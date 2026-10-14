import { describe, it, expect } from "vitest"
import { saveDraft, loadDraft, clearDraft, SIGNUP_DRAFT_KEY } from "./signup-draft"

function fakeStorage() {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

const MIN = 60_000

describe("signup draft", () => {
  it("round-trips email, name and view under pet10x.signup", () => {
    const s = fakeStorage()
    saveDraft(s, { email: "a@b.co", name: "Ana", view: "verify" }, 1000)
    expect(SIGNUP_DRAFT_KEY).toBe("pet10x.signup")
    expect(s.m.has("pet10x.signup")).toBe(true)
    expect(loadDraft(s, 1000 + MIN)).toEqual({ email: "a@b.co", name: "Ana", view: "verify", savedAt: 1000 })
  })

  it("expires after 30 minutes", () => {
    const s = fakeStorage()
    saveDraft(s, { email: "a@b.co", name: "", view: "form" }, 0)
    expect(loadDraft(s, 30 * MIN)).not.toBeNull()
    expect(loadDraft(s, 31 * MIN)).toBeNull()
  })

  it("returns null for bad JSON, a missing field or a malformed value", () => {
    const s = fakeStorage()
    const put = (v: string) => s.m.set(SIGNUP_DRAFT_KEY, v)
    expect(loadDraft(s, 0)).toBeNull()
    put("{nope")
    expect(loadDraft(s, 0)).toBeNull()
    put("null")
    expect(loadDraft(s, 0)).toBeNull()
    put(JSON.stringify({ email: "a@b.co", view: "form", savedAt: 0 }))
    expect(loadDraft(s, 0)).toBeNull() // no name
    put(JSON.stringify({ email: "not an email", name: "", view: "form", savedAt: 0 }))
    expect(loadDraft(s, 0)).toBeNull()
    put(JSON.stringify({ email: "a@b.co", name: "", view: "other", savedAt: 0 }))
    expect(loadDraft(s, 0)).toBeNull()
    put(JSON.stringify({ email: "a@b.co", name: "x".repeat(81), view: "form", savedAt: 0 }))
    expect(loadDraft(s, 0)).toBeNull()
    put(JSON.stringify({ email: "a@b.co", name: "", view: "form", savedAt: "0" }))
    expect(loadDraft(s, 0)).toBeNull()
  })

  it("never writes a password, even if one is passed in", () => {
    const s = fakeStorage()
    saveDraft(s, { email: "a@b.co", name: "Ana", view: "form", password: "Hunter2hunter2" } as never, 0)
    expect(s.m.get(SIGNUP_DRAFT_KEY)).not.toContain("Hunter2")
    expect(s.m.get(SIGNUP_DRAFT_KEY)).not.toContain("password")
  })

  it("ignores a password that someone put in storage by hand", () => {
    const s = fakeStorage()
    s.m.set(SIGNUP_DRAFT_KEY, JSON.stringify({ email: "a@b.co", name: "", view: "form", savedAt: 0, password: "x" }))
    expect(loadDraft(s, 0)).toEqual({ email: "a@b.co", name: "", view: "form", savedAt: 0 })
  })

  it("clearDraft removes it, and storage that throws never escapes", () => {
    const s = fakeStorage()
    saveDraft(s, { email: "a@b.co", name: "", view: "form" }, 0)
    clearDraft(s)
    expect(loadDraft(s, 0)).toBeNull()
    const boom = () => {
      throw new Error("denied")
    }
    expect(() => saveDraft({ setItem: boom }, { email: "a@b.co", name: "", view: "form" })).not.toThrow()
    expect(loadDraft({ getItem: boom }, 0)).toBeNull()
    expect(() => clearDraft({ removeItem: boom })).not.toThrow()
  })
})
