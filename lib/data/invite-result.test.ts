import { describe, expect, it } from "vitest"
import { inviteResultMessage } from "./invite-result"

const base = { email: "a@b.co", building: "Harbour Tower" }

describe("inviteResultMessage", () => {
  it("existing account, emailed: says they can manage and that we emailed them", () => {
    const m = inviteResultMessage({ ...base, existingAccount: true, emailSent: true })
    expect(m.title).toBe("Co-manager added")
    expect(m.description).toBe("a@b.co already had a Pet10x account and can now manage Harbour Tower. We emailed them.")
    expect(m.inviteUrl).toBeUndefined()
  })
  it("existing account, not emailed: never claims an email", () => {
    const m = inviteResultMessage({ ...base, existingAccount: true, emailSent: false })
    expect(m.description).toBe("a@b.co already had a Pet10x account and can now manage Harbour Tower.")
    expect(m.description).not.toMatch(/emailed/i)
  })
  it("new account, emailed: keeps the invite-sent copy", () => {
    expect(inviteResultMessage({ ...base, existingAccount: false, emailSent: true })).toEqual({
      title: "Co-manager invited",
      description: "Invite sent to a@b.co",
    })
  })
  it("new account, not emailed: hands back the link", () => {
    const m = inviteResultMessage({ ...base, existingAccount: false, emailSent: false, inviteUrl: "https://x/y" })
    expect(m.title).toBe("Manager added — email not sent")
    expect(m.inviteUrl).toBe("https://x/y")
  })
  it("new account, send refused: says the email failed", () => {
    const m = inviteResultMessage({ ...base, existingAccount: false, emailSent: false, inviteUrl: "u", emailFailed: true })
    expect(m.title).toBe("Manager added — the email failed")
  })
})

describe("inviteResultMessage noun", () => {
  it("admin console says Manager", () => {
    expect(inviteResultMessage({ ...base, existingAccount: true, emailSent: true, noun: "manager" }).title).toBe("Manager added")
    expect(inviteResultMessage({ ...base, existingAccount: false, emailSent: true, noun: "manager" }).title).toBe("Manager invited")
  })
  it("defaults to Co-manager", () => {
    expect(inviteResultMessage({ ...base, existingAccount: true, emailSent: true }).title).toBe("Co-manager added")
    expect(inviteResultMessage({ ...base, existingAccount: false, emailSent: true, noun: "co-manager" }).title).toBe("Co-manager invited")
  })
})
