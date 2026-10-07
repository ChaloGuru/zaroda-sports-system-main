import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LegalPage, type LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | Zaroda Sports Management System",
  description: "How Zaroda Sports collects, uses and protects personal data, including learners' data, under Kenya's Data Protection Act, 2019.",
  alternates: { canonical: "https://zarodasports.live/privacy" },
};

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          Zaroda Sports Management System (&ldquo;Zaroda Sports&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is provided by{" "}
          <strong>Zaroda Solutions</strong> in Kenya. It helps schools, sports associations and tournament organisers
          (&ldquo;organisers&rdquo;) run championships: registration, call rooms, results, rankings and promotions.
        </p>
        <p>
          We handle personal data in line with Kenya&rsquo;s <strong>Data Protection Act, 2019</strong> and its
          regulations.
        </p>
      </>
    ),
  },
  {
    id: "roles",
    title: "Our role and the organiser's role",
    body: (
      <>
        <p>
          <strong>Organisers decide what learner data to collect and why.</strong> When a school or organiser registers
          learners, team players or officials for a championship, the organiser is the <em>data controller</em> for that
          data and Zaroda Solutions is the <em>data processor</em>: we store and process it on the organiser&rsquo;s
          instructions to run the championship.
        </p>
        <p>
          <strong>We are the data controller</strong> for the accounts people create with us (name, email, phone), for
          subscription payments, and for messages sent through our contact form.
        </p>
      </>
    ),
  },
  {
    id: "data-we-collect",
    title: "What data we collect",
    body: (
      <>
        <p>
          <strong>Account holders</strong> (organisers, tournament admins, officials and team managers): name, email
          address, phone number, organisation name and county, password (stored only as a one-way hash), and the roles
          you hold in each championship.
        </p>
        <p>
          <strong>Learners and players</strong>, as entered by their school or organiser: name, gender, school, bib and
          shirt number, the events and teams they are entered in, their results, and - to confirm identity and age -
          their <strong>date of birth, ID numbers (birth certificate entry number, and optionally KNEC assessment number
          and KEMIS UPI), photo</strong> and, if the school uploads one, a <strong>photo of their birth certificate or KNEC
          record</strong>.
        </p>
        <p>
          <strong>Face matching:</strong> when a learner&rsquo;s photo is taken, the browser works out a
          <strong> face descriptor</strong> - 128 numbers describing the face, not a picture - and sends it with the photo.
          It is used only to spot one child registered under two identities, or two children under one birth
          certificate. It is biometric data, so it is never shown to anyone or shared, and it is used only with the
          consent the school confirms on the signed nominal roll.
        </p>
        <p>
          <strong>Payments:</strong> for subscriptions paid by M-Pesa through TUMA, the M-Pesa phone number, amount,
          M-Pesa receipt number and payment status. For team entry fees paid through Paystack, the payer&rsquo;s email,
          the team&rsquo;s details and the payment status. We never see or store card numbers or M-Pesa PINs.
        </p>
        <p>
          <strong>Security and usage records:</strong> sign-in attempts (email, IP address, time, success), a record of
          changes made in the system (who changed what, and when), and IP addresses used for rate limiting.
        </p>
        <p>
          <strong>Contact form messages:</strong> your name, email, optional phone number and message.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use it",
    body: (
      <ul>
        <li>To run championships: registration, entering learners in events, call-room checks, results, rankings, medal tables and promotion to higher levels.</li>
        <li>
          To stop learner impersonation and over-age entries, using photos, dates of birth, ID numbers, uploaded documents
          and face matching. A learner&rsquo;s ID numbers are compared with other championships&rsquo; records (other
          organisers see only that a record doesn&rsquo;t match, never the learner&rsquo;s details), and anything that
          doesn&rsquo;t add up is shown to officials to check - the system never disqualifies a learner by itself.
        </li>
        <li>To publish results the organiser has chosen to make public.</li>
        <li>To create and secure accounts, send account set-up links, and protect the service against misuse.</li>
        <li>To take and confirm payments, and issue receipts.</li>
        <li>To answer your messages and support requests.</li>
        <li>To understand how people find and use the site (see Cookies below).</li>
      </ul>
    ),
  },
  {
    id: "legal-basis",
    title: "Our legal basis",
    body: (
      <>
        <p>
          We process account and payment data to <strong>perform our contract</strong> with you, and security records for
          our <strong>legitimate interest</strong> in keeping the service safe.
        </p>
        <p>
          Learner data is processed on the organiser&rsquo;s instructions. Organisers must have a lawful basis for it -
          for learners under 18, that normally means the <strong>consent of a parent or guardian</strong> as required by
          section 33 of the Data Protection Act - and must collect only what the championship needs.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Learners' data and children",
    body: (
      <>
        <p>Most learners are children, so their data gets extra protection:</p>
        <ul>
          <li>
            <strong>Photos, dates of birth and birth certificate numbers are never public.</strong> Only the
            championship&rsquo;s officials, and a team manager for their own school&rsquo;s learners, can see them.
            Photos and documents are stored inside our database, not at public web addresses.
          </li>
          <li>
            An official who doubts a learner&rsquo;s age or identity can challenge them. The learner&rsquo;s school sees the
            challenge, and a tournament admin decides it after seeing the original documents; every step is recorded.
          </li>
          <li>Call-room officials cannot change a learner&rsquo;s photo, so a photo can&rsquo;t be swapped for whoever turns up.</li>
          <li>After registration closes, only the championship&rsquo;s tournament admins can change learners&rsquo; details, and every change is recorded.</li>
          <li>Publicly, a learner appears only by name, school, bib number and results - and only once the organiser publishes the championship.</li>
        </ul>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share data with",
    body: (
      <>
        <p>We do not sell personal data. We share it only as needed to run the service:</p>
        <ul>
          <li><strong>The championship&rsquo;s organiser and officials</strong>, according to their role.</li>
          <li><strong>Higher-level championships</strong>, when an organiser promotes a learner or team (for example from Zone to Sub-County): the learner&rsquo;s record, including photo and birth certificate number, goes with them.</li>
          <li><strong>The public</strong>, for results the organiser publishes.</li>
          <li><strong>Service providers</strong> who host or support the service for us: Vercel (website hosting and file storage), Neon (database), Resend (email), TUMA (M-Pesa payments), Paystack (card and team-fee payments) and Meta (site analytics, see Cookies).</li>
          <li><strong>Authorities</strong>, where the law requires it.</li>
        </ul>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Where data is stored",
    body: (
      <p>
        Our database is hosted in the European Union (Frankfurt, Germany), and our website and file storage run on
        Vercel&rsquo;s global network. These providers protect data with encryption in transit and at rest and are bound
        by data protection terms. By using Zaroda Sports you understand that data is transferred outside Kenya for this
        purpose, with safeguards in line with Part VI of the Data Protection Act.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep data",
    body: (
      <ul>
        <li><strong>Learners&rsquo; photos and uploaded documents</strong> are deleted automatically about six months after the championship ends - long enough for appeals and the rest of that season&rsquo;s levels. A learner who competes again next season has a new photo taken then.</li>
        <li><strong>Face descriptors</strong> are deleted automatically three years after the championship ends, so next season&rsquo;s photo can be matched against this season&rsquo;s.</li>
        <li><strong>Other championship data</strong> (learners&rsquo; names, dates of birth, birth certificate numbers, entries and results) is kept until the organiser deletes the championship or asks us to delete it. Past results stay available so rankings and promotions keep working.</li>
        <li><strong>Accounts</strong> are kept until you ask us to close them. Officials&rsquo; access to a championship&rsquo;s private data ends when their role expires after the championship.</li>
        <li><strong>Payment records</strong> are kept as long as the law requires for tax and accounting.</li>
        <li><strong>Sign-in records</strong> are deleted after 30 days, and rate-limiting records after one day.</li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "How we protect data",
    body: (
      <ul>
        <li>Passwords are stored as strong one-way hashes; repeated failed sign-ins are blocked.</li>
        <li>Every person sees only what their role allows, and every change is recorded in an audit log.</li>
        <li>Connections are encrypted (HTTPS), and the site uses strict browser security settings.</li>
        <li>Payment notifications are verified before any payment is recorded.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the Data Protection Act you have the right to:</p>
        <ul>
          <li>be told how your data is used, and get a copy of it;</li>
          <li>have wrong or out-of-date data corrected;</li>
          <li>have data deleted, or object to how it is processed;</li>
          <li>receive your data in a portable format.</li>
        </ul>
        <p>
          <strong>For a learner&rsquo;s data</strong>, a parent or guardian should first ask the school or organiser who
          registered the learner - they control that data and can correct or remove it. We will help them.{" "}
          <strong>For your own account</strong>, contact us directly.
        </p>
        <p>
          You can also complain to the{" "}
          <a href="https://www.odpc.go.ke" target="_blank" rel="noopener noreferrer">Office of the Data Protection Commissioner</a>{" "}
          (ODPC).
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and similar technologies",
    body: (
      <ul>
        <li><strong>Sign-in cookie</strong> - keeps you signed in. Essential; the site&rsquo;s accounts don&rsquo;t work without it.</li>
        <li><strong>Theme setting</strong> - remembers light or dark mode in your browser.</li>
        <li><strong>Meta Pixel</strong> - tells us how visitors reach and use the site, for example from Facebook. Meta may use cookies to do this. You can limit it through your Facebook ad settings or by blocking third-party cookies in your browser.</li>
      </ul>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as the service changes. We will change the date at the top, and tell account holders
        about significant changes.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    body: (
      <p>
        For privacy questions or requests, use our <Link href="/contacts">contact form</Link>, WhatsApp{" "}
        <a href="https://wa.me/254781230805">0781230805</a> or call <a href="tel:+254724282065">0724282065</a>. We aim to
        respond within 7 days, and to complete requests within the time the Data Protection Act allows.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      icon={ShieldCheck}
      title="Privacy Policy"
      updated="7 October 2026"
      intro={
        <p>
          This policy explains what personal data Zaroda Sports collects, why, who can see it, and the choices and rights
          you have - including how we protect the learners whose schools register them for championships.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
