// COUNSEL REVIEW REQUIRED BEFORE LAUNCH. This text was written from what the
// code does on 2026-10-07 (data collected, who can read it, processors, the
// purge routes' retention windows, export and delete). It has not been reviewed
// by a lawyer. If a feature changes what is collected, kept or shared, change
// this page in the same commit and bump LEGAL_LAST_UPDATED in lib/site.ts.

import type { Metadata } from "next"
import Link from "next/link"
import { LegalList, LegalPage, LegalSection, LegalSubhead } from "@/components/legal/legal-page"
import { LEGAL_LAST_UPDATED, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site"

export const metadata: Metadata = {
  title: "Privacy Policy — Pet10x",
  description: "What Pet10x collects, why, who can see it, how long it is kept, and your rights under PIPEDA and BC PIPA.",
}

const Mail = () => (
  <a href={SUPPORT_MAILTO} className="font-medium text-primary underline underline-offset-2">
    {SUPPORT_EMAIL}
  </a>
)

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={LEGAL_LAST_UPDATED}
      intro={
        <p>
          Pet10x is a pet governance and community service for residential buildings, operated by Park10x Services
          Inc. in British Columbia, Canada. This policy explains what personal information Pet10x collects, why, who
          can see it, how long it is kept, and how to see, export or delete it. It is written for Canada&apos;s{" "}
          <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA) and British Columbia&apos;s{" "}
          <em>Personal Information Protection Act</em> (PIPA).
        </p>
      }
    >
      <LegalSection title="What we collect">
        <LegalSubhead>Your account</LegalSubhead>
        <LegalList>
          <li>Your name, email address and password. The password is handled by our authentication provider and we never see it in plain text.</li>
          <li>
            When you sign up we email you a 6-digit code. Until you enter it, we hold only your email address, name
            and a scrambled copy of the code — not your password — and the code expires after 15 minutes.
          </li>
          <li>Optionally, a profile photo and a phone number.</li>
        </LegalList>

        <LegalSubhead>Your home and building</LegalSubhead>
        <LegalList>
          <li>The building you link to and your unit number, so your building&apos;s managers can see which pets live where.</li>
          <li>
            If you allow it, your device location, saved to your profile so nearby pet services can be sorted by
            distance. You can also attach your location to an incident or city report by tapping &ldquo;use my
            location&rdquo;.
          </li>
        </LegalList>

        <LegalSubhead>Your pets</LegalSubhead>
        <LegalList>
          <li>
            Pet profiles: name, species, breed, sex, date of birth, colour, weight, photos, allergies, conditions,
            medications and behavioural notes.
          </li>
          <li>Health records: vaccinations, documents you upload (such as licences, insurance and vet records), emergency contacts and your vet&apos;s details.</li>
          <li>A care log of meals, walks, medication and other entries you record, and reminders you set.</li>
        </LegalList>

        <LegalSubhead>Things you report or request</LegalSubhead>
        <LegalList>
          <li>
            Incident reports, including the description, location and any photos or videos you attach as evidence.
            You can report without an account; a report made without signing in is not linked to a profile.
          </li>
          <li>City (municipal) reports about animals, with the description, postal code and location you give.</li>
          <li>
            Accommodation requests (for example for an emotional support or service animal) and the supporting
            documents you attach, such as a letter from a health professional.
          </li>
          <li>Bylaw cases, warnings, fines, disputes and appeals that involve you or your pets.</li>
        </LegalList>

        <LegalSubhead>Community and services</LegalSubhead>
        <LegalList>
          <li>Community posts, comments, photos, lost-and-found notices and events you create.</li>
          <li>Bookings you make with pet businesses and clinics, and reviews you leave.</li>
          <li>
            If you run a business or clinic on Pet10x: your business details, locations, staff, services, schedule,
            customers and patients you record, invoices and verification requests.
          </li>
        </LegalList>

        <LegalSubhead>The AI assistant</LegalSubhead>
        <LegalList>
          <li>
            The questions you ask, the answers, and any photos you attach. Before you first use it we ask for your
            consent and record when you gave it.
          </li>
          <li>
            To make answers fit your animal, your question is sent with the selected pet&apos;s chart, vaccinations,
            medications and care log.
          </li>
        </LegalList>

        <LegalSubhead>Technical information</LegalSubhead>
        <LegalList>
          <li>Sign-in cookies that keep you signed in, and small settings stored in your browser (for example which pet or clinic you last selected).</li>
          <li>Anonymous page-view analytics from our hosting provider.</li>
          <li>Records of significant actions (for example a manager deciding a case, or a first responder opening a building&apos;s emergency directory), kept for accountability.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Why we use it">
        <LegalList>
          <li>To run your account and the features you use: pet profiles, care tracking, reminders, bookings, community and the assistant.</li>
          <li>To let your building&apos;s managers keep the pet registry, check compliance with building rules, handle incidents and decide accommodation requests.</li>
          <li>To give first responders what they need in an emergency at your building.</li>
          <li>To send you service emails: sign-up codes, welcome and invitation emails, password resets and requests from your building.</li>
          <li>To keep Pet10x secure, prevent abuse and keep records we are required to keep.</li>
        </LegalList>
        <p>We do not sell your personal information, and we do not use it for advertising.</p>
      </LegalSection>

      <LegalSection title="Who can see it">
        <LegalList>
          <li>
            <strong>Building managers</strong> of a building you link to can see your name, unit, your pets and their
            records, incident reports and bylaw cases involving you or your pets, and accommodation requests you send
            them with their documents. They cannot see your AI assistant conversations.
          </li>
          <li>
            <strong>Your neighbours</strong> in a linked building can see what you post to its community: posts,
            comments, photos, lost-and-found notices and events.
          </li>
          <li>
            <strong>Vets and clinics you share with.</strong> When you share a pet&apos;s records with a verified
            clinic, its clinical staff can read what you shared until you stop sharing, and the clinic can send
            records back to your pet&apos;s profile. In an emergency a verified clinic can open a limited emergency
            view of a pet — name, species, breed, sex, age, colour, weight, allergies, conditions, medications and
            the owner&apos;s name and phone — only by giving a reason; each use is logged and you are notified
            straight away.
          </li>
          <li>
            <strong>Businesses you book</strong> see your name and the booking details you give them.
          </li>
          <li>
            <strong>First responders</strong> with a valid emergency QR code issued by your building see, for each
            unit, the pets&apos; names, species, whether they are home, handling notes and one emergency phone
            number. They do not see your name or your pets&apos; medical history. Each view is logged.
          </li>
          <li>
            <strong>Pet10x administrators</strong> can access data to operate the service, verify businesses and
            respond to support requests.
          </li>
          <li>Anyone we are legally required to disclose information to.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Service providers">
        <p>We use these providers to run Pet10x. They process information on our behalf and only for that purpose:</p>
        <LegalList>
          <li><strong>Supabase</strong> — database, sign-in and file storage.</li>
          <li><strong>Vercel</strong> — website hosting and anonymous page-view analytics.</li>
          <li><strong>Resend</strong> — sending email.</li>
          <li><strong>Groq</strong> — running the AI assistant&apos;s language and image models.</li>
        </LegalList>
        <p>Some of these providers store or process information outside British Columbia and outside Canada, including in the United States, where it may be subject to the laws of that country.</p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <LegalList>
          <li>
            <strong>AI assistant photos</strong> are deleted automatically 7 days after they are attached, and at
            once if you delete the conversation. Deleting a conversation removes it from your list; its text stays
            with your account until the account is deleted.
          </li>
          <li>
            <strong>Incident evidence</strong> uploaded for a report that is never submitted is deleted after 24
            hours. Evidence on a submitted report is kept with the report as part of the building&apos;s record.
          </li>
          <li>
            <strong>Accommodation documents</strong> attached to a request that is never sent are deleted after 24
            hours. Once a request is decided or withdrawn, the document file is deleted 400 days later; the record
            that a document was provided and checked is kept.
          </li>
          <li><strong>Unverified sign-ups</strong> stop working when the 15-minute code expires, and are deleted by a daily sweep.</li>
          <li>Everything else is kept while your account is open, and removed when you delete it.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Your choices: export and delete">
        <p>
          <strong>Export.</strong> In the app, go to Profile &rsaquo; Privacy &amp; data &rsaquo; Export my data to
          download a file with your profile, your pets (including removed pets) with their vaccinations, documents
          and emergency contacts, your care log and your building links. For anything not in the file, email us.
        </p>
        <p>
          <strong>Delete.</strong> Profile &rsaquo; Privacy &amp; data &rsaquo; Delete account removes your account,
          your pets and their records, any business you own, your building links and your accommodation documents.
          If your account is tied to records other people rely on — for example a bylaw case, a submitted incident
          report or a booking — the app may not be able to finish the deletion on its own. It will tell you so, and
          we will complete it when you contact us, or explain what we must keep and why.
        </p>
        <p>
          You can stop sharing a pet&apos;s records with a clinic at any time from My vets &amp; sharing, delete an AI
          conversation, or simply stop using the assistant.
        </p>
      </LegalSection>

      <LegalSection id="pipeda" title="Your rights under PIPEDA and BC PIPA">
        <p>You have the right to:</p>
        <LegalList>
          <li>know what personal information we hold about you and how it has been used and disclosed;</li>
          <li>ask us to correct information that is inaccurate or incomplete;</li>
          <li>withdraw your consent, subject to legal or contractual limits — some features cannot work without the information they rely on;</li>
          <li>complain about how we handle your information.</li>
        </LegalList>
        <p>
          Send requests to <Mail />. We will respond within 30 days. If you are not satisfied with our answer, you
          can complain to the Office of the Privacy Commissioner of Canada or the Office of the Information and
          Privacy Commissioner for British Columbia.
        </p>
      </LegalSection>

      <LegalSection title="Safeguards">
        <p>
          Access to information is restricted by role at the database level: residents, managers, clinic staff and
          businesses can each read only what their role and relationship allow. Incident evidence, accommodation
          documents and AI assistant photos are stored privately and opened only through short-lived links. No system is perfectly secure; if a breach creates a real risk of
          significant harm we will notify you and the regulators as the law requires.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>Pet10x is not intended for children under 13, and we do not knowingly collect their information.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          We will update this page when what we collect or how we use it changes, and change the date at the top.
          Questions or requests: <Mail />. See also our{" "}
          <Link href="/terms" className="font-medium text-primary underline underline-offset-2">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
