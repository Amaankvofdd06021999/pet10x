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
    expect(res).toEqual({ suppressed: true })
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
