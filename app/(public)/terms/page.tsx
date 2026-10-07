import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { LegalPage, type LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use | Zaroda Sports Management System",
  description: "The terms for using Zaroda Sports to run championships, register learners and pay subscriptions.",
  alternates: { canonical: "https://zarodasports.live/terms" },
};

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreeing to these terms",
    body: (
      <>
        <p>
          These terms apply to everyone who uses Zaroda Sports Management System (&ldquo;Zaroda Sports&rdquo;), provided
          by <strong>Zaroda Solutions</strong> in Kenya. By creating an account, or by using the site to run or take part
          in a championship, you agree to them and to our <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          If you use Zaroda Sports for a school, association or other organisation, you confirm you are allowed to accept
          these terms for it.
        </p>
      </>
    ),
  },
  {
    id: "service",
    title: "The service",
    body: (
      <p>
        Zaroda Sports lets organisers set up championships, register schools, teams, learners and officials, run call
        rooms and heats, record results, publish rankings and medal tables, and promote qualifiers to higher levels. We
        keep improving it, so features may change; we will not remove a feature you have paid for during the period you
        paid for without a fair replacement or refund.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and roles",
    body: (
      <ul>
        <li>Give accurate details, and keep your password secret. You are responsible for what happens under your account.</li>
        <li>Organisers can add officials, tournament admins and team managers to their championships. Each person sees and does only what their role allows; roles end when the championship ends.</li>
        <li>Tell us straight away if you think someone else has used your account.</li>
      </ul>
    ),
  },
  {
    id: "organiser-duties",
    title: "Organisers' responsibilities for learner data",
    body: (
      <>
        <p>When you register learners, players or officials, you are responsible for that data. You agree to:</p>
        <ul>
          <li>have a lawful basis to share it - for learners under 18, normally the consent of a parent or guardian;</li>
          <li>enter only accurate details, and only what the championship needs;</li>
          <li>use clear face photos of the learner themselves, for identity checks only;</li>
          <li>correct or remove a learner&rsquo;s data when a parent, guardian or the learner asks and the law requires it;</li>
          <li>sign and keep the school nominal roll honestly - registering a learner under someone else&rsquo;s identity, or a learner over the age limit, is not allowed.</li>
        </ul>
      </>
    ),
  },
  {
    id: "results",
    title: "Results and decisions",
    body: (
      <p>
        Organisers and their officials enter results, check learners in, and decide disqualifications, qualifiers and
        promotions. Zaroda Sports records and calculates from what they enter; the championship&rsquo;s rules and its
        officials&rsquo; decisions govern disputes about results, eligibility or conduct, not Zaroda Solutions.
      </p>
    ),
  },
  {
    id: "payments",
    title: "Subscriptions and payments",
    body: (
      <>
        <ul>
          <li>Inter School-level championships are free.</li>
          <li>
            Each championship at Zone level and above needs its own subscription for that level, at the price shown on
            our <Link href="/pricing">pricing page</Link> when you pay. A subscription is paid by M-Pesa through TUMA,
            covers one championship, and stays with that championship.
          </li>
          <li>
            If you were charged in error - for example twice for the same subscription - contact us within 14 days and
            we will refund the extra charge. Otherwise a subscription is not refundable once it is active, except where
            the law requires.
          </li>
          <li>
            <strong>Team entry fees</strong> for open tournaments are set by the organiser and paid through Paystack
            directly to the organiser&rsquo;s bank account. Questions and refunds for entry fees are between the team and
            the organiser.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You must not:</p>
        <ul>
          <li>enter false identities or results, or impersonate a learner, school or official;</li>
          <li>upload photos or content you have no right to use, or anything unlawful, abusive or misleading;</li>
          <li>try to see data your role doesn&rsquo;t allow, get around security or rate limits, or disrupt the service;</li>
          <li>copy or scrape the site in bulk, or use it to send spam.</li>
        </ul>
        <p>We may suspend or close accounts that break these rules, and remove the content concerned.</p>
      </>
    ),
  },
  {
    id: "content",
    title: "Your content and ours",
    body: (
      <>
        <p>
          Organisers keep the rights to the data and content they enter. You let us store, process and display it to
          provide the service - including publishing results you make public, and carrying learners&rsquo; records to
          higher-level championships when you promote them.
        </p>
        <p>
          Zaroda Sports itself - its software, design, name and logo - belongs to Zaroda Solutions. You may not copy or
          reuse it without our written permission.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability",
    body: (
      <p>
        We work to keep Zaroda Sports available and your data safe, but we cannot promise uninterrupted service -
        maintenance, internet or provider outages can affect it. Keep your own copies of important documents, such as
        printed nominal rolls and results sheets, for championship days.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    body: (
      <p>
        Zaroda Sports is provided &ldquo;as is&rdquo;. As far as the law allows, Zaroda Solutions is not liable for
        indirect losses, or for losses caused by incorrect data entered by users, decisions made by championship
        officials, or events outside our reasonable control. Our total liability to you is limited to the amount you
        paid us in the 12 months before the claim. Nothing in these terms limits rights you have under Kenyan consumer
        law that cannot be limited.
      </p>
    ),
  },
  {
    id: "ending",
    title: "Closing your account",
    body: (
      <p>
        You can stop using Zaroda Sports at any time and ask us to close your account. Organisers can delete their
        championships, which removes the learners, entries and results in them. We may close accounts that break these
        terms, giving notice where we reasonably can.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and changes",
    body: (
      <>
        <p>
          These terms are governed by the laws of Kenya. We will try to resolve any dispute with you directly first;
          otherwise it goes to the courts of Kenya.
        </p>
        <p>
          We may update these terms. We will change the date at the top and tell account holders about significant
          changes; continuing to use Zaroda Sports after that means you accept the updated terms.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      icon={FileText}
      title="Terms of Use"
      updated="7 October 2026"
      intro={
        <p>
          These terms explain the rules for using Zaroda Sports - for organisers, officials, team managers and everyone
          who views results - and what you can expect from us.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
