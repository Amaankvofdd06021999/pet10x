import { describe, it, expect, vi, beforeEach } from "vitest"
import { clinicInviteHtml, escapeHtml, sendClinicInviteEmail } from "./email"

/* `server-only` throws outside a server bundle and is not installed for
   vitest; `resend` is never reached because email is suppressed under test
   (no key, NODE_ENV is not production). `vi.mock` is hoisted above the
   import. */
vi.mock("server-only", () => ({}))

describe("escapeHtml", () => {
  it("escapes the five characters that change meaning in HTML text or attributes", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
    )
  })

  it("escapes an ampersand first, so an existing entity is shown, not decoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;")
  })

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Dr. Ana Pérez — Westside Vet")).toBe("Dr. Ana Pérez — Westside Vet")
  })
})

describe("sendClinicInviteEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("is suppressed under test and never mails anyone", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const res = await sendClinicInviteEmail({
      to: "new@vet.test",
      inviteUrl: "https://example.test/invite?token=a&b=c",
      businessName: "<b>Paws</b>",
      inviterName: "Ann & Co",
      roleLabel: "Nurse / technician",
    })
    expect(res).toEqual({ ok: false, suppressed: true })
    expect(log).toHaveBeenCalledOnce()
  })
})

describe("clinicInviteHtml", () => {
  it("escapes every interpolated value, including the link", () => {
    const html = clinicInviteHtml({
      inviteUrl: `https://example.test/x?a=1&b="2"`,
      businessName: `<img src=x onerror=alert(1)>`,
      inviterName: `Eve "the" <admin>`,
      roleLabel: `Vet & <i>`,
    })
    expect(html).not.toContain("<img")
    expect(html).not.toContain("<admin>")
    expect(html).not.toContain("<i>")
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;")
    expect(html).toContain("Eve &quot;the&quot; &lt;admin&gt;")
    expect(html).toContain("Vet &amp; &lt;i&gt;")
    expect(html).toContain(`href="https://example.test/x?a=1&amp;b=&quot;2&quot;"`)
  })
})

describe("send, when email is enabled", () => {
  /* The module reads its key and flags at import, so each case re-imports it
     with a stubbed env and a fake Resend whose `emails.send` resolves the
     way the real one does: `{ data, error }`, never a throw on refusal. */
  const sendMock = vi.fn()

  async function loadEnabled() {
    vi.resetModules()
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_DEV_SEND", "1")
    vi.doMock("resend", () => ({
      Resend: class {
        emails = { send: sendMock }
      },
    }))
    return import("./email")
  }

  beforeEach(() => {
    sendMock.mockReset()
    vi.unstubAllEnvs()
  })

  const opts = {
    to: "new@vet.test",
    inviteUrl: "https://example.test/i",
    businessName: "Paws",
    inviterName: "Ann",
    roleLabel: "Nurse / technician",
  }

  it("reports a refused message as a failure, not as sent", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified", name: "validation_error" } })
    const { sendClinicInviteEmail: sendInvite } = await loadEnabled()
    expect(await sendInvite(opts)).toEqual({ ok: false, error: "domain not verified" })
    expect(err).toHaveBeenCalledOnce()
  })

  it("reports a thrown call as a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    sendMock.mockRejectedValue(new Error("network down"))
    const { sendClinicInviteEmail: sendInvite } = await loadEnabled()
    expect(await sendInvite(opts)).toEqual({ ok: false, error: "network down" })
  })

  it("reports a delivered message with its id", async () => {
    sendMock.mockResolvedValue({ data: { id: "em_1" }, error: null })
    const { sendClinicInviteEmail: sendInvite } = await loadEnabled()
    expect(await sendInvite(opts)).toEqual({ ok: true, id: "em_1" })
    expect(sendMock).toHaveBeenCalledOnce()
  })
})
