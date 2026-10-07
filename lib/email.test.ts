import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  DIGEST_MAX_ITEMS,
  clinicInviteHtml,
  escapeHtml,
  isPermanentEmailFailure,
  notificationDigestHtml,
  notificationEmailHtml,
  notificationUrl,
  sendClinicInviteEmail,
  sendNotificationDigest,
  sendNotificationEmail,
} from "./email"

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

describe("isPermanentEmailFailure", () => {
  it("is permanent for a message Resend rejects on its content", () => {
    expect(isPermanentEmailFailure({ statusCode: 422, name: "validation_error" })).toBe(true)
    expect(isPermanentEmailFailure({ statusCode: 400, name: "invalid_parameter" })).toBe(true)
    expect(isPermanentEmailFailure({ statusCode: 400, name: "missing_required_field" })).toBe(true)
  })

  it("is retryable for configuration, quota, rate and server failures", () => {
    expect(isPermanentEmailFailure({ statusCode: 403, name: "validation_error" })).toBe(false) // domain not verified
    expect(isPermanentEmailFailure({ statusCode: 401, name: "missing_api_key" })).toBe(false)
    expect(isPermanentEmailFailure({ statusCode: 429, name: "rate_limit_exceeded" })).toBe(false)
    expect(isPermanentEmailFailure({ statusCode: 500, name: "internal_server_error" })).toBe(false)
    expect(isPermanentEmailFailure({ statusCode: null, name: "application_error" })).toBe(false)
    expect(isPermanentEmailFailure(null)).toBe(false)
  })
})

describe("notification emails", () => {
  const hostile = {
    title: `<script>alert(1)</script> for "Rex"`,
    body: `Reason: <img src=x onerror=alert(2)> & more`,
    actionLabel: `<b>Open</b>`,
    actionTarget: `my-bookings`,
  }

  it("escapes the title, body and label of a single notification", () => {
    const html = notificationEmailHtml(hostile)
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("<b>Open</b>")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; for &quot;Rex&quot;")
    expect(html).toContain("Reason: &lt;img src=x onerror=alert(2)&gt; &amp; more")
  })

  it("links the button to the target's screen through ?target=", () => {
    expect(notificationUrl("my-vets:bills")).toMatch(/\/app\?target=my-vets%3Abills$/)
    expect(notificationUrl("business:bookings")).toMatch(/\/businessaccess\?target=business%3Abookings$/)
    expect(notificationUrl(null)).toMatch(/\/app$/)
    expect(notificationEmailHtml(hostile)).toContain("/app?target=my-bookings")
  })

  it("falls back to an honest label when the notification has none", () => {
    expect(notificationEmailHtml({ ...hostile, actionLabel: null })).toContain(">Open Pet10x</a>")
  })

  it("escapes every item of a digest, and stops listing at the cap", () => {
    const items = Array.from({ length: DIGEST_MAX_ITEMS + 3 }, (_, i) => ({ ...hostile, title: `<i>${i}</i>` }))
    const html = notificationDigestHtml(items, "alerts")
    expect(html).not.toContain("<i>")
    expect(html).toContain("&lt;i&gt;0&lt;/i&gt;")
    expect(html).not.toContain(`&lt;i&gt;${DIGEST_MAX_ITEMS}&lt;/i&gt;`)
    expect(html).toContain("and 3 more in the app")
    expect(html).toContain(`You have ${DIGEST_MAX_ITEMS + 3} new notifications`)
    expect(html).toContain("/app?target=alerts")
  })

  it("is suppressed under test, both shapes", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    expect(await sendNotificationEmail({ to: "a@b.test", item: hostile })).toEqual({ ok: false, suppressed: true })
    expect(await sendNotificationDigest({ to: "a@b.test", items: [hostile, hostile], ctaTarget: null })).toEqual({
      ok: false,
      suppressed: true,
    })
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

  it("marks a recipient Resend rejects as a permanent failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid `to` field", name: "validation_error", statusCode: 422 },
    })
    const { sendClinicInviteEmail: sendInvite } = await loadEnabled()
    expect(await sendInvite(opts)).toEqual({ ok: false, error: "Invalid `to` field", permanent: true })
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
