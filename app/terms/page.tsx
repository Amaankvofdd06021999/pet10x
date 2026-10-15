// COUNSEL REVIEW REQUIRED BEFORE LAUNCH. Written from what the product does on
// 2026-10-07; it has not been reviewed by a lawyer. The limitation-of-liability
// and governing-law sections in particular need a BC lawyer's wording. Bump
// LEGAL_LAST_UPDATED in lib/site.ts whenever this text changes.

import type { Metadata } from "next"
import Link from "next/link"
import { LegalList, LegalPage, LegalSection } from "@/components/legal/legal-page"
import { LEGAL_LAST_UPDATED, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site"

export const metadata: Metadata = {
  title: "Terms of Service — Pet10x",
  description: "The terms for using Pet10x: accounts, acceptable use, your content, the AI assistant, bylaw decisions and businesses.",
}

const link = "font-medium text-primary-text underline underline-offset-2"

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={LEGAL_LAST_UPDATED}
      intro={
        <p>
          These terms govern your use of Pet10x, a pet governance and community service for residential buildings
          operated by Park10x Services Inc. (&ldquo;Pet10x&rdquo;, &ldquo;we&rdquo;). By creating an account or using
          Pet10x you agree to them. Our{" "}
          <Link href="/privacy" className={link}>
            Privacy Policy
          </Link>{" "}
          explains how we handle personal information.
        </p>
      }
    >
      <LegalSection title="Who can use Pet10x">
        <LegalList>
          <li>You must be at least the age of majority where you live, or use Pet10x with a parent or guardian&apos;s permission.</li>
          <li>Building managers must be authorised by the building, strata corporation or property manager they act for.</li>
          <li>
            Businesses and clinics must be lawfully operating, and a clinic must hold the licences its work requires.
            A business stays out of owner search until Pet10x reviews it.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Your account">
        <LegalList>
          <li>Give accurate information, including your unit and your pets&apos; details, and keep it up to date.</li>
          <li>Keep your password to yourself. You are responsible for what happens under your account.</li>
          <li>Tell us at once if you think someone else has used your account.</li>
          <li>We may suspend or close an account that breaks these terms or puts others at risk.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Do not use Pet10x to:</p>
        <LegalList>
          <li>file false or malicious incident reports, or harass, threaten or discriminate against anyone;</li>
          <li>upload content you do not have the right to share, or another person&apos;s personal information without a lawful reason;</li>
          <li>impersonate a person, a building or a business, or misrepresent a pet&apos;s records or a document;</li>
          <li>try to reach data your role does not allow, interfere with the service, or scrape it;</li>
          <li>break any law, including animal welfare and privacy law.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You own what you post — pet records, photos, reports, community posts and reviews. You give Pet10x a
          licence to store, display and process it to provide the service: for example to show your pet&apos;s
          records to your building&apos;s managers, or a community post to your neighbours. The licence ends when
          the content or your account is deleted, except for content we must keep as described in the Privacy
          Policy (such as evidence on a submitted incident report). You are responsible for what you post, and we
          may remove content that breaks these terms.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" title="Disclaimers">
        <p>
          <strong>The AI assistant is not a veterinarian.</strong> It gives general information and helps you decide
          when to call one. It does not diagnose, prescribe or replace an examination, and its answers can be wrong.
          Always follow your veterinarian&apos;s advice.
        </p>
        <p>
          <strong>Pet10x is not an emergency service.</strong> In an emergency, call your vet, an emergency
          veterinary hospital or 911. Do not wait for an answer in the app. The emergency directory and QR codes help
          first responders but are not a life-safety system.
        </p>
        <p>
          <strong>Bylaw decisions belong to your building.</strong> Building rules, compliance requirements,
          warnings, fines, disputes and accommodation decisions are made by your building&apos;s managers or strata
          corporation. Pet10x provides the tools; it does not make, review or enforce those decisions and is not a
          party to them. Pet10x is not legal advice.
        </p>
        <p>
          <strong>Businesses and clinics are independent.</strong> Pet businesses and veterinary clinics on Pet10x
          are independent of us. They are responsible for their services, prices, bookings and advice. A
          &ldquo;verified&rdquo; badge means Pet10x reviewed the business&apos;s details; it is not an endorsement or
          a guarantee of its work.
        </p>
        <p>
          <strong>City reports.</strong> Pet10x does not file reports with any municipality. A city report records
          what you saw and shows who to contact.
        </p>
        <p>
          Pet10x is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent the law allows, we do
          not promise that it will be uninterrupted, error-free or fit for a particular purpose.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the extent the law allows, Pet10x and Park10x Services Inc. are not liable for indirect, incidental,
          special or consequential losses, or for loss of data, arising from your use of Pet10x; for decisions made
          by buildings, managers, businesses or clinics; or for the content other users post. Our total liability for
          any claim relating to Pet10x is limited to the greater of the amount you paid us in the 12 months before
          the claim and CAD $100. Nothing in these terms limits liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="Changes and ending">
        <p>
          We may change these terms. When we do, we will update the date at the top, and if a change is material we
          will tell you in the app or by email before it takes effect. You can stop using Pet10x and delete your
          account at any time from Profile &rsaquo; Privacy &amp; data.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of the Province of British Columbia and the federal laws of Canada
          that apply there. You and Pet10x agree to the jurisdiction of the courts of British Columbia.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms:{" "}
          <a href={SUPPORT_MAILTO} className={link}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
