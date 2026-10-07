import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { LegalPage, LegalSection } from "@/components/legal/legal-page"
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site"

export const metadata: Metadata = {
  title: "Help & FAQ — Pet10x",
  description: "Answers for pet owners, building managers, businesses and clinics using Pet10x.",
}

/*
 * Every answer here describes a flow that exists in the app today. When a flow
 * changes, change its answer; when one is removed, remove it. An FAQ that
 * describes a button nobody can find is worse than no FAQ.
 */

const link = "font-medium text-primary underline underline-offset-2"

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-card px-4 py-3 open:pb-4">
      <summary className="cursor-pointer list-none text-[15px] font-semibold text-foreground marker:hidden">
        <span className="flex items-start justify-between gap-3">
          {q}
          <span aria-hidden className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-45">
            +
          </span>
        </span>
      </summary>
      <div className="mt-2 text-[14.5px] leading-relaxed text-foreground/80">{children}</div>
    </details>
  )
}

export default function HelpPage() {
  return (
    <LegalPage
      title="Help & FAQ"
      intro={
        <p>
          Quick answers, grouped by who you are. Can&apos;t find yours? Email{" "}
          <a href={SUPPORT_MAILTO} className={link}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      }
    >
      <LegalSection id="owners" title="Pet owners">
        <Faq q="How do I create an account?">
          Open{" "}
          <Link href="/app" className={link}>
            the app
          </Link>
          , choose Sign up, and enter your name, email and a password. We email you a 6-digit code; your account is
          created once you enter it. The code lasts 15 minutes and you can ask for a new one after a minute.
        </Faq>
        <Faq q="How do I join my building?">
          Enter the building code from your property management. Your request goes to the building&apos;s managers,
          who approve it. Your pets stay yours either way.
        </Faq>
        <Faq q="How do I add a pet and its records?">
          Add a pet from Home, then open it to add vaccinations, documents (licence, insurance, vet records) and
          emergency contacts. Your building&apos;s managers approve uploaded documents, or tell you why one was not
          accepted.
        </Faq>
        <Faq q="What can the AI assistant do?">
          It answers general questions about your pet using its records, and helps you decide when to see a vet. It
          is not a veterinarian and cannot diagnose. In an emergency, call your vet — do not wait for an answer.
        </Faq>
        <Faq q="How do I share records with my vet?">
          In Profile &rsaquo; My vets &amp; sharing, find a verified clinic and share a pet&apos;s records with it. You
          can stop sharing at any time. At reception, you can also read out a one-time desk code.
        </Faq>
        <Faq q="I received a warning or a fine. What now?">
          Open Profile &rsaquo; Violations &amp; Fines to see the case, the reason, and the deadline to contest it.
          Fines are not paid in Pet10x; the case explains how your building takes payment. Decisions are your
          building&apos;s, not Pet10x&apos;s.
        </Faq>
        <Faq q="How do I request an accommodation for a support or service animal?">
          Profile &rsaquo; Accommodation Requests. Choose the request type, attach your supporting letter, and send it.
          Your building&apos;s managers decide it.
        </Faq>
        <Faq q="How do I report an incident?">
          Use Report incident on the{" "}
          <Link href="/report" className={link}>
            report page
          </Link>
          . You don&apos;t need an account. You can attach photos, and report an animal to the city as well.
        </Faq>
        <Faq q="How do I remove a pet?">
          Open the pet and choose Remove pet. A pet that has passed away moves to your In memory list.
        </Faq>
        <Faq q="How do I export or delete my data?">
          Profile &rsaquo; Privacy &amp; data has Export my data and Delete account. See the{" "}
          <Link href="/privacy" className={link}>
            Privacy Policy
          </Link>{" "}
          for what each covers.
        </Faq>
      </LegalSection>

      <LegalSection id="managers" title="Building managers">
        <Faq q="How do I get access?">
          Pet10x invites building managers by email. Sign in from{" "}
          <Link href="/manager" className={link}>
            the manager page
          </Link>{" "}
          with the account you were invited on.
        </Faq>
        <Faq q="How do residents join my building?">
          Give them your building code. Their requests appear for you to approve.
        </Faq>
        <Faq q="How do I review pet documents?">
          Uploaded documents wait for your review. Approve them, or reject with a reason the resident will see.
        </Faq>
        <Faq q="How do warnings and fines work?">
          Open a case from an incident or the violations list. The ladder starts with a warning unless your building
          allows a direct fine (Settings &rsaquo; Pet Bylaws &amp; Policies). Residents can contest within the
          deadline; you record settlement in the case view.
        </Faq>
        <Faq q="Where do I set rules and the emergency QR code?">
          Settings has Pet Bylaws &amp; Policies (the requirements compliance is checked against), House Rules
          (written notices), and Emergency QR Code, where you issue and revoke the code first responders scan.
        </Faq>
      </LegalSection>

      <LegalSection id="businesses" title="Pet businesses">
        <Faq q="How do I list my business?">
          Sign up at{" "}
          <Link href="/businessaccess" className={link}>
            Pet10x for Business
          </Link>{" "}
          with your business name, category and email. We email you a code to confirm the address. New businesses
          are reviewed by Pet10x before they appear in owner search.
        </Faq>
        <Faq q="What can I manage?">
          Your storefront and services, bookings, promotions, earnings and reviews. Payments are recorded in the app;
          real payouts are not connected yet.
        </Faq>
      </LegalSection>

      <LegalSection id="clinics" title="Veterinary clinics">
        <Faq q="How do I set up my practice?">
          Sign in at{" "}
          <Link href="/clinic" className={link}>
            the clinic console
          </Link>{" "}
          and register your practice. You can run your calendar, customers, reminders, shop and billing straight away.
        </Faq>
        <Faq q="What do Registered, Listed and Verified mean?">
          Registered practices manage their own data. Listed practices also appear in owner search and take online
          bookings. Verified practices can also receive records owners share, send records back, and use emergency
          access. Pet10x sets the level after review.
        </Faq>
        <Faq q="How do I get verified?">
          Practice owners and managers see a Request verification button in the console while the practice is not
          verified. Pet10x reviews the request; if it is not approved, the reason is shown on the same banner.
        </Faq>
      </LegalSection>

      <LegalSection id="contact" title="Still stuck?">
        <p>
          Email{" "}
          <a href={SUPPORT_MAILTO} className={link}>
            {SUPPORT_EMAIL}
          </a>{" "}
          with what you were trying to do. See also the{" "}
          <Link href="/terms" className={link}>
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className={link}>
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
